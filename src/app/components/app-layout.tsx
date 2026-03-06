import React from "react";
import { Outlet, NavLink, useNavigate, Navigate, useLocation } from "react-router";
import { useAuth } from "../lib/auth-context";
import {
  Home,
  CalendarDays,
  CheckSquare,
  MessageCircle,
  Settings,
  LogOut,
  X,
  Mail,
} from "lucide-react";
import { signout, prefetchHomeData, getIncomingShareRequests, getNotifications } from "../lib/api";
import { registerServiceWorker } from "../lib/push-notifications";
import { toast } from "sonner";
import { SplashScreen } from "./splash-screen";
import { ensureAppAssets } from "../lib/asset-manager";


const navItems = [
  { to: "/", icon: Home, label: "Today" },
  { to: "/calendar", icon: CalendarDays, label: "Calendar" },
  { to: "/track", icon: CheckSquare, label: "Track" },
  { to: "/email", icon: Mail, label: "Email" },
  { to: "/assistant", icon: MessageCircle, label: "Assistant" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export function AppLayout() {
  const { user, loading, pendingTimezoneChange, acceptTimezoneChange, dismissTimezoneChange } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const mainRef = React.useRef<HTMLElement>(null);
  const prefetchStarted = React.useRef(false);
  const assetUploadStarted = React.useRef(false);
  const [splashDone, setSplashDone] = React.useState(() => {
    // Skip splash if the user just came from the login page
    if (sessionStorage.getItem("chrono_skip_splash") === "1") {
      sessionStorage.removeItem("chrono_skip_splash");
      return true;
    }
    return false;
  });
  const [pendingShareRequests, setPendingShareRequests] = React.useState(0);
  const [unreadUpdates, setUnreadUpdates] = React.useState(0);
  const lastSeenNotifRef = React.useRef<string | null>(null);

  const handleSplashComplete = React.useCallback(() => {
    setSplashDone(true);
  }, []);

  // Scroll main content to top on route change (fixes mobile auto-scroll issue)
  React.useEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTo(0, 0);
    }
    // Also reset window scroll for safety
    window.scrollTo(0, 0);
  }, [location.pathname]);

  // ── Prefetch: as soon as we have a user session (even while splash plays),
  //    kick off all Today-page data loads in the background ──
  React.useEffect(() => {
    if (user && !prefetchStarted.current) {
      prefetchStarted.current = true;
      prefetchHomeData();
    }
  }, [user]);

  // ── Asset upload: upload app assets to Supabase Storage on first authenticated load ──
  React.useEffect(() => {
    if (user && !assetUploadStarted.current) {
      assetUploadStarted.current = true;
      // Fire-and-forget — runs in background, doesn't block UI
      ensureAppAssets().catch((e) =>
        console.warn("[AppLayout] Asset upload background task failed:", e)
      );
    }
  }, [user]);

  // ── Register service worker for push notifications ──
  const swRegistered = React.useRef(false);
  React.useEffect(() => {
    if (user && !swRegistered.current) {
      swRegistered.current = true;
      registerServiceWorker().catch((e) =>
        console.warn("[AppLayout] Service worker registration failed:", e)
      );
    }
  }, [user]);

  // ── Listen for push-notification deep-link navigation from service worker ──
  React.useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data && event.data.type === "CHRONO_PUSH_NAVIGATE" && event.data.url) {
        navigate(event.data.url);
      }
    };
    navigator.serviceWorker?.addEventListener("message", handler);
    return () => {
      navigator.serviceWorker?.removeEventListener("message", handler);
    };
  }, [navigate]);

  // ── Handle push-notification redirect from new-window opens ──
  // When no existing tab was found, the SW opens /?__push_target=<encoded>.
  // We pick up that param here and redirect internally via React Router.
  const pushRedirectHandled = React.useRef(false);
  React.useEffect(() => {
    if (pushRedirectHandled.current || !user) return;
    const params = new URLSearchParams(window.location.search);
    const pushTarget = params.get("__push_target");
    if (pushTarget) {
      pushRedirectHandled.current = true;
      // Clean the URL so the param doesn't linger
      window.history.replaceState({}, "", "/");
      // Navigate after a tick so the app is fully mounted
      setTimeout(() => navigate(pushTarget, { replace: true }), 0);
    }
  }, [user, navigate]);

  // ── Fetch pending incoming calendar share requests for badge ──
  React.useEffect(() => {
    if (!user) return;
    const fetchPending = () => {
      getIncomingShareRequests()
        .then((data: any) => {
          const pending = Array.isArray(data) ? data.filter((r: any) => r.status === "pending").length : 0;
          setPendingShareRequests(pending);
        })
        .catch(() => {});
    };
    fetchPending();
    const interval = setInterval(fetchPending, 60000); // refresh every minute
    return () => clearInterval(interval);
  }, [user]);

  // ── Poll notifications for unread badge + toasts ──
  React.useEffect(() => {
    if (!user) return;
    const NOTIF_TOAST_ICONS: Record<string, string> = {
      friend_joined: "🎉",
      friend_shared_cal: "📅",
      friend_requested_cal: "📬",
      friend_shared_list: "📋",
      friend_updated_list: "✏️",
      friend_left_list: "👋",
    };
    const pollNotifs = () => {
      getNotifications()
        .then((data: any[]) => {
          if (!Array.isArray(data)) return;
          const unread = data.filter((n) => !n.read);
          setUnreadUpdates(unread.length);
          // Show toast for any new unread notifications since last poll
          if (lastSeenNotifRef.current) {
            const newOnes = unread.filter((n) => n.created_at > lastSeenNotifRef.current!);
            for (const n of newOnes.slice(0, 3)) {
              const emoji = NOTIF_TOAST_ICONS[n.type] || "🔔";
              const isListNotif = n.type === "friend_shared_list" || n.type === "friend_updated_list" || n.type === "friend_left_list";
              toast(n.message, {
                icon: emoji,
                duration: 5000,
                action: {
                  label: isListNotif ? "View Lists" : "View",
                  onClick: () => navigate(isListNotif ? "/" : "/settings"),
                },
              });
            }
          }
          if (data.length > 0) {
            lastSeenNotifRef.current = data[0].created_at; // sorted newest first
          }
        })
        .catch(() => {});
    };
    pollNotifs();
    const iv = setInterval(pollNotifs, 45000);
    return () => clearInterval(iv);
  }, [user]);

  // Show splash if auth is still loading, or if splash animation hasn't finished yet
  if (loading || !splashDone) {
    // If auth finished and no user, redirect to login (don't wait for splash)
    if (!loading && !user) {
      return <Navigate to="/login" replace />;
    }
    // While auth is loading but splash is already marked done (post-login), show a simple spinner
    if (splashDone && loading) {
      return (
        <div className="h-dvh flex items-center justify-center" style={{ background: "var(--bg-gradient)" }}>
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      );
    }
    return <SplashScreen onComplete={handleSplashComplete} />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="h-dvh flex flex-col overflow-hidden relative" style={{ zIndex: 1 }}>
      {/* Top bar - desktop */}
      <header className="hidden md:flex items-center justify-between px-6 py-3 glass-nav border-b shrink-0 z-30">
        <div className="flex items-center gap-2.5">
        </div>
        <nav className="flex items-center gap-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm transition ${
                  isActive
                    ? "glass-btn-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/20"
                }`
              }
            >
              <div className="relative">
                <item.icon className="w-4 h-4" />
                {item.to === "/settings" && (pendingShareRequests + unreadUpdates) > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-rose-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center ring-2 ring-background">
                    {pendingShareRequests + unreadUpdates}
                  </span>
                )}
              </div>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <button
          onClick={async () => { await signout(); navigate("/login"); }}
          className="text-muted-foreground hover:text-foreground transition p-2 rounded-xl hover:bg-white/15"
          title="Sign out"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </header>

      {/* Timezone change prompt (non-blocking banner) */}
      {pendingTimezoneChange && (
        <div className="glass border-b border-amber-400/30 px-4 py-2.5 flex items-center justify-between gap-3 shrink-0 z-30" style={{ background: "rgba(251, 191, 36, 0.08)" }}>
          <p className="text-xs text-amber-800 dark:text-amber-200 min-w-0">
            Update timezone to <span className="font-semibold">{pendingTimezoneChange}</span>?
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={acceptTimezoneChange}
              className="px-3 py-1 text-xs font-medium bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition"
            >
              Update
            </button>
            <button
              onClick={dismissTimezoneChange}
              className="p-1 rounded-lg hover:bg-amber-500/20 transition"
            >
              <X className="w-3.5 h-3.5 text-amber-700 dark:text-amber-300" />
            </button>
          </div>
        </div>
      )}

      {/* Main content - scrollable */}
      <main ref={mainRef} className={`flex-1 overflow-x-hidden overscroll-contain pb-[calc(5.25rem+env(safe-area-inset-bottom,0px))] ${location.pathname === "/assistant" || location.pathname === "/calendar" ? "md:pb-0 md:overflow-hidden overflow-y-auto" : "md:pb-10 overflow-y-auto"}`} style={{ overflowAnchor: 'none' as any }}>
        <Outlet />
      </main>

      {/* Credit — desktop */}
      <p className="hidden md:block text-center text-[10px] font-light tracking-wide py-1.5 shrink-0" style={{ color: "rgba(100, 100, 130, 0.7)" }}>
        Created with <span style={{ color: "rgba(200, 60, 80, 0.75)" }}>&#9829;</span> by <a href="https://knowwhatson.com" target="_blank" rel="noopener noreferrer" className="hover:underline" style={{ color: "inherit" }}>What's On!</a>
      </p>

      {/* Bottom nav - mobile */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 glass-nav border-t z-30 shrink-0"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <p className="text-center text-[9px] font-light tracking-wide pt-1.5 pb-0" style={{ color: "rgba(100, 100, 130, 0.7)" }}>Created with <span style={{ color: "rgba(200, 60, 80, 0.75)" }}>&#9829;</span> by <a href="https://knowwhatson.com" target="_blank" rel="noopener noreferrer" className="hover:underline" style={{ color: "inherit" }}>What's On!</a></p>
        <div className="flex items-center justify-around py-1.5 px-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 min-w-[3rem] px-1 py-1 rounded-xl text-[11px] transition ${
                  isActive ? "text-primary" : "text-muted-foreground"
                }`
              }
            >
              <div className="relative">
                <item.icon className="w-5 h-5" />
                {item.to === "/settings" && (pendingShareRequests + unreadUpdates) > 0 && (
                  <span className="absolute -top-1 -right-1.5 w-3.5 h-3.5 bg-rose-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center ring-2 ring-background">
                    {pendingShareRequests + unreadUpdates}
                  </span>
                )}
              </div>
              <span className="truncate">{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}