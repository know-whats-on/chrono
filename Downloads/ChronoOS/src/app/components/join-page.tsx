import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router";
import { getSharedListPreview } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { SplashScreen } from "./splash-screen";

/**
 * /join/:listId — Shared list invite link landing page.
 *
 * Flow:
 * 1. Plays splash animation (skipped if user is already logged in)
 * 2. Fetches list preview (title + owner name) from the public endpoint
 * 3. Stores invite context in sessionStorage
 * 4a. If already authenticated → redirect straight to /track?tab=tasks (auto-join happens there)
 * 4b. If not authenticated → redirect to /login where a toast shows the invite info;
 *     after login the app redirects to /track?tab=tasks and auto-joins
 */
export function JoinPage() {
  const { listId } = useParams<{ listId: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [splashDone, setSplashDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  // Skip splash entirely for already-authenticated users
  useEffect(() => {
    if (!authLoading && user) {
      setSplashDone(true);
    }
  }, [authLoading, user]);

  // Once splash finishes (or was skipped) and auth state is known, fetch preview & redirect
  useEffect(() => {
    if (!splashDone || authLoading || !listId || processing) return;
    setProcessing(true);

    (async () => {
      try {
        const preview = await getSharedListPreview(listId);
        // Store invite context so tasks page can pick it up and auto-join
        sessionStorage.setItem(
          "chrono_pending_join",
          JSON.stringify({
            listId: preview.id,
            listTitle: preview.title,
            ownerName: preview.owner_name,
          })
        );

        if (user) {
          // Already logged in — go straight to the shared lists tab
          sessionStorage.setItem("chrono_skip_splash", "1");
          navigate("/track?tab=tasks", { replace: true });
        } else {
          // Not logged in — send to login page (toast will show invite info)
          navigate("/login", { replace: true });
        }
      } catch (e: any) {
        console.error("Failed to load shared list preview:", e);
        setError("This invite link is invalid or the list no longer exists.");
      }
    })();
  }, [splashDone, authLoading, listId, user, navigate, processing]);

  // Show splash while auth loads or while the animation plays (unauthenticated users)
  if (!splashDone) {
    // If auth resolved and there's no user, show the splash animation
    if (!authLoading && !user) {
      return <SplashScreen onComplete={() => setSplashDone(true)} />;
    }
    // Auth still loading — show a simple spinner
    return (
      <div className="min-h-dvh flex items-center justify-center" style={{ background: "var(--bg-gradient)" }}>
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center px-6" style={{ background: "var(--bg-gradient)" }}>
        <div className="text-center max-w-sm">
          <div
            className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, rgba(248,192,216,0.3), rgba(216,180,254,0.3))" }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold mb-2" style={{ color: "var(--primary)" }}>
            Link not valid
          </h1>
          <p className="text-sm mb-6 text-muted-foreground">
            {error}
          </p>
          <button
            onClick={() => navigate(user ? "/" : "/login", { replace: true })}
            className="glass-btn-primary px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition active:scale-[0.98]"
          >
            {user ? "Go home" : "Go to login"}
          </button>
        </div>
      </div>
    );
  }

  // Loading state while fetching preview
  return (
    <div className="min-h-dvh flex items-center justify-center" style={{ background: "var(--bg-gradient)" }}>
      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
