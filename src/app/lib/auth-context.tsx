import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { supabase, getMe, updateMe, AuthError, waitForWarmup } from "./api";
import { getDeviceTimezone } from "./timezone-utils";
import type { Session, User } from "@supabase/supabase-js";

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: any | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  /** Pending timezone change detected from device — null if none */
  pendingTimezoneChange: string | null;
  acceptTimezoneChange: () => Promise<void>;
  dismissTimezoneChange: () => void;
}

const AuthContext = createContext<AuthState>({
  session: null,
  user: null,
  profile: null,
  loading: true,
  refreshProfile: async () => {},
  pendingTimezoneChange: null,
  acceptTimezoneChange: async () => {},
  dismissTimezoneChange: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [pendingTimezoneChange, setPendingTimezoneChange] = useState<string | null>(null);
  const initDone = useRef(false);
  const tzPromptDismissed = useRef<string | null>(null);

  const refreshProfile = useCallback(async () => {
    try {
      const p = await getMe();
      setProfile(p);
    } catch (e) {
      console.error("Failed to fetch profile:", e);
      if (e instanceof AuthError || String(e).includes("Not authenticated")) {
        setSession(null);
        setUser(null);
        setProfile(null);
      }
    }
  }, []);

  // Check device timezone against profile and prompt if different
  const checkTimezone = useCallback((currentProfile: any) => {
    if (!currentProfile?.timezone) return;
    const deviceTz = getDeviceTimezone();
    if (deviceTz && deviceTz !== currentProfile.timezone && deviceTz !== tzPromptDismissed.current) {
      setPendingTimezoneChange(deviceTz);
    } else {
      setPendingTimezoneChange(null);
    }
  }, []);

  const acceptTimezoneChange = useCallback(async () => {
    if (!pendingTimezoneChange) return;
    try {
      await updateMe({ timezone: pendingTimezoneChange });
      await refreshProfile();
      setPendingTimezoneChange(null);
      tzPromptDismissed.current = null;
    } catch (e) {
      console.error("Failed to update timezone:", e);
    }
  }, [pendingTimezoneChange, refreshProfile]);

  const dismissTimezoneChange = useCallback(() => {
    tzPromptDismissed.current = pendingTimezoneChange;
    setPendingTimezoneChange(null);
  }, [pendingTimezoneChange]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        // Wait for the edge function to be warm before attempting profile fetch.
        // This runs concurrently with getSession, but getMe won't fire until warm.
        const warmupP = waitForWarmup();

        const { data: { session: s } } = await supabase.auth.getSession();
        if (cancelled) return;

        if (!s?.access_token) {
          setSession(null);
          setUser(null);
          setProfile(null);
          setLoading(false);
          initDone.current = true;
          return;
        }

        // Ensure warmup is done before hitting /me
        await warmupP;

        try {
          const p = await getMe();
          if (cancelled) return;
          const { data: { session: freshSession } } = await supabase.auth.getSession();
          setSession(freshSession ?? s);
          setUser(freshSession?.user ?? s.user ?? null);
          setProfile(p);
          // Check timezone on first load
          checkTimezone(p);
        } catch (e: any) {
          if (cancelled) return;
          const isNetworkError =
            e instanceof TypeError && (e.message === "Failed to fetch" || e.message.includes("NetworkError"));
          if (isNetworkError) {
            console.warn("Auth init: network error, keeping session — will retry profile fetch", e.message);
            setSession(s);
            setUser(s.user ?? null);
            // Schedule escalating background retries: 4s, 8s, 15s
            const retryDelays = [4000, 8000, 15000];
            const backgroundRetry = async (idx: number) => {
              if (cancelled || idx >= retryDelays.length) return;
              await new Promise((r) => setTimeout(r, retryDelays[idx]));
              if (cancelled) return;
              try {
                const p = await getMe();
                if (!cancelled) {
                  setProfile(p);
                  checkTimezone(p);
                }
              } catch (retryErr) {
                console.warn(`Auth init: background profile retry ${idx + 1}/${retryDelays.length} failed`, retryErr);
                backgroundRetry(idx + 1);
              }
            };
            backgroundRetry(0);
          } else {
            console.error("Auth init: session invalid, redirecting to login", e);
            setSession(null);
            setUser(null);
            setProfile(null);
          }
        }
      } catch (e) {
        if (cancelled) return;
        console.error("Auth init: unexpected error", e);
      }
      setLoading(false);
      initDone.current = true;
    }

    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // On token refresh failure or sign out, clear state immediately — don't attempt getMe
      if (event === "TOKEN_REFRESHED" && !session) {
        setSession(null);
        setUser(null);
        setProfile(null);
        return;
      }
      if (event === "SIGNED_OUT") {
        setSession(null);
        setUser(null);
        setProfile(null);
        return;
      }

      setSession(session);
      setUser(session?.user ?? null);
      if (session?.access_token) {
        if (!initDone.current) return;
        getMe().then((p) => {
          setProfile(p);
          checkTimezone(p);
        }).catch((e) => {
          console.error("onAuthStateChange: getMe failed", e);
          // If auth error, clear state to prevent stale UI
          if (e instanceof AuthError || String(e).includes("Not authenticated")) {
            setSession(null);
            setUser(null);
            setProfile(null);
          }
        });
      } else {
        setProfile(null);
      }
    });

    // Re-check timezone when the app regains focus
    const handleFocus = () => {
      if (initDone.current && profile) {
        checkTimezone(profile);
      }
    };
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") handleFocus();
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      window.removeEventListener("focus", handleFocus);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AuthContext.Provider value={{
      session, user, profile, loading, refreshProfile,
      pendingTimezoneChange, acceptTimezoneChange, dismissTimezoneChange,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);