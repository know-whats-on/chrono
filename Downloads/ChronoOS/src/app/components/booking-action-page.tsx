import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router";
import { useAuth } from "../lib/auth-context";
import { acceptBookingRequest, declineBookingRequest } from "../lib/api";
import { CheckCircle2, XCircle, Loader2, Calendar, AlertTriangle } from "lucide-react";
import svgPaths from "../../imports/svg-6bmvk84f5e";
import imgBg from "figma:asset/01bc91df54c2f640585641427d670f790fedbad5.png";
import { getCachedAssetUrls } from "../lib/asset-manager";
import { SplashScreen } from "./splash-screen";

/*
 * Refractive glass bubble — exact copy from login-page.tsx
 */
function GlassBubble({
  size, cLeft, cTop, cWidth, cHeight,
  strokeViewBox, strokePath, strokeGradientId, strokeGradient,
  specX, specY,
}: {
  size: number; cLeft: number; cTop: number; cWidth: number; cHeight: number;
  strokeViewBox: string; strokePath: React.ReactNode;
  strokeGradientId: string; strokeGradient: React.ReactNode;
  specX: number; specY: number;
}) {
  const dx = size > 80 ? 3 : 2;
  return (
    <div className="contents">
      <div style={{ position: "absolute", inset: 0, borderRadius: "50%", overflow: "hidden" }}>
        <div style={{ position: "absolute", left: cLeft, top: cTop, width: cWidth, height: cHeight, opacity: 0.55 }}>
          <svg viewBox="0 0 438.776 536.282" style={{ width: "100%", height: "100%" }} fill="none">
            <path d={svgPaths.p15267700} fill="white" />
          </svg>
        </div>
        <div style={{ position: "absolute", left: cLeft + dx, top: cTop - 1, width: cWidth, height: cHeight, opacity: 0.2, mixBlendMode: "screen" }}>
          <svg viewBox="0 0 438.776 536.282" style={{ width: "100%", height: "100%" }} fill="none">
            <path d={svgPaths.p15267700} fill="#ffb0a0" />
          </svg>
        </div>
        <div style={{ position: "absolute", left: cLeft - dx, top: cTop + 1, width: cWidth, height: cHeight, opacity: 0.2, mixBlendMode: "screen" }}>
          <svg viewBox="0 0 438.776 536.282" style={{ width: "100%", height: "100%" }} fill="none">
            <path d={svgPaths.p15267700} fill="#90b8ff" />
          </svg>
        </div>
        <div style={{ position: "absolute", left: cLeft + 1, top: cTop + dx, width: cWidth, height: cHeight, opacity: 0.1, mixBlendMode: "screen" }}>
          <svg viewBox="0 0 438.776 536.282" style={{ width: "100%", height: "100%" }} fill="none">
            <path d={svgPaths.p15267700} fill="#d4ff90" />
          </svg>
        </div>
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: `radial-gradient(circle at ${specX}% ${specY}%, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0.15) 20%, transparent 55%)`, pointerEvents: "none" }} />
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", boxShadow: "inset 0 0 8px 2px rgba(255,255,255,0.18), inset 0 0 20px 4px rgba(180,210,255,0.06)", pointerEvents: "none" }} />
      </div>
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} fill="none" viewBox={strokeViewBox}>
        {strokePath}
        <defs>{strokeGradient}</defs>
      </svg>
    </div>
  );
}

/*
 * Logo section — exact replica of the login page C + 3 bubbles + breathing animations
 */
function ChronoLogo() {
  const S = 1.12;
  const cW = 130 * S;
  const cH = 160 * S;

  const b1cx = 75, b1ox = 25 - (-20), b1oy = 10 - (-10);
  const b1Left = b1cx + (b1ox - b1cx) * S;
  const b1Top  = b1cx + (b1oy - b1cx) * S;

  const b2cx = 57.5, b2ox = 25 - 65, b2oy = 10 - 75;
  const b2Left = b2cx + (b2ox - b2cx) * S;
  const b2Top  = b2cx + (b2oy - b2cx) * S;

  const b3cx = 35, b3ox = 25 - 105, b3oy = 10 - (-15);
  const b3Left = b3cx + (b3ox - b3cx) * S;
  const b3Top  = b3cx + (b3oy - b3cx) * S;

  return (
    <div className="contents">
      <style>{`
        @keyframes ba-bubble1-breathe {
          0%, 100% { transform: translate(0px, 0px) scale(1); }
          25%  { transform: translate(12px, 4px) scale(1.04); }
          50%  { transform: translate(6px, -8px) scale(1.02); }
          75%  { transform: translate(-6px, 6px) scale(1.05); }
        }
        @keyframes ba-bubble2-breathe {
          0%, 100% { transform: translate(0px, 0px) scale(1); }
          25%  { transform: translate(-10px, -6px) scale(1.05); }
          50%  { transform: translate(4px, -12px) scale(0.98); }
          75%  { transform: translate(-6px, 4px) scale(1.03); }
        }
        @keyframes ba-bubble3-breathe {
          0%, 100% { transform: translate(0px, 0px) scale(1); }
          33%  { transform: translate(-10px, 10px) scale(1.08); }
          66%  { transform: translate(6px, -6px) scale(0.96); }
        }
      `}</style>

      <div className="relative" style={{ width: 180, height: 180 }}>
        {/* Base C letterform */}
        <div className="absolute" style={{ width: 130, height: 160, left: 25, top: 10 }}>
          <svg className="w-full h-full drop-shadow-lg" fill="none" viewBox="0 0 438.776 536.282">
            <path d={svgPaths.p15267700} fill="white" fillOpacity="0.9" />
          </svg>
        </div>

        {/* Bubble 1 — large, upper-left */}
        <div
          className="absolute pointer-events-none"
          style={{
            width: 150, height: 150, left: -20, top: -10,
            animation: "ba-bubble1-breathe 7s ease-in-out infinite",
          }}
        >
          <GlassBubble
            size={150} cLeft={b1Left} cTop={b1Top} cWidth={cW} cHeight={cH}
            specX={35} specY={30}
            strokeViewBox="0 0 492 492" strokeGradientId="ba-b1sg"
            strokePath={
              <path d={svgPaths.p272f8700} stroke="url(#ba-b1sg)" strokeOpacity="0.7" strokeWidth="3" />
            }
            strokeGradient={
              <linearGradient gradientUnits="userSpaceOnUse" id="ba-b1sg" x1="0" x2="492" y1="246" y2="246">
                <stop stopColor="#F3FF4F" />
                <stop offset="1" stopColor="#707EC0" />
              </linearGradient>
            }
          />
        </div>

        {/* Bubble 2 — medium, lower-right */}
        <div
          className="absolute pointer-events-none"
          style={{
            width: 115, height: 115, left: 65, top: 75,
            animation: "ba-bubble2-breathe 9s ease-in-out infinite",
          }}
        >
          <GlassBubble
            size={115} cLeft={b2Left} cTop={b2Top} cWidth={cW} cHeight={cH}
            specX={38} specY={28}
            strokeViewBox="0 0 346 346" strokeGradientId="ba-b2sg"
            strokePath={
              <circle cx="173" cy="173" r="171.5" stroke="url(#ba-b2sg)" strokeOpacity="0.7" strokeWidth="3" />
            }
            strokeGradient={
              <radialGradient cx="0" cy="0" gradientTransform="translate(173 173) scale(173)" gradientUnits="userSpaceOnUse" id="ba-b2sg" r="1">
                <stop stopColor="white" />
                <stop offset="1" stopColor="#98C1EA" />
              </radialGradient>
            }
          />
        </div>

        {/* Bubble 3 — small accent, upper-right */}
        <div
          className="absolute pointer-events-none"
          style={{
            width: 70, height: 70, left: 105, top: -15,
            animation: "ba-bubble3-breathe 11s ease-in-out infinite",
          }}
        >
          <GlassBubble
            size={70} cLeft={b3Left} cTop={b3Top} cWidth={cW} cHeight={cH}
            specX={36} specY={32}
            strokeViewBox="0 0 492 492" strokeGradientId="ba-b3sg"
            strokePath={
              <path d={svgPaths.p272f8700} stroke="url(#ba-b3sg)" strokeOpacity="0.5" strokeWidth="4" />
            }
            strokeGradient={
              <linearGradient gradientUnits="userSpaceOnUse" id="ba-b3sg" x1="0" x2="492" y1="100" y2="400">
                <stop stopColor="#ffffff" />
                <stop offset="1" stopColor="#c4b5fd" />
              </linearGradient>
            }
          />
        </div>
      </div>

      {/* Title + subtitle (same as login) */}
      <h1 className="text-[1.75rem] font-semibold tracking-tight mt-4" style={{ color: "#1e1b4b" }}>
        Chrono
      </h1>
      <p className="text-sm" style={{ color: "#64648a" }}>Calm, Unified & Personalised</p>
    </div>
  );
}

/**
 * Handles Accept / Decline booking actions from email links.
 *
 * Route: /booking-action/:action/:code/:requestId
 *
 * If the user is not logged in, we store the intent in sessionStorage and
 * redirect to /login. After login, the redirect-after-login mechanism sends
 * them back here, and the action executes automatically.
 */
export function BookingActionPage() {
  const { action, code, requestId } = useParams<{
    action: string;
    code: string;
    requestId: string;
  }>();
  const navigate = useNavigate();
  const { session, loading: authLoading } = useAuth();

  const [status, setStatus] = useState<"loading" | "success" | "error" | "already" | "redirecting">("loading");
  const [showSplash, setShowSplash] = useState(true);
  const [message, setMessage] = useState("");
  const [detail, setDetail] = useState<any>(null);
  const executed = useRef(false);

  const isAccept = action === "accept";
  const isDecline = action === "decline";
  const isValid = (isAccept || isDecline) && code && requestId;

  // Prefer Supabase-hosted background when available
  const bgUrl = getCachedAssetUrls()?.["chrono-splash-bg.png"] || imgBg;

  useEffect(() => {
    if (authLoading) return;

    // Not logged in -> redirect to login, storing intent
    if (!session) {
      const currentPath = `/booking-action/${action}/${code}/${requestId}`;
      sessionStorage.setItem("chrono_redirect_after_login", currentPath);
      setStatus("redirecting");
      navigate("/login", { replace: true });
      return;
    }

    if (!isValid) {
      setStatus("error");
      setMessage("Invalid booking action link.");
      return;
    }

    // Prevent double-execution in React strict mode
    if (executed.current) return;
    executed.current = true;

    (async () => {
      try {
        if (isAccept) {
          const res = await acceptBookingRequest(requestId!);
          setDetail(res);
          setStatus("success");
          setMessage("Meeting accepted!");
        } else {
          const res = await declineBookingRequest(requestId!, code!);
          setDetail(res);
          setStatus("success");
          setMessage("Meeting declined.");
        }
      } catch (err: any) {
        const msg = err.message || "Something went wrong";
        if (msg.includes("already been")) {
          setStatus("already");
          setMessage(msg);
        } else {
          setStatus("error");
          setMessage(msg);
        }
      }
    })();
  }, [authLoading, session]);

  /* ─── Loading / Redirecting spinner ─── */
  const isLoading = status === "loading" || status === "redirecting" || showSplash;
  
  if (isLoading) {
    return <SplashScreen onComplete={() => setShowSplash(false)} />;
  }

  /* ─── Result status icon ─── */
  const statusIcon =
    status === "success" && isAccept ? (
      <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto" style={{ background: "rgba(5,150,105,0.12)" }}>
        <CheckCircle2 className="w-7 h-7 text-emerald-600" />
      </div>
    ) : status === "success" && isDecline ? (
      <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto" style={{ background: "rgba(100,116,139,0.12)" }}>
        <Calendar className="w-7 h-7 text-slate-500" />
      </div>
    ) : status === "already" ? (
      <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto" style={{ background: "rgba(245,158,11,0.12)" }}>
        <AlertTriangle className="w-7 h-7 text-amber-600" />
      </div>
    ) : (
      <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto" style={{ background: "rgba(239,68,68,0.12)" }}>
        <XCircle className="w-7 h-7 text-red-600" />
      </div>
    );

  /* ─── Result page ─── */
  return (
    <div className="relative min-h-dvh flex flex-col items-center justify-center overflow-hidden">
      <img
        src={bgUrl} alt=""
        className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none"
        style={{ zIndex: 0 }}
      />

      <div className="relative z-10 w-full max-w-sm px-6 flex flex-col items-center">
        {/* Chrono branding bubble */}
        <ChronoLogo />

        {/* Result card — liquid-glass style */}
        <div
          className="w-full mt-8 rounded-2xl p-6 text-center space-y-4"
          style={{
            background: "rgba(255,255,255,0.55)",
            backdropFilter: "blur(20px) saturate(1.4)",
            WebkitBackdropFilter: "blur(20px) saturate(1.4)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.08), inset 0 0 0 1px rgba(255,255,255,0.45)",
            border: "1px solid rgba(255,255,255,0.35)",
          }}
        >
          {statusIcon}

          <h2 className="text-lg font-bold" style={{ color: "#1e1b4b" }}>
            {status === "success" && isAccept && "Meeting Accepted!"}
            {status === "success" && isDecline && "Meeting Declined"}
            {status === "error" && "Something went wrong"}
            {status === "already" && "Already handled"}
          </h2>

          <p className="text-sm leading-relaxed" style={{ color: "#64648a" }}>
            {message}
          </p>

          {/* Details card for accepted meetings */}
          {status === "success" && isAccept && detail && (
            <div className="rounded-xl p-4 text-left mx-auto" style={{ background: "rgba(248,244,237,0.8)" }}>
              {detail.visitor_name && (
                <div className="flex justify-between text-sm py-1">
                  <span style={{ color: "#94a3b8" }}>With</span>
                  <span className="font-semibold" style={{ color: "#1e293b" }}>{detail.visitor_name}</span>
                </div>
              )}
              {detail.slot_start && (
                <div className="contents">
                  <div className="flex justify-between text-sm py-1">
                    <span style={{ color: "#94a3b8" }}>Date</span>
                    <span className="font-semibold" style={{ color: "#1e293b" }}>
                      {new Date(detail.slot_start).toLocaleDateString("en-US", {
                        weekday: "short", month: "short", day: "numeric",
                      })}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm py-1">
                    <span style={{ color: "#94a3b8" }}>Time</span>
                    <span className="font-semibold" style={{ color: "#1e293b" }}>
                      {new Date(detail.slot_start).toLocaleTimeString("en-US", {
                        hour: "numeric", minute: "2-digit",
                      })}{" "}
                      –{" "}
                      {new Date(detail.slot_end).toLocaleTimeString("en-US", {
                        hour: "numeric", minute: "2-digit",
                      })}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Details for declined */}
          {status === "success" && isDecline && detail?.visitor_name && (
            <p className="text-sm" style={{ color: "#94a3b8" }}>
              {detail.visitor_name} has been notified and invited to pick a different time.
            </p>
          )}

          <div className="flex flex-col gap-2 pt-1">
            <button
              onClick={() => navigate("/calendar")}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-transform active:scale-[0.98]"
              style={{
                background: "linear-gradient(135deg, #7c3aed, #6366f1)",
                boxShadow: "0 4px 14px rgba(124,58,237,0.3)",
              }}
            >
              Open Chrono Calendar
            </button>
            <button
              onClick={() => navigate("/")}
              className="w-full py-2.5 rounded-xl text-sm font-medium transition-colors"
              style={{ color: "#64648a" }}
            >
              Go to Home
            </button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <p
        className="relative z-10 text-center text-[10px] font-light tracking-wide mt-8"
        style={{ color: "rgba(100, 100, 130, 0.7)" }}
      >
        Powered by{" "}
        <a href="https://chrono.knowwhatson.com" className="hover:underline" style={{ color: "inherit" }}>
          Chrono
        </a>{" "}
        · Created with{" "}
        <span style={{ color: "rgba(200, 60, 80, 0.75)" }}>&#9829;</span> by{" "}
        <a href="https://knowwhatson.com" target="_blank" rel="noopener noreferrer" className="hover:underline" style={{ color: "inherit" }}>
          What's On!
        </a>
      </p>
    </div>
  );
}
