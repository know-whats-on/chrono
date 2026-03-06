import React from "react";
import svgPaths from "../../imports/svg-6bmvk84f5e";
import imgBg from "/src/assets/01bc91df54c2f640585641427d670f790fedbad5.png";
import { motion } from "motion/react";
import { Mail } from "lucide-react";
import { getCachedAssetUrls } from "../lib/asset-manager";

/*
 * Refractive glass bubble component — identical to login page.
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

export function EmailPage() {
  const bgUrl = getCachedAssetUrls()?.["chrono-splash-bg.png"] || imgBg;

  /* Position math — identical to login page */
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
        <motion.div
          className="relative mb-6"
          style={{ width: 180, height: 180 }}
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        >
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

          {/* Bubble 1 — large, upper-left */}
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

          {/* Bubble 2 — medium, lower-right */}
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

          {/* Bubble 3 — small accent, upper-right */}
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
        </motion.div>

        {/* Title + Coming Soon */}
        <motion.div
          className="text-center mb-8"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3, ease: "easeOut" }}
        >
          <h1
            className="text-[1.75rem] font-semibold tracking-tight"
            style={{ color: "#1e1b4b" }}
          >
            Email
          </h1>
          <p className="mt-1 text-sm" style={{ color: "#64648a" }}>
            Coming Soon
          </p>
        </motion.div>

        {/* Frosted glass card */}
        <motion.div
          className="w-full"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5, ease: "easeOut" }}
        >
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

            <div className="relative z-10 flex flex-col items-center text-center py-4">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
                style={{ background: "rgba(30,27,75,0.08)" }}
              >
                <Mail className="w-7 h-7" style={{ color: "#1e1b4b" }} />
              </div>
              <h2
                className="text-lg font-semibold mb-2"
                style={{ color: "#1e1b4b" }}
              >
                Unified Inbox
              </h2>
              <p
                className="text-sm leading-relaxed max-w-xs"
                style={{ color: "#64648a" }}
              >
                Read, search, and triage your emails right inside Chrono. Gmail
                integration with smart labels and quick actions is on its way.
              </p>

              {/* Progress dots */}
              <div className="flex items-center gap-2 mt-6">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="w-2 h-2 rounded-full"
                    style={{ background: "#1e1b4b" }}
                    animate={{ opacity: [0.25, 1, 0.25] }}
                    transition={{
                      duration: 1.8,
                      repeat: Infinity,
                      delay: i * 0.3,
                      ease: "easeInOut",
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Credit */}
        <motion.p
          className="text-center text-[11px] font-light tracking-wide mt-6"
          style={{ color: "rgba(80, 80, 110, 0.75)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.8 }}
        >
          Created with <span style={{ color: "rgba(200, 60, 80, 0.75)" }}>&#9829;</span>{" "}
          by{" "}
          <a
            href="https://knowwhatson.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
            style={{ color: "inherit" }}
          >
            What's On!
          </a>
        </motion.p>
      </div>
    </div>
  );
}
