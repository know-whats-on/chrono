import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import svgPaths from "../../imports/svg-6bmvk84f5e";
import imgBg from "/src/assets/01bc91df54c2f640585641427d670f790fedbad5.png";
import { getCachedAssetUrls } from "../lib/asset-manager";

/* ── Refractive glass bubble ── */
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

/* ── Shared constants ── */
const WORDS = ["Plans", "Commitments", "Tasks", "Your Life"] as const;
const WORD_DURATION = 1200;
const PAUSE_AFTER_HIGHLIGHT = 1000;

/* ── Shared bubble math ── */
function useBubbleMath() {
  const S = 1.12;
  const cW = 130 * S;
  const cH = 160 * S;
  const b1cx = 75, b1ox = 25 - (-20), b1oy = 10 - (-10);
  const b2cx = 57.5, b2ox = 25 - 65, b2oy = 10 - 75;
  const b3cx = 35, b3ox = 25 - 105, b3oy = 10 - (-15);
  return {
    cW, cH,
    b1Left: b1cx + (b1ox - b1cx) * S, b1Top: b1cx + (b1oy - b1cx) * S,
    b2Left: b2cx + (b2ox - b2cx) * S, b2Top: b2cx + (b2oy - b2cx) * S,
    b3Left: b3cx + (b3ox - b3cx) * S, b3Top: b3cx + (b3oy - b3cx) * S,
  };
}

/* ── Word cycling hook ── */
function useWordCarousel(onCarouselDone: () => void) {
  const [phase, setPhase] = useState<"idle" | "words" | "highlight" | "done">("idle");
  const [wordIndex, setWordIndex] = useState(0);
  const [showWord, setShowWord] = useState(false);

  // Start after a brief pause
  useEffect(() => {
    const t = setTimeout(() => { setPhase("words"); setShowWord(true); }, 800);
    return () => clearTimeout(t);
  }, []);

  // Word cycling
  useEffect(() => {
    if (phase !== "words") return;

    // Last word → hold then go to highlight
    if (wordIndex === WORDS.length - 1) {
      const t = setTimeout(() => setPhase("highlight"), WORD_DURATION);
      return () => clearTimeout(t);
    }

    const t = setTimeout(() => {
      setShowWord(false);
      setTimeout(() => {
        setWordIndex((prev) => prev + 1);
        setShowWord(true);
      }, 350);
    }, WORD_DURATION);
    return () => clearTimeout(t);
  }, [phase, wordIndex]);

  // Highlight hold → done
  useEffect(() => {
    if (phase !== "highlight") return;
    const t = setTimeout(() => { setPhase("done"); onCarouselDone(); }, PAUSE_AFTER_HIGHLIGHT);
    return () => clearTimeout(t);
  }, [phase, onCarouselDone]);

  return { phase, wordIndex, showWord, currentWord: WORDS[wordIndex], isLastWord: wordIndex === WORDS.length - 1 };
}

/* ── Cycling word display (shared between both splash variants) ── */
function CyclingWord({ currentWord, isLastWord, showWord, highlightActive }: {
  currentWord: string; isLastWord: boolean; showWord: boolean; highlightActive: boolean;
}) {
  const renderHighlighted = (word: string) => (
    <span className="relative inline-block px-4 py-1.5">
      <motion.span
        className="absolute inset-0 rounded-2xl"
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: highlightActive ? 0 : 0.3, ease: "easeOut" }}
        style={{
          background: "linear-gradient(135deg, #3b2a1a 0%, #5c3a20 35%, #4a2d1e 70%, #2e1a0f 100%)",
          boxShadow: "0 4px 24px rgba(92, 58, 32, 0.35), 0 0 40px rgba(180, 120, 60, 0.12)",
        }}
      />
      <span className="relative font-bold" style={{ color: "#ffffff" }}>
        {word}
      </span>
    </span>
  );

  return (
    <div className="relative flex items-center justify-center" style={{ minHeight: 48 }}>
      <AnimatePresence mode="wait">
        {showWord && (
          <motion.span
            key={currentWord}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -24 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="flex items-center justify-center text-2xl sm:text-[1.75rem] font-bold"
            style={{ color: "#0f0f1a" }}
          >
            {isLastWord ? renderHighlighted(currentWord) : (
              <span>{currentWord}<span style={{ color: "#0f0f1a" }}>,</span></span>
            )}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────
 * SplashScreen — full-screen overlay for LOGGED-IN users.
 * Fades out entirely when done, then fires onComplete.
 * ───────────────────────────────────────────────────────────────────── */
interface SplashScreenProps {
  onComplete: () => void;
}

export function SplashScreen({ onComplete }: SplashScreenProps) {
  const [fadeOut, setFadeOut] = useState(false);
  const { cW, cH, b1Left, b1Top, b2Left, b2Top, b3Left, b3Top } = useBubbleMath();

  // Prefer Supabase-hosted splash BG when available
  const bgUrl = getCachedAssetUrls()?.["chrono-splash-bg.png"] || imgBg;

  const handleCarouselDone = React.useCallback(() => {
    setFadeOut(true);
    setTimeout(onComplete, 700);
  }, [onComplete]);

  const { phase, wordIndex, showWord, currentWord, isLastWord } = useWordCarousel(handleCarouselDone);

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden"
      animate={fadeOut ? { opacity: 0 } : { opacity: 1 }}
      transition={{ duration: 0.6, ease: "easeInOut" }}
    >
      <style>{`
        @keyframes sb1-breathe { 0%,100%{transform:translate(0,0) scale(1)} 25%{transform:translate(12px,4px) scale(1.04)} 50%{transform:translate(6px,-8px) scale(1.02)} 75%{transform:translate(-6px,6px) scale(1.05)} }
        @keyframes sb2-breathe { 0%,100%{transform:translate(0,0) scale(1)} 25%{transform:translate(-10px,-6px) scale(1.05)} 50%{transform:translate(4px,-12px) scale(0.98)} 75%{transform:translate(-6px,4px) scale(1.03)} }
        @keyframes sb3-breathe { 0%,100%{transform:translate(0,0) scale(1)} 33%{transform:translate(-10px,10px) scale(1.08)} 66%{transform:translate(6px,-6px) scale(0.96)} }
      `}</style>

      <img src={bgUrl} alt="" className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none" style={{ zIndex: 0 }} />

      <div className="relative z-10 flex flex-col items-center px-6">
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="relative mb-6"
          style={{ width: 180, height: 180 }}
        >
          <div className="absolute" style={{ width: 130, height: 160, left: 25, top: 10 }}>
            <svg className="w-full h-full drop-shadow-lg" fill="none" viewBox="0 0 438.776 536.282">
              <path d={svgPaths.p15267700} fill="white" fillOpacity="0.9" />
            </svg>
          </div>
          <div className="absolute pointer-events-none" style={{ width: 150, height: 150, left: -20, top: -10, animation: "sb1-breathe 7s ease-in-out infinite" }}>
            <GlassBubble size={150} cLeft={b1Left} cTop={b1Top} cWidth={cW} cHeight={cH}
              specX={35} specY={30} strokeViewBox="0 0 492 492" strokeGradientId="sb1sg"
              strokePath={<path d={svgPaths.p272f8700} stroke="url(#sb1sg)" strokeOpacity="0.7" strokeWidth="3" />}
              strokeGradient={<linearGradient gradientUnits="userSpaceOnUse" id="sb1sg" x1="0" x2="492" y1="246" y2="246"><stop stopColor="#F3FF4F" /><stop offset="1" stopColor="#707EC0" /></linearGradient>}
            />
          </div>
          <div className="absolute pointer-events-none" style={{ width: 115, height: 115, left: 65, top: 75, animation: "sb2-breathe 9s ease-in-out infinite" }}>
            <GlassBubble size={115} cLeft={b2Left} cTop={b2Top} cWidth={cW} cHeight={cH}
              specX={38} specY={28} strokeViewBox="0 0 346 346" strokeGradientId="sb2sg"
              strokePath={<circle cx="173" cy="173" r="171.5" stroke="url(#sb2sg)" strokeOpacity="0.7" strokeWidth="3" />}
              strokeGradient={<radialGradient cx="0" cy="0" gradientTransform="translate(173 173) scale(173)" gradientUnits="userSpaceOnUse" id="sb2sg" r="1"><stop stopColor="white" /><stop offset="1" stopColor="#98C1EA" /></radialGradient>}
            />
          </div>
          <div className="absolute pointer-events-none" style={{ width: 70, height: 70, left: 105, top: -15, animation: "sb3-breathe 11s ease-in-out infinite" }}>
            <GlassBubble size={70} cLeft={b3Left} cTop={b3Top} cWidth={cW} cHeight={cH}
              specX={36} specY={32} strokeViewBox="0 0 492 492" strokeGradientId="sb3sg"
              strokePath={<path d={svgPaths.p272f8700} stroke="url(#sb3sg)" strokeOpacity="0.5" strokeWidth="4" />}
              strokeGradient={<linearGradient gradientUnits="userSpaceOnUse" id="sb3sg" x1="0" x2="492" y1="100" y2="400"><stop stopColor="#ffffff" /><stop offset="1" stopColor="#c4b5fd" /></linearGradient>}
            />
          </div>
        </motion.div>

        {/* Title */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="text-center mb-10"
        >
          <h1 className="text-[1.75rem] font-semibold tracking-tight" style={{ color: "#1e1b4b" }}>Chrono</h1>
          <p className="mt-1 text-sm" style={{ color: "#64648a" }}>Calm, Unified & Personalised</p>
        </motion.div>

        {/* Text carousel */}
        {(phase === "words" || phase === "highlight" || phase === "done") && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
            className="text-center"
          >
            <p className="text-2xl sm:text-[1.75rem] font-semibold" style={{ color: "#0f0f1a" }}>Manage</p>
            <CyclingWord
              currentWord={currentWord}
              isLastWord={isLastWord}
              showWord={showWord}
              highlightActive={phase === "highlight" || phase === "done"}
            />
            <p className="text-2xl sm:text-[1.75rem] font-semibold" style={{ color: "#0f0f1a" }}>better!</p>
          </motion.div>
        )}

        {/* Credit */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="text-center text-[11px] font-light tracking-wide mt-16"
          style={{ color: "rgba(80, 80, 110, 0.75)" }}
        >
          Created with{" "}<span style={{ color: "rgba(200, 60, 80, 0.75)" }}>&#9829;</span>{" "}by{" "}
          <a href="https://knowwhatson.com" target="_blank" rel="noopener noreferrer" className="hover:underline" style={{ color: "inherit" }}>What's On!</a>
        </motion.p>
      </div>
    </motion.div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
 * LoginIntroCarousel — inline text carousel for the LOGIN page.
 * Renders in place of the login form, then fires onComplete
 * so the form can fade in. No full-screen overlay / no fadeout.
 * ──────────────────────────────────────────────────────────────────── */
interface LoginIntroCarouselProps {
  onComplete: () => void;
}

export function LoginIntroCarousel({ onComplete }: LoginIntroCarouselProps) {
  const handleDone = React.useCallback(() => {
    // small extra beat before handing off
    setTimeout(onComplete, 200);
  }, [onComplete]);

  const { phase, showWord, currentWord, isLastWord } = useWordCarousel(handleDone);

  return (
    <motion.div
      className="flex flex-col items-center justify-center py-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: phase === "done" ? 0 : 1 }}
      transition={{ duration: 0.4, ease: "easeInOut" }}
    >
      <p className="text-2xl sm:text-[1.75rem] font-semibold" style={{ color: "#0f0f1a" }}>
        Manage
      </p>
      <CyclingWord
        currentWord={currentWord}
        isLastWord={isLastWord}
        showWord={showWord}
        highlightActive={phase === "highlight" || phase === "done"}
      />
      <p className="text-2xl sm:text-[1.75rem] font-semibold" style={{ color: "#0f0f1a" }}>
        better!
      </p>
    </motion.div>
  );
}