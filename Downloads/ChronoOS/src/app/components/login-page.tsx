import React, { useState } from "react";
import { useNavigate, Link } from "react-router";
import { signin, signup } from "../lib/api";
import { Loader2 } from "lucide-react";
import svgPaths from "../../imports/svg-6bmvk84f5e";
import imgBg from "figma:asset/01bc91df54c2f640585641427d670f790fedbad5.png";
import { LoginIntroCarousel } from "./splash-screen";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { getCachedAssetUrls } from "../lib/asset-manager";

/*
 * Refractive glass bubble component.
 * Renders a circular "lens" that clips magnified + chromatic-split copies
 * of the C letterform, creating visible refraction / dispersion / splay.
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
    <>
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
    </>
  );
}

export function LoginPage() {
  const navigate = useNavigate();
  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [introDone, setIntroDone] = useState(() => {
    // Skip intro carousel if returning from a legal page (or any skip-splash flag)
    if (sessionStorage.getItem("chrono_skip_splash") === "1") {
      sessionStorage.removeItem("chrono_skip_splash");
      return true;
    }
    return false;
  });

  // Prefer Supabase-hosted login background when available
  const bgUrl = getCachedAssetUrls()?.["chrono-splash-bg.png"] || imgBg;

  // Check for pending shared list join invite
  const pendingJoinRaw = sessionStorage.getItem("chrono_pending_join");
  const pendingJoin = pendingJoinRaw ? JSON.parse(pendingJoinRaw) : null;

  // Show invite toast once when the form appears
  const [toastShown, setToastShown] = useState(false);
  React.useEffect(() => {
    if (introDone && pendingJoin && !toastShown) {
      setToastShown(true);
      toast(
        `Invitation to join "${pendingJoin.listTitle}" from ${pendingJoin.ownerName}`,
        {
          duration: 8000,
          icon: "📋",
          description: isSignup ? "Create an account to join the list" : "Sign in to join the list",
        }
      );
    }
  }, [introDone, toastShown]);

  // If there's a pending join, skip the intro carousel
  React.useEffect(() => {
    if (pendingJoin && !introDone) {
      setIntroDone(true);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (isSignup) {
        await signup(email, password, name);
        await signin(email, password);
      } else {
        await signin(email, password);
      }
      sessionStorage.setItem("chrono_skip_splash", "1");
      // If there's a pending join, redirect to the shared lists tab
      if (pendingJoin) {
        navigate("/track?tab=tasks", { replace: true });
      } else {
        // Check for a stored redirect path (e.g. deep link that required auth)
        const redirectTo = sessionStorage.getItem("chrono_redirect_after_login");
        if (redirectTo) {
          sessionStorage.removeItem("chrono_redirect_after_login");
          navigate(redirectTo, { replace: true });
        } else {
          navigate("/");
        }
      }
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  /*
   * Position math for refracted C inside each bubble.
   *
   * Container = 180×180.  C = 130×160 at (25, 10).
   * Each bubble clips a magnified (1.12×) copy of the C,
   * scaled from the bubble's centre so the visible portion
   * appears "bent" through the glass sphere.
   */
  const S = 1.12; // magnification factor
  const cW = 130 * S; // ≈ 146
  const cH = 160 * S; // ≈ 179

  // Bubble 1: 150×150 at (-20, -10) — large, upper-left, overlaps C and bubble 2/3
  const b1cx = 75, b1ox = 25 - (-20), b1oy = 10 - (-10);
  const b1Left = b1cx + (b1ox - b1cx) * S;
  const b1Top  = b1cx + (b1oy - b1cx) * S;

  // Bubble 2: 115×115 at (65, 75) — medium, lower-right, overlaps C and bubble 1
  const b2cx = 57.5, b2ox = 25 - 65, b2oy = 10 - 75;
  const b2Left = b2cx + (b2ox - b2cx) * S;
  const b2Top  = b2cx + (b2oy - b2cx) * S;

  // Bubble 3: 70×70 at (105, -15) — small accent, upper-right, overlaps bubble 1
  const b3cx = 35, b3ox = 25 - 105, b3oy = 10 - (-15);
  const b3Left = b3cx + (b3ox - b3cx) * S;
  const b3Top  = b3cx + (b3oy - b3cx) * S;

  return (
    <div className="relative min-h-dvh flex flex-col items-center justify-center overflow-hidden">
      {/* Breathing animations */}
      <style>{`
        @keyframes bubble1-breathe {
          0%, 100% { transform: translate(0px, 0px) scale(1); }
          25%  { transform: translate(12px, 4px) scale(1.04); }
          50%  { transform: translate(6px, -8px) scale(1.02); }
          75%  { transform: translate(-6px, 6px) scale(1.05); }
        }
        @keyframes bubble2-breathe {
          0%, 100% { transform: translate(0px, 0px) scale(1); }
          25%  { transform: translate(-10px, -6px) scale(1.05); }
          50%  { transform: translate(4px, -12px) scale(0.98); }
          75%  { transform: translate(-6px, 4px) scale(1.03); }
        }
        @keyframes bubble3-breathe {
          0%, 100% { transform: translate(0px, 0px) scale(1); }
          33%  { transform: translate(-10px, 10px) scale(1.08); }
          66%  { transform: translate(6px, -6px) scale(0.96); }
        }
      `}</style>

      {/* Background image layer */}
      <img
        src={bgUrl}
        alt=""
        className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none"
        style={{ zIndex: 0 }}
      />

      {/* Main content */}
      <div className="relative z-10 w-full max-w-sm px-6 flex flex-col items-center">
        {/* ====== Logo: C + refractive glass bubbles ====== */}
        <div className="relative mb-6" style={{ width: 180, height: 180 }}>
          {/* Base C letterform */}
          <div
            className="absolute"
            style={{ width: 130, height: 160, left: 25, top: 10 }}
          >
            <svg
              className="w-full h-full drop-shadow-lg"
              fill="none"
              viewBox="0 0 438.776 536.282"
            >
              <path d={svgPaths.p15267700} fill="white" fillOpacity="0.9" />
            </svg>
          </div>

          {/* Bubble 1 — large, upper-left, overlaps C and bubble 2/3 */}
          <div
            className="absolute pointer-events-none"
            style={{
              width: 150,
              height: 150,
              left: -20,
              top: -10,
              animation: "bubble1-breathe 7s ease-in-out infinite",
            }}
          >
            <GlassBubble
              size={150}
              cLeft={b1Left}
              cTop={b1Top}
              cWidth={cW}
              cHeight={cH}
              specX={35}
              specY={30}
              strokeViewBox="0 0 492 492"
              strokeGradientId="b1sg"
              strokePath={
                <path
                  d={svgPaths.p272f8700}
                  stroke="url(#b1sg)"
                  strokeOpacity="0.7"
                  strokeWidth="3"
                />
              }
              strokeGradient={
                <linearGradient
                  gradientUnits="userSpaceOnUse"
                  id="b1sg"
                  x1="0"
                  x2="492"
                  y1="246"
                  y2="246"
                >
                  <stop stopColor="#F3FF4F" />
                  <stop offset="1" stopColor="#707EC0" />
                </linearGradient>
              }
            />
          </div>

          {/* Bubble 2 — medium, lower-right, overlaps C and bubble 1 */}
          <div
            className="absolute pointer-events-none"
            style={{
              width: 115,
              height: 115,
              left: 65,
              top: 75,
              animation: "bubble2-breathe 9s ease-in-out infinite",
            }}
          >
            <GlassBubble
              size={115}
              cLeft={b2Left}
              cTop={b2Top}
              cWidth={cW}
              cHeight={cH}
              specX={38}
              specY={28}
              strokeViewBox="0 0 346 346"
              strokeGradientId="b2sg"
              strokePath={
                <circle
                  cx="173"
                  cy="173"
                  r="171.5"
                  stroke="url(#b2sg)"
                  strokeOpacity="0.7"
                  strokeWidth="3"
                />
              }
              strokeGradient={
                <radialGradient
                  cx="0"
                  cy="0"
                  gradientTransform="translate(173 173) scale(173)"
                  gradientUnits="userSpaceOnUse"
                  id="b2sg"
                  r="1"
                >
                  <stop stopColor="white" />
                  <stop offset="1" stopColor="#98C1EA" />
                </radialGradient>
              }
            />
          </div>

          {/* Bubble 3 — small accent, upper-right, overlaps bubble 1 */}
          <div
            className="absolute pointer-events-none"
            style={{
              width: 70,
              height: 70,
              left: 105,
              top: -15,
              animation: "bubble3-breathe 11s ease-in-out infinite",
            }}
          >
            <GlassBubble
              size={70}
              cLeft={b3Left}
              cTop={b3Top}
              cWidth={cW}
              cHeight={cH}
              specX={36}
              specY={32}
              strokeViewBox="0 0 492 492"
              strokeGradientId="b3sg"
              strokePath={
                <path
                  d={svgPaths.p272f8700}
                  stroke="url(#b3sg)"
                  strokeOpacity="0.5"
                  strokeWidth="4"
                />
              }
              strokeGradient={
                <linearGradient
                  gradientUnits="userSpaceOnUse"
                  id="b3sg"
                  x1="0"
                  x2="492"
                  y1="100"
                  y2="400"
                >
                  <stop stopColor="#ffffff" />
                  <stop offset="1" stopColor="#c4b5fd" />
                </linearGradient>
              }
            />
          </div>
        </div>

        {/* Title + subtitle */}
        <div className="text-center mb-8">
          <h1
            className="text-[1.75rem] font-semibold tracking-tight"
            style={{ color: "#1e1b4b" }}
          >Chrono</h1>
          <p className="mt-1 text-sm" style={{ color: "#64648a" }}>Calm, Unified & Personalised</p>
        </div>

        {/* Intro carousel OR login form — swap in place */}
        <AnimatePresence mode="wait">
          {!introDone ? (
            <motion.div
              key="intro-carousel"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.35 } }}
              className="w-full"
            >
              <LoginIntroCarousel onComplete={() => setIntroDone(true)} />
            </motion.div>
          ) : (
            <motion.div
              key="login-form"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="w-full flex flex-col items-center"
            >
              {/* Frosted glass card */}
              <div
                className="w-full rounded-3xl p-6 relative overflow-hidden"
                style={{
                  background: "rgba(255, 255, 255, 0.65)",
                  backdropFilter: "blur(24px) saturate(160%)",
                  WebkitBackdropFilter: "blur(24px) saturate(160%)",
                  border: "1px solid rgba(255, 255, 255, 0.5)",
                  boxShadow:
                    "0 8px 40px rgba(0, 0, 0, 0.08), 0 2px 8px rgba(0, 0, 0, 0.04)",
                }}
              >
                {/* Glass sheen */}
                <div
                  className="absolute inset-0 pointer-events-none rounded-3xl"
                  style={{
                    background:
                      "linear-gradient(135deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0) 50%)",
                    zIndex: 0,
                  }}
                />

                <div className="relative z-10">
                  <form onSubmit={handleSubmit} className="space-y-4">
                    {isSignup && (
                      <div>
                        <label className="text-sm font-medium mb-1.5 block" style={{ color: "#0f0f1a" }}>Name</label>
                        <input
                          type="text" value={name} onChange={(e) => setName(e.target.value)}
                          className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
                          style={{ background: "rgba(255,255,255,0.55)", border: "1px solid rgba(255,255,255,0.45)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", color: "#0f0f1a" }}
                          placeholder="Your name"
                        />
                      </div>
                    )}
                    <div>
                      <label className="text-sm font-medium mb-1.5 block" style={{ color: "#0f0f1a" }}>Email</label>
                      <input
                        type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
                        style={{ background: "rgba(255,255,255,0.55)", border: "1px solid rgba(255,255,255,0.45)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", color: "#0f0f1a", position: "relative", zIndex: 20 }}
                        placeholder="you@knowwhatson.com" required
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1.5 block" style={{ color: "#0f0f1a" }}>Password</label>
                      <input
                        type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
                        style={{ background: "rgba(255,255,255,0.55)", border: "1px solid rgba(255,255,255,0.45)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", color: "#0f0f1a", position: "relative", zIndex: 20 }}
                        placeholder="LetteR5&NumbeR5!" required minLength={6}
                      />
                    </div>
                    {error && (
                      <div className="text-sm px-3 py-2 rounded-xl" style={{ background: "rgba(220,38,70,0.1)", color: "#dc2646" }}>{error}</div>
                    )}
                    <button
                      type="submit" disabled={loading}
                      className="w-full py-3 px-4 rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                      style={{ background: "#1e1b4b", color: "#ffffff", border: "1px solid rgba(255,255,255,0.15)", boxShadow: "0 4px 16px rgba(30,27,75,0.3), inset 0 1px 0 rgba(255,255,255,0.1)" }}
                    >
                      {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                      {isSignup ? "Create account" : "Sign in"}
                    </button>
                  </form>
                </div>
              </div>

              {/* Toggle sign in / sign up */}
              <p className="text-center text-sm mt-6" style={{ color: "#64648a" }}>
                {isSignup ? "Already have an account?" : "Don't have an account?"}{" "}
                <button
                  onClick={() => { setIsSignup(!isSignup); setError(""); }}
                  className="font-semibold hover:underline"
                  style={{ color: "#1e1b4b" }}
                >
                  {isSignup ? "Sign in" : "Register"}
                </button>
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Credit — always visible */}
        <p
          className="text-center text-[11px] font-light tracking-wide mt-6"
          style={{ color: "rgba(80, 80, 110, 0.75)" }}
        >
          Created with <span style={{ color: "rgba(200, 60, 80, 0.75)" }}>&#9829;</span> by{" "}
          <a href="https://knowwhatson.com" target="_blank" rel="noopener noreferrer" className="hover:underline" style={{ color: "inherit" }}>What's On!</a>
        </p>

        {/* Legal footer links */}
        <p
          className="text-center text-[11px] font-light tracking-wide mt-2"
          style={{ color: "rgba(80, 80, 110, 0.6)" }}
        >
          <Link to="/privacy" className="hover:underline" style={{ color: "inherit" }}>Privacy Policy</Link>
          <span className="mx-1.5">|</span>
          <Link to="/terms" className="hover:underline" style={{ color: "inherit" }}>Terms of Use</Link>
        </p>
      </div>
    </div>
  );
}