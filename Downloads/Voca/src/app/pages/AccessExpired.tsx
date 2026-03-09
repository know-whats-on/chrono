import React, { useEffect, useRef } from "react";
import { motion } from "motion/react";
import svgPaths from "../../imports/svg-vcwu2vcxfq";

// Bouncing ball component
function BouncingBall({ color, size, delay, duration, startX, startY }: {
  color: string; size: number; delay: number; duration: number; startX: number; startY: number;
}) {
  return (
    <motion.div
      className="absolute rounded-full will-change-transform"
      style={{
        width: size,
        height: size,
        background: color,
        filter: "blur(1px)",
        opacity: 0.7,
        left: `${startX}%`,
        top: `${startY}%`,
      }}
      animate={{
        x: [0, Math.random() * 200 - 100, Math.random() * -150 + 50, Math.random() * 180 - 90, 0],
        y: [0, Math.random() * -200 + 100, Math.random() * 150 - 50, Math.random() * -180 + 90, 0],
        scale: [1, 1.3, 0.8, 1.1, 1],
      }}
      transition={{
        repeat: Infinity,
        duration,
        delay,
        ease: "easeInOut",
      }}
    />
  );
}

const BALLS = [
  { color: "#6B4BC8", size: 80, delay: 0, duration: 12, startX: 10, startY: 20 },
  { color: "#904498", size: 60, delay: 0.5, duration: 14, startX: 70, startY: 10 },
  { color: "#DE6231", size: 90, delay: 1, duration: 16, startX: 20, startY: 70 },
  { color: "#CA3C43", size: 50, delay: 0.3, duration: 11, startX: 80, startY: 60 },
  { color: "#0A84FF", size: 70, delay: 0.8, duration: 13, startX: 50, startY: 40 },
  { color: "#6B4BC8", size: 45, delay: 1.2, duration: 15, startX: 30, startY: 85 },
  { color: "#DE6231", size: 55, delay: 0.2, duration: 10, startX: 85, startY: 30 },
  { color: "#904498", size: 65, delay: 0.7, duration: 17, startX: 15, startY: 50 },
];

export default function AccessExpired() {
  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-[#1a1a1e]">
      {/* Bouncing balls background */}
      <div className="absolute inset-0 overflow-hidden">
        {BALLS.map((ball, i) => (
          <BouncingBall key={i} {...ball} />
        ))}
      </div>

      {/* Content layer */}
      <div className="relative flex flex-1 flex-col items-center justify-center px-6 z-10">
        {/* Logo in difference blend mode */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="mb-8"
          style={{ mixBlendMode: "difference" }}
        >
          <svg
            className="w-44 h-auto drop-shadow-lg"
            fill="none"
            viewBox="200 580 700 740"
          >
            {/* V icon */}
            <g>
              <path d={svgPaths.p3c555cc0} fill="rgba(255,255,255,0.88)" />
              <path d={svgPaths.p15749d00} fill="rgba(255,255,255,0.88)" />
              <path d={svgPaths.p2ceeff00} fill="rgba(255,255,255,0.88)" />
              <path d={svgPaths.pfa0a100} fill="rgba(255,255,255,0.88)" />
              <path d={svgPaths.p18900a00} fill="rgba(255,255,255,0.88)" />
              <path d={svgPaths.p2090b700} fill="rgba(255,255,255,0.88)" />
              <path d={svgPaths.p3a5c9400} fill="rgba(255,255,255,0.88)" />
              <path d={svgPaths.p33ea31f0} fill="rgba(255,255,255,0.88)" />
              <path d={svgPaths.p1420a400} fill="rgba(255,255,255,0.88)" />
              <path d={svgPaths.p3890b900} fill="rgba(255,255,255,0.88)" />
              <path d={svgPaths.pee6f580} fill="rgba(255,255,255,0.88)" />
              <path d={svgPaths.p11263080} fill="rgba(255,255,255,0.88)" />
              <path d={svgPaths.p37715180} fill="rgba(255,255,255,0.88)" />
              <path d={svgPaths.p2ed03a80} fill="rgba(255,255,255,0.88)" />
              <path d={svgPaths.p61113c0} fill="rgba(255,255,255,0.88)" />

              <motion.g
                style={{ transformOrigin: "467px 830px" }}
                animate={{ scaleY: [1, 0.7, 1] }}
                transition={{ repeat: Infinity, duration: 1.2, delay: 0.3, ease: "easeInOut" }}
              >
                <path d={svgPaths.p1f000b00} fill="rgba(255,255,255,0.72)" />
                <path d={svgPaths.p25d3e580} fill="rgba(255,255,255,0.72)" />
              </motion.g>

              <motion.g
                style={{ transformOrigin: "498px 833px" }}
                animate={{ scaleY: [1, 0.5, 1] }}
                transition={{ repeat: Infinity, duration: 1.5, delay: 0.1, ease: "easeInOut" }}
              >
                <path d={svgPaths.p1645d80} fill="rgba(255,255,255,0.68)" />
                <path d={svgPaths.p2e628900} fill="rgba(255,255,255,0.68)" />
              </motion.g>

              <motion.g
                style={{ transformOrigin: "529px 832px" }}
                animate={{ scaleY: [1, 0.4, 1] }}
                transition={{ repeat: Infinity, duration: 1.7, delay: 0, ease: "easeInOut" }}
              >
                <path d={svgPaths.p24f19f00} fill="rgba(255,255,255,0.62)" />
                <path d={svgPaths.pd106880} fill="rgba(255,255,255,0.62)" />
              </motion.g>

              <motion.g
                style={{ transformOrigin: "621px 860px" }}
                animate={{ scaleY: [1, 0.4, 1] }}
                transition={{ repeat: Infinity, duration: 1.6, delay: 0.15, ease: "easeInOut" }}
              >
                <path d={svgPaths.p2a93180} fill="rgba(255,255,255,0.62)" />
              </motion.g>

              <motion.g
                style={{ transformOrigin: "652px 853px" }}
                animate={{ scaleY: [1, 0.55, 1] }}
                transition={{ repeat: Infinity, duration: 1.35, delay: 0.25, ease: "easeInOut" }}
              >
                <path d={svgPaths.p38b46f00} fill="rgba(255,255,255,0.68)" />
              </motion.g>

              <motion.g
                style={{ transformOrigin: "683px 843px" }}
                animate={{ scaleY: [1, 0.65, 1] }}
                transition={{ repeat: Infinity, duration: 1.15, delay: 0.35, ease: "easeInOut" }}
              >
                <path d={svgPaths.p2d5efec0} fill="rgba(255,255,255,0.72)" />
                <path d={svgPaths.p3ba50600} fill="rgba(255,255,255,0.72)" />
                <path d={svgPaths.p3ce7b880} fill="rgba(255,255,255,0.72)" />
              </motion.g>

              <motion.g
                style={{ transformOrigin: "737px 820px" }}
                animate={{ scaleY: [1, 0.75, 1] }}
                transition={{ repeat: Infinity, duration: 1.05, delay: 0.45, ease: "easeInOut" }}
              >
                <path d={svgPaths.p1c5c4880} fill="rgba(255,255,255,0.72)" />
                <path d={svgPaths.p31109e00} fill="rgba(255,255,255,0.72)" />
              </motion.g>
            </g>
            {/* Wordmark */}
            <g>
              <path d={svgPaths.p19abc00} fill="rgba(255,255,255,0.92)" />
              <path d={svgPaths.p357bdb00} fill="rgba(255,255,255,0.92)" />
              <path d={svgPaths.pc335a40} fill="rgba(255,255,255,0.92)" />
              <path d={svgPaths.p220ea900} fill="rgba(255,255,255,0.92)" />
            </g>
            <path d={svgPaths.p3a114300} fill="#DE5E29" />
          </svg>
        </motion.div>

        {/* Frosted glass panel */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="w-full max-w-sm"
        >
          <div className="rounded-3xl bg-white/10 backdrop-blur-2xl border border-white/20 shadow-2xl overflow-hidden p-6 text-center">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center mx-auto mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
            </div>

            <h2 className="text-xl font-bold text-white mb-2">
              Access Period Ended
            </h2>
            <p className="text-sm text-white/70 leading-relaxed mb-5">
              Your timed access to Voca has expired. The session you were granted has concluded.
            </p>

            <div className="rounded-2xl bg-white/10 border border-white/10 p-4 mb-5">
              <p className="text-xs text-white/50 uppercase tracking-wider font-semibold mb-1">
                Need more time?
              </p>
              <p className="text-sm text-white/80 leading-relaxed">
                Reach out to the <span className="font-semibold text-white">ChronoOS Team</span> at{" "}
                <a
                  href="https://knowwhatson.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#0A84FF] hover:underline font-semibold"
                >
                  What's On!
                </a>{" "}
                to request extended access.
              </p>
            </div>

            <a
              href="https://knowwhatson.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center w-full h-12 rounded-2xl bg-white text-gray-900 font-semibold text-[15px] active:scale-[0.97] transition-all shadow-lg"
            >
              Visit What's On!
            </a>

            <p className="text-[11px] text-white/30 mt-4">
              Part of ChronoOS by What's On!
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
