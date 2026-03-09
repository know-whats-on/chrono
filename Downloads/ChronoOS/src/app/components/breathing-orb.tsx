import React, { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence, useAnimation } from "motion/react";
import {
  CalendarDays, ListTodo, Bell, Zap,
  ChevronDown, ChevronUp,
  Play, Pause, RotateCcw, SkipForward,
} from "lucide-react";

/* ── Types ── */
interface BreathingOrbProps {
  events: any[];
  tasks: any[];
  reminders: any[];
  now: Date;
}

interface Tier {
  label: string;
  colors: {
    from: string; to: string; glow: string; ring: string; text: string; bg: string;
    lava: string[];
  };
  duration: number;
  baseSize: number;
  scaleAmplitude: number;
  rippleCount: number;
}

const TIERS: Record<"low" | "medium" | "high", Tier> = {
  low: {
    label: "Calm",
    colors: {
      from: "rgba(196,181,253,0.6)",
      to: "rgba(167,243,208,0.45)",
      glow: "rgba(196,181,253,0.35)",
      ring: "rgba(196,181,253,0.55)",
      text: "var(--primary)",
      bg: "rgba(196,181,253,0.12)",
      lava: [
        "rgba(167,139,250,0.85)",
        "rgba(129,230,217,0.75)",
        "rgba(196,181,253,0.80)",
        "rgba(110,231,183,0.70)",
      ],
    },
    duration: 6, baseSize: 170, scaleAmplitude: 0.18, rippleCount: 4,
  },
  medium: {
    label: "Busy",
    colors: {
      from: "rgba(251,191,36,0.6)",
      to: "rgba(253,164,80,0.45)",
      glow: "rgba(251,191,36,0.35)",
      ring: "rgba(251,191,36,0.5)",
      text: "#92400e",
      bg: "rgba(251,191,36,0.10)",
      lava: [
        "rgba(251,191,36,0.90)",
        "rgba(253,130,50,0.85)",
        "rgba(252,211,77,0.80)",
        "rgba(245,158,11,0.75)",
      ],
    },
    duration: 4.5, baseSize: 170, scaleAmplitude: 0.22, rippleCount: 5,
  },
  high: {
    label: "Overloaded",
    colors: {
      from: "rgba(251,113,133,0.65)",
      to: "rgba(244,63,94,0.45)",
      glow: "rgba(251,113,133,0.4)",
      ring: "rgba(251,113,133,0.5)",
      text: "#9f1239",
      bg: "rgba(251,113,133,0.10)",
      lava: [
        "rgba(251,113,133,0.90)",
        "rgba(244,63,94,0.85)",
        "rgba(253,164,175,0.80)",
        "rgba(225,29,72,0.75)",
      ],
    },
    duration: 3.2, baseSize: 170, scaleAmplitude: 0.26, rippleCount: 6,
  },
};

/* Tomato-mode ripple colors */
const TOMATO_COLORS = {
  work: { ring: "rgba(239,68,68,0.50)", glow: "rgba(239,68,68,0.30)" },
  break: { ring: "rgba(34,197,94,0.50)", glow: "rgba(34,197,94,0.30)" },
};

function getTier(score: number): "low" | "medium" | "high" {
  if (score <= 30) return "low";
  if (score <= 60) return "medium";
  return "high";
}

/* ── Score computation ── */
interface ScoreBreakdown {
  total: number;
  meetingLoad: number;
  taskLoad: number;
  reminderLoad: number;
  details: { label: string; icon: any; value: number; desc: string }[];
}

function computeClutter(events: any[], tasks: any[], reminders: any[], now: Date): ScoreBreakdown {
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);

  const todayEvents = events.filter(e => {
    const start = new Date(e.start_at);
    return start >= todayStart && start <= todayEnd;
  });
  const eventCount = todayEvents.length;
  const sorted = [...todayEvents].sort((a, b) =>
    new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
  );
  let backToBack = 0;
  for (let i = 1; i < sorted.length; i++) {
    const prevEnd = new Date(sorted[i - 1].end_at).getTime();
    const nextStart = new Date(sorted[i].start_at).getTime();
    if (nextStart - prevEnd < 15 * 60 * 1000) backToBack++;
  }
  const totalMeetingMins = todayEvents.reduce((sum, e) => {
    const start = new Date(e.start_at).getTime();
    const end = new Date(e.end_at).getTime();
    return sum + Math.max(0, (end - start) / 60000);
  }, 0);
  const meetingLoad = Math.min(40,
    eventCount * 4 + backToBack * 5 + Math.floor(totalMeetingMins / 60) * 3
  );

  let incompleteTasks = 0;
  let overdueTasks = 0;
  for (const list of tasks) {
    if (!Array.isArray(list.items)) continue;
    for (const item of list.items) {
      if (item.done) continue;
      incompleteTasks++;
      if (item.due_date && new Date(item.due_date) < now) overdueTasks++;
    }
  }
  const taskLoad = Math.min(35,
    Math.min(incompleteTasks, 15) * 1.2 + overdueTasks * 6
  );

  const activeReminders = reminders.filter(r => r.is_enabled);
  const upcomingReminders = activeReminders.filter(r => {
    if (!r.next_at) return false;
    const next = new Date(r.next_at);
    return next >= now && next <= todayEnd;
  });
  const reminderLoad = Math.min(25,
    upcomingReminders.length * 5 + activeReminders.length * 1.5
  );

  const total = Math.min(100, Math.round(meetingLoad + taskLoad + reminderLoad));

  return {
    total,
    meetingLoad: Math.round(meetingLoad),
    taskLoad: Math.round(taskLoad),
    reminderLoad: Math.round(reminderLoad),
    details: [
      {
        label: "Meetings", icon: CalendarDays, value: Math.round(meetingLoad),
        desc: `${eventCount} event${eventCount !== 1 ? "s" : ""}${backToBack > 0 ? `, ${backToBack} back-to-back` : ""}`,
      },
      {
        label: "Tasks", icon: ListTodo, value: Math.round(taskLoad),
        desc: `${incompleteTasks} open${overdueTasks > 0 ? `, ${overdueTasks} overdue` : ""}`,
      },
      {
        label: "Reminders", icon: Bell, value: Math.round(reminderLoad),
        desc: `${upcomingReminders.length} upcoming today`,
      },
    ],
  };
}

/* ── Water ripple — accepts color override for tomato mode ── */
function WaterRipple({
  baseSize, duration, index, total, ringColor, ringFaintColor,
}: {
  baseSize: number; duration: number; index: number; total: number;
  ringColor: string; ringFaintColor: string;
}) {
  const stagger = (duration / total) * index;
  const rippleDur = duration * 1.6;
  const endScale = 2.8 + index * 0.15;

  return (
    <div className="contents">
      <motion.div
        className="absolute rounded-full pointer-events-none"
        style={{
          width: baseSize, height: baseSize,
          top: "50%", left: "50%", x: "-50%", y: "-50%",
          border: `3px solid ${ringFaintColor}`,
          boxShadow: `0 0 12px 3px ${ringFaintColor}`,
        }}
        animate={{ scale: [1.0, endScale + 0.1], opacity: [0.3, 0] }}
        transition={{ duration: rippleDur, repeat: Infinity, delay: stagger, ease: "easeOut" }}
      />
      <motion.div
        className="absolute rounded-full pointer-events-none"
        style={{
          width: baseSize, height: baseSize,
          top: "50%", left: "50%", x: "-50%", y: "-50%",
          border: `1.5px solid ${ringColor}`,
          boxShadow: `0 0 6px 0 ${ringColor}, inset 0 0 4px 0 ${ringFaintColor}`,
        }}
        animate={{ scale: [1.0, endScale], opacity: [0.65, 0] }}
        transition={{ duration: rippleDur, repeat: Infinity, delay: stagger, ease: "easeOut" }}
      />
      <motion.div
        className="absolute rounded-full pointer-events-none"
        style={{
          width: baseSize, height: baseSize,
          top: "50%", left: "50%", x: "-50%", y: "-50%",
          border: "0.5px solid rgba(255,255,255,0.4)",
        }}
        animate={{ scale: [1.01, endScale - 0.04], opacity: [0.45, 0] }}
        transition={{ duration: rippleDur, repeat: Infinity, delay: stagger + 0.08, ease: "easeOut" }}
      />
    </div>
  );
}

/* ── Tap burst — accepts color override ── */
function TapSplashRing({
  baseSize, index, onDone, ringColor, ringFaintColor,
}: {
  baseSize: number; index: number; onDone: () => void;
  ringColor: string; ringFaintColor: string;
}) {
  const dur = 1.0 + index * 0.25;
  const endScale = 2.2 + index * 0.45;
  const thickness = Math.max(1, 3.5 - index * 0.6);

  return (
    <div className="contents">
      <motion.div
        className="absolute rounded-full pointer-events-none"
        style={{
          width: baseSize, height: baseSize,
          top: "50%", left: "50%", x: "-50%", y: "-50%",
          border: `${thickness}px solid ${ringColor}`,
          boxShadow: `0 0 ${8 + index * 2}px ${2 + index}px ${ringFaintColor}`,
        }}
        initial={{ scale: 1.08, opacity: 0.95 }}
        animate={{ scale: endScale, opacity: 0 }}
        transition={{ duration: dur, ease: "easeOut" }}
        onAnimationComplete={() => { if (index === 0) onDone(); }}
      />
      <motion.div
        className="absolute rounded-full pointer-events-none"
        style={{
          width: baseSize, height: baseSize,
          top: "50%", left: "50%", x: "-50%", y: "-50%",
          border: `${Math.max(0.5, 1 - index * 0.15)}px solid rgba(255,255,255,0.5)`,
        }}
        initial={{ scale: 1.1, opacity: 0.6 }}
        animate={{ scale: endScale - 0.06, opacity: 0 }}
        transition={{ duration: dur * 0.85, ease: "easeOut" }}
      />
      <motion.div
        className="absolute rounded-full pointer-events-none"
        style={{
          width: baseSize, height: baseSize,
          top: "50%", left: "50%", x: "-50%", y: "-50%",
          border: `2px solid ${ringFaintColor}`,
          boxShadow: `0 0 14px 4px ${ringFaintColor}`,
        }}
        initial={{ scale: 1.04, opacity: 0.35 }}
        animate={{ scale: endScale + 0.15, opacity: 0 }}
        transition={{ duration: dur * 1.15, ease: "easeOut" }}
      />
    </div>
  );
}

/* ── Lava lamp blobs ── */
const BLOB_PATHS = [
  { cx: "30%", cy: "30%", w: "65%", h: "60%", dur: 8, delay: 0 },
  { cx: "65%", cy: "60%", w: "55%", h: "55%", dur: 10, delay: 1.5 },
  { cx: "45%", cy: "70%", w: "50%", h: "45%", dur: 12, delay: 3 },
  { cx: "55%", cy: "35%", w: "45%", h: "50%", dur: 9, delay: 0.8 },
];

function LavaBlobs({ tier }: { tier: Tier }) {
  return (
    <div
      className="absolute inset-0 rounded-full overflow-hidden pointer-events-none"
      style={{ filter: "blur(18px)" }}
    >
      {tier.colors.lava.map((color, i) => {
        const bp = BLOB_PATHS[i % BLOB_PATHS.length];
        return (
          <motion.div
            key={`lava-${i}`}
            className="absolute rounded-full"
            style={{
              width: bp.w, height: bp.h,
              left: bp.cx, top: bp.cy,
              x: "-50%", y: "-50%",
              background: `radial-gradient(circle, ${color} 0%, ${color.replace(/[\d.]+\)$/, "0.0)")} 70%)`,
            }}
            animate={{
              x: ["-50%", "-30%", "-65%", "-40%", "-50%"],
              y: ["-50%", "-35%", "-55%", "-70%", "-50%"],
              scale: [1, 1.3, 0.85, 1.15, 1],
            }}
            transition={{
              duration: bp.dur,
              repeat: Infinity,
              ease: "easeInOut",
              delay: bp.delay,
            }}
          />
        );
      })}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   ── Tomato Calyx — centered star-shaped green leaves ──
   Top-view: stem is at the exact center of the fruit
   ══════════════════════════════════════════════════════════════ */

function TomatoCalyx() {
  return (
    <div
      className="absolute pointer-events-none z-[6]"
      style={{
        top: "8%", left: "50%",
        transform: "translate(-50%, 0)",
        width: 48, height: 48,
      }}
    >
      {/* Central stem nub — raised bump */}
      <div
        className="absolute rounded-full"
        style={{
          width: 10, height: 10,
          top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          background: "radial-gradient(circle at 40% 35%, #65a30d 0%, #4d7c0f 40%, #365314 100%)",
          boxShadow: "0 2px 6px rgba(0,0,0,0.40), 0 0 8px rgba(77,124,15,0.25), inset 0 1px 2px rgba(255,255,255,0.25)",
          zIndex: 3,
        }}
      />
      {/* Five leaf petals — larger, with slight size variation for realism */}
      {[
        { deg: 0, w: 28, h: 9 },
        { deg: 68, w: 26, h: 8 },
        { deg: 140, w: 30, h: 9 },
        { deg: 212, w: 25, h: 8 },
        { deg: 284, w: 27, h: 9 },
      ].map(({ deg, w, h }) => (
        <div
          key={deg}
          className="absolute"
          style={{
            width: w, height: h,
            borderRadius: "50%",
            background: `linear-gradient(90deg, #65a30d 0%, #4d7c0f 50%, #365314 100%)`,
            top: "50%", left: "50%",
            transformOrigin: "0% 50%",
            transform: `translate(0, -50%) rotate(${deg}deg)`,
            opacity: 0.92,
            boxShadow: "0 1px 3px rgba(0,0,0,0.25), inset 0 1px 1px rgba(255,255,255,0.12)",
            zIndex: 2,
          }}
        />
      ))}
      {/* Tiny secondary inner leaves for depth */}
      {[36, 108, 180, 252, 324].map(deg => (
        <div
          key={`inner-${deg}`}
          className="absolute"
          style={{
            width: 14, height: 5,
            borderRadius: "50%",
            background: "linear-gradient(90deg, #84cc16 0%, #65a30d 100%)",
            top: "50%", left: "50%",
            transformOrigin: "0% 50%",
            transform: `translate(0, -50%) rotate(${deg}deg)`,
            opacity: 0.6,
            zIndex: 1,
          }}
        />
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   ── Pomodoro Tomato Timer (back face) ──
   Top-view of a tomato with centered calyx
   ══════════════════════════════════════════════════════════════ */

const POMO_WORK = 25 * 60;
const POMO_BREAK = 5 * 60;

function formatPomo(secs: number) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function TomatoTimer({ size, bounceControls, onModeChange }: {
  size: number;
  bounceControls: ReturnType<typeof useAnimation>;
  onModeChange?: (mode: "work" | "break") => void;
}) {
  const [mode, setMode] = useState<"work" | "break">("work");
  const [timeLeft, setTimeLeft] = useState(POMO_WORK);
  const [running, setRunning] = useState(false);
  const [pomosCompleted, setPomosCompleted] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Notify parent of mode changes for ripple color sync
  useEffect(() => {
    onModeChange?.(mode);
  }, [mode, onModeChange]);

  const totalTime = mode === "work" ? POMO_WORK : POMO_BREAK;
  const progress = 1 - timeLeft / totalTime;

  useEffect(() => {
    if (!running) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          // Auto-continue: keep running, just swap mode
          if (mode === "work") {
            setPomosCompleted(p => p + 1);
            setMode("break");
            return POMO_BREAK;
          } else {
            setMode("work");
            return POMO_WORK;
          }
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running, mode]);

  const handleReset = () => {
    setRunning(false);
    setTimeLeft(mode === "work" ? POMO_WORK : POMO_BREAK);
  };

  const handleSkip = () => {
    setRunning(false);
    if (mode === "work") {
      setMode("break");
      setTimeLeft(POMO_BREAK);
    } else {
      setMode("work");
      setTimeLeft(POMO_WORK);
    }
  };

  const radius = size * 0.40;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - progress);

  const isWork = mode === "work";

  return (
    /* Breathing pulse — active during break mode, still during work mode */
    <motion.div
      className="w-full h-full"
      animate={isWork ? { scale: 1 } : { scale: [1, 1.06, 0.97, 1] }}
      transition={isWork ? { duration: 0 } : { duration: 5, repeat: Infinity, ease: "easeInOut", times: [0, 0.45, 0.75, 1] }}
    >
      <motion.div className="w-full h-full" animate={bounceControls}>
        <div
          className="w-full h-full relative flex flex-col items-center justify-center select-none overflow-hidden"
          style={{
            /* Organic tomato shape — slightly wider than tall, asymmetric lobes */
            borderRadius: "47% 53% 51% 49% / 52% 48% 52% 48%",
            background: `
              radial-gradient(ellipse 30% 28% at 50% 50%, rgba(0,0,0,0.06) 0%, transparent 100%),
              radial-gradient(ellipse 90% 90% at 50% 48%,
                ${isWork ? "#ef4444" : "#22c55e"} 0%,
                ${isWork ? "#dc2626" : "#16a34a"} 40%,
                ${isWork ? "#b91c1c" : "#15803d"} 70%,
                ${isWork ? "#991b1b" : "#166534"} 100%)
            `,
            boxShadow: `
              0 16px 50px ${isWork ? "rgba(185,28,28,0.50)" : "rgba(21,128,61,0.45)"},
              0 8px 25px ${isWork ? "rgba(220,38,38,0.35)" : "rgba(22,163,74,0.35)"},
              0 3px 10px rgba(0,0,0,0.20),
              0 0 80px ${isWork ? "rgba(239,68,68,0.18)" : "rgba(34,197,94,0.18)"},
              inset 0 -10px 28px ${isWork ? "rgba(127,29,29,0.50)" : "rgba(20,83,45,0.45)"},
              inset 0 6px 20px ${isWork ? "rgba(252,165,165,0.40)" : "rgba(187,247,208,0.35)"},
              inset 0 0 40px ${isWork ? "rgba(252,165,165,0.08)" : "rgba(187,247,208,0.08)"}
            `,
            border: "1.5px solid rgba(255,255,255,0.25)",
          }}
        >
          {/* Tomato skin segment lines from center */}
          {[0, 45, 90, 135].map(deg => (
            <div
              key={deg}
              className="absolute pointer-events-none"
              style={{
                width: "100%", height: "100%",
                borderRadius: "50%",
                background: `linear-gradient(${deg}deg, transparent 46%, rgba(0,0,0,0.06) 49%, rgba(0,0,0,0.06) 51%, transparent 54%)`,
              }}
            />
          ))}

          {/* Specular highlight on skin — enhanced for 3D pop */}
          <div
            className="absolute pointer-events-none rounded-full"
            style={{
              width: "55%", height: "40%",
              top: "8%", left: "12%",
              background: "radial-gradient(ellipse at 50% 60%, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.15) 45%, transparent 70%)",
              filter: "blur(3px)",
              transform: "rotate(-18deg)",
            }}
          />

          {/* Secondary lower-right reflection for volume */}
          <div
            className="absolute pointer-events-none rounded-full"
            style={{
              width: "30%", height: "18%",
              bottom: "12%", right: "16%",
              background: "radial-gradient(ellipse, rgba(255,255,255,0.15) 0%, transparent 70%)",
              filter: "blur(5px)",
            }}
          />

          {/* Rim light — enhanced */}
          <div
            className="absolute pointer-events-none rounded-full z-[2]"
            style={{
              inset: "1px",
              background: "transparent",
              border: "1.5px solid transparent",
              borderTopColor: "rgba(255,255,255,0.40)",
              borderLeftColor: "rgba(255,255,255,0.20)",
              mask: "linear-gradient(180deg, black 0%, transparent 55%)",
              WebkitMask: "linear-gradient(180deg, black 0%, transparent 55%)",
            }}
          />

          {/* Centered calyx (top view — stem is at center) */}
          <TomatoCalyx />

          {/* Progress ring SVG — sized to container, centered */}
          <svg
            className="absolute pointer-events-none z-[3]"
            width={size} height={size}
            viewBox={`0 0 ${size} ${size}`}
            style={{ top: 0, left: 0, transform: "rotate(-90deg)" }}
          >
            <circle
              cx={size / 2} cy={size / 2} r={radius}
              fill="none"
              stroke="rgba(255,255,255,0.12)"
              strokeWidth={4}
            />
            <motion.circle
              cx={size / 2} cy={size / 2} r={radius}
              fill="none"
              stroke="rgba(255,255,255,0.85)"
              strokeWidth={4}
              strokeLinecap="round"
              strokeDasharray={circumference}
              animate={{ strokeDashoffset }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            />
          </svg>

          {/* Timer readout — offset below center so calyx has room */}
          <div className="flex flex-col items-center relative z-[5]" style={{ marginTop: size * 0.10 }}>
            <span
              className="font-bold tabular-nums leading-none"
              style={{
                color: "rgba(255,255,255,0.95)",
                fontSize: size * 0.19,
                textShadow: "0 2px 8px rgba(0,0,0,0.45)",
              }}
            >
              {formatPomo(timeLeft)}
            </span>
            <span
              className="font-semibold uppercase tracking-[0.1em] leading-none mt-0.5"
              style={{
                color: "rgba(255,255,255,0.65)",
                fontSize: 8,
                textShadow: "0 1px 4px rgba(0,0,0,0.3)",
              }}
            >
              {isWork ? "Focus" : "Break"}
            </span>
          </div>

          {/* Control buttons */}
          <div className="flex items-center gap-1.5 mt-1 relative z-[5]">
            <button
              onClick={(e) => { e.stopPropagation(); handleReset(); }}
              className="rounded-full p-1 transition-colors cursor-pointer"
              style={{ background: "rgba(255,255,255,0.15)", backdropFilter: "blur(4px)" }}
              aria-label="Reset timer"
            >
              <RotateCcw className="w-2.5 h-2.5 text-white/80" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setRunning(r => !r); }}
              className="rounded-full p-1.5 transition-colors cursor-pointer"
              style={{ background: "rgba(255,255,255,0.25)", backdropFilter: "blur(4px)" }}
              aria-label={running ? "Pause" : "Start"}
            >
              {running
                ? <Pause className="w-3.5 h-3.5 text-white" />
                : <Play className="w-3.5 h-3.5 text-white" style={{ marginLeft: 1 }} />
              }
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); handleSkip(); }}
              className="rounded-full p-1 transition-colors cursor-pointer"
              style={{ background: "rgba(255,255,255,0.15)", backdropFilter: "blur(4px)" }}
              aria-label="Skip to next"
            >
              <SkipForward className="w-2.5 h-2.5 text-white/80" />
            </button>
          </div>

          {/* Pomo count dots */}
          {pomosCompleted > 0 && (
            <div className="flex items-center gap-1 mt-1 relative z-[5]">
              {Array.from({ length: Math.min(pomosCompleted, 8) }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-full"
                  style={{
                    width: 4, height: 4,
                    background: "rgba(255,255,255,0.7)",
                    boxShadow: "0 0 4px rgba(255,255,255,0.4)",
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ══════════════════════════════════════════════════════════════
   ── Main component ──
   ══════════════════════════════════════════════════════════════ */

export function BreathingOrb({ events, tasks, reminders, now }: BreathingOrbProps) {
  const [expanded, setExpanded] = useState(false);
  const [tapBursts, setTapBursts] = useState<number[]>([]);
  const tapIdRef = useRef(0);
  const bounceControls = useAnimation();

  /* ── Flip state ── */
  const [face, setFace] = useState<"orb" | "tomato">("orb");
  const [pomoMode, setPomoMode] = useState<"work" | "break">("work");
  const flipControls = useAnimation();
  const isFlipping = useRef(false);
  const faceRef = useRef(face);
  faceRef.current = face;

  /* Swipe detection – tuned for mobile reliability */
  const swipeStartX = useRef<number | null>(null);
  const swipeStartY = useRef<number | null>(null);
  const swipeStartTime = useRef<number>(0);
  const SWIPE_THRESHOLD = 20;          // px – lowered from 40
  const SWIPE_VELOCITY_THRESHOLD = 0.3; // px/ms – fast flicks bypass distance check

  /* 3D sphere-like flip: rotate only to ~75° (never razor-thin edge),
     scale pulse to suggest volume, blur to sell the motion */
  const doFlip = useCallback(async (direction: 1 | -1) => {
    if (isFlipping.current) return;
    isFlipping.current = true;
    const nextFace = faceRef.current === "orb" ? "tomato" : "orb";

    // Phase 1: spin out — sphere bulges slightly, subtle blur
    await flipControls.start({
      rotateY: direction * 78,
      scaleY: 1.04,  // vertical stretch sells spherical volume
      scaleX: 0.92,  // horizontal squeeze at near-edge
      transition: { duration: 0.32, ease: [0.4, 0, 0.7, 1] },
    });

    // Swap face at the "edge" — instant jump to mirror angle
    setFace(nextFace);
    await flipControls.set({
      rotateY: direction * -78,
      scaleY: 1.04,
      scaleX: 0.92,
    });

    // Phase 2: spin in — settle with slight overshoot
    await flipControls.start({
      rotateY: 0,
      scaleY: 1,
      scaleX: 1,
      transition: { duration: 0.36, ease: [0.2, 1, 0.3, 1] },
    });

    isFlipping.current = false;
  }, [flipControls]);

  /* Tap → hard-glass bounce + splash (works for both faces) */
  const handleTap = useCallback(() => {
    if (isFlipping.current) return;
    bounceControls.stop();
    bounceControls.start({
      scale: [1, 1.28, 0.84, 1.18, 0.90, 1.10, 0.96, 1.03, 1],
      transition: {
        duration: 1.0,
        ease: [0.22, 1, 0.36, 1],
        times: [0, 0.08, 0.20, 0.32, 0.44, 0.56, 0.70, 0.85, 1],
      },
    });
    const id = ++tapIdRef.current;
    setTapBursts(prev => [...prev, id]);
  }, [bounceControls]);

  const removeBurst = useCallback((id: number) => {
    setTapBursts(prev => prev.filter(b => b !== id));
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    swipeStartX.current = e.clientX;
    swipeStartY.current = e.clientY;
    swipeStartTime.current = performance.now();
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (swipeStartX.current === null || swipeStartY.current === null || isFlipping.current) {
      swipeStartX.current = null;
      swipeStartY.current = null;
      return;
    }
    const dx = e.clientX - swipeStartX.current;
    const dy = e.clientY - swipeStartY.current;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    const dt = Math.max(1, performance.now() - swipeStartTime.current);
    const velocity = absDx / dt; // px/ms
    swipeStartX.current = null;
    swipeStartY.current = null;

    // Must be more horizontal than vertical (relaxed 1.0x ratio)
    const isHorizontal = absDx > absDy;

    if (isHorizontal && (absDx >= SWIPE_THRESHOLD || velocity >= SWIPE_VELOCITY_THRESHOLD)) {
      doFlip(dx > 0 ? 1 : -1);
    } else if (absDx < 8 && absDy < 8) {
      // Small movement → treat as tap (touch-action:none blocks synthetic click on mobile)
      handleTap();
    }
  }, [doFlip, handleTap]);

  /* Breath phase */
  const [breathPhase, setBreathPhase] = useState<"in" | "out">("in");

  const breakdown = useMemo(
    () => computeClutter(events, tasks, reminders, now),
    [events, tasks, reminders, now]
  );

  const tierKey = getTier(breakdown.total);
  const tier = TIERS[tierKey];

  const cycleStartRef = useRef(performance.now());
  useEffect(() => {
    cycleStartRef.current = performance.now();
  }, [tier.duration]);

  useEffect(() => {
    let raf: number;
    const cycleDur = tier.duration * 1000;
    const inEnd = cycleDur * 0.45;
    const loop = () => {
      const elapsed = (performance.now() - cycleStartRef.current) % cycleDur;
      const phase = elapsed < inEnd ? "in" : "out";
      setBreathPhase(prev => prev !== phase ? phase : prev);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [tier.duration]);

  const hitSize = tier.baseSize + 40;

  /* Derive ripple colors based on current face */
  const tomatoRing = TOMATO_COLORS[pomoMode];
  const ringColor = face === "orb" ? tier.colors.ring : tomatoRing.ring;
  const ringFaintColor = ringColor.replace(/[\d.]+\)$/, "0.10)");
  const glowColor = face === "orb" ? tier.colors.glow : tomatoRing.glow;
  const rippleCount = face === "orb" ? tier.rippleCount : 4;
  const rippleDuration = face === "orb" ? tier.duration : 4;

  return (
    <div
      className="flex flex-col items-center shrink-0 relative"
      style={{ overflow: "visible" }}
    >
      {/* ── Orb / Tomato area ── */}
      <div className="relative" style={{ width: hitSize, height: hitSize, overflow: "visible" }}>
        {/* Ripple layer — always visible with face-appropriate colors */}
        <div
          className="absolute pointer-events-none"
          style={{
            width: hitSize, height: hitSize,
            top: 0, left: 0,
            overflow: "visible",
            zIndex: 0,
          }}
        >
          {Array.from({ length: rippleCount }).map((_, i) => (
            <WaterRipple
              key={`${face}-ripple-${i}`}
              baseSize={tier.baseSize}
              duration={rippleDuration}
              index={i}
              total={rippleCount}
              ringColor={ringColor}
              ringFaintColor={ringFaintColor}
            />
          ))}
          {tapBursts.map(id => (
            <div className="contents" key={id}>
              {[0, 1, 2, 3, 4].map(ri => (
                <TapSplashRing
                  key={`${id}-${ri}`}
                  baseSize={tier.baseSize}
                  index={ri}
                  onDone={() => removeBurst(id)}
                  ringColor={ringColor}
                  ringFaintColor={ringColor.replace(/[\d.]+\)$/, "0.15)")}
                />
              ))}
            </div>
          ))}
        </div>

        {/* Ambient glow — color matches current face */}
        <motion.div
          className="absolute rounded-full pointer-events-none"
          style={{
            width: tier.baseSize * 1.5, height: tier.baseSize * 1.5,
            top: "50%", left: "50%", x: "-50%", y: "-50%",
            background: `radial-gradient(circle, ${glowColor} 0%, transparent 70%)`,
            filter: "blur(20px)",
          }}
          animate={{
            scale: [1, 1 + (face === "orb" ? tier.scaleAmplitude * 0.8 : 0.06), 1],
            opacity: [0.4, 0.65, 0.4],
          }}
          transition={{ duration: face === "orb" ? tier.duration : 4, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* Swipe / Clickable area with 3D sphere flip */}
        <div
          className="absolute z-10"
          style={{
            width: tier.baseSize, height: tier.baseSize,
            top: "50%", left: "50%",
            transform: "translate(-50%, -50%)",
            perspective: 800, // wider perspective = subtler distortion = more sphere-like
            touchAction: "none", // prevent browser from stealing swipe for scroll
          }}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
        >
          <motion.div
            className="w-full h-full"
            animate={flipControls}
            style={{
              transformStyle: "preserve-3d",
              borderRadius: "50%", // keeps the silhouette round during rotation
            }}
          >
            {face === "orb" ? (
              /* ── FRONT: Breathing Orb ── */
              <button
                onClick={handleTap}
                className="w-full h-full focus:outline-none cursor-pointer"
                style={{ backfaceVisibility: "hidden" }}
                aria-label={`Clutter score ${breakdown.total}. ${tier.label}. Tap to ripple. Swipe to flip to Pomodoro timer.`}
              >
                <motion.div
                  className="w-full h-full"
                  animate={{
                    scale: [1, 1 + tier.scaleAmplitude, 1 - tier.scaleAmplitude * 0.3, 1],
                  }}
                  transition={{
                    duration: tier.duration,
                    repeat: Infinity,
                    ease: "easeInOut",
                    times: [0, 0.45, 0.75, 1],
                  }}
                >
                  <motion.div className="w-full h-full" animate={bounceControls}>
                    <div
                      className="w-full h-full rounded-full flex flex-col items-center justify-center relative overflow-hidden"
                      style={{
                        background: `
                          radial-gradient(ellipse 55% 50% at 30% 25%, rgba(255,255,255,0.45) 0%, transparent 70%),
                          radial-gradient(ellipse 40% 35% at 70% 75%, rgba(255,255,255,0.12) 0%, transparent 65%),
                          radial-gradient(ellipse 100% 100% at 50% 50%, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)
                        `,
                        backdropFilter: "blur(2px) saturate(1.3)",
                        WebkitBackdropFilter: "blur(2px) saturate(1.3)",
                        border: "1.5px solid rgba(255,255,255,0.50)",
                        boxShadow: `
                          0 8px 40px rgba(0,0,0,0.18),
                          0 2px 14px rgba(0,0,0,0.10),
                          0 0 60px ${tier.colors.glow},
                          0 0 120px ${tier.colors.glow.replace(/[\d.]+\)$/, "0.15)")},
                          inset 0 2px 14px rgba(255,255,255,0.55),
                          inset 0 -6px 18px ${tier.colors.from.replace(/[\d.]+\)$/, "0.12)")},
                          inset 0 0 50px rgba(255,255,255,0.06)
                        `,
                      }}
                    >
                      <LavaBlobs tier={tier} />
                      {/* Specular highlight */}
                      <div
                        className="absolute pointer-events-none rounded-full z-[2]"
                        style={{
                          width: "60%", height: "45%",
                          top: "8%", left: "12%",
                          background: "radial-gradient(ellipse at 50% 60%, rgba(255,255,255,0.70) 0%, rgba(255,255,255,0.22) 45%, transparent 70%)",
                          filter: "blur(4px)",
                          transform: "rotate(-15deg)",
                        }}
                      />
                      {/* Bottom caustic */}
                      <div
                        className="absolute pointer-events-none rounded-full z-[2]"
                        style={{
                          width: "35%", height: "20%",
                          bottom: "10%", right: "18%",
                          background: "radial-gradient(ellipse, rgba(255,255,255,0.20) 0%, transparent 70%)",
                          filter: "blur(6px)",
                        }}
                      />
                      {/* Rim light */}
                      <div
                        className="absolute pointer-events-none rounded-full z-[2]"
                        style={{
                          inset: "1px",
                          background: "transparent",
                          border: "1.5px solid transparent",
                          borderTopColor: "rgba(255,255,255,0.55)",
                          borderLeftColor: "rgba(255,255,255,0.30)",
                          mask: "linear-gradient(180deg, black 0%, transparent 55%)",
                          WebkitMask: "linear-gradient(180deg, black 0%, transparent 55%)",
                        }}
                      />
                      <span
                        className="font-bold tabular-nums select-none leading-none relative z-[3]"
                        style={{
                          color: tier.colors.text,
                          fontSize: tier.baseSize * 0.26,
                          textShadow: "0 1px 4px rgba(255,255,255,0.6), 0 0 16px rgba(255,255,255,0.2)",
                        }}
                      >
                        {breakdown.total}
                      </span>
                      <span
                        className="font-semibold uppercase tracking-[0.1em] select-none leading-none mt-1.5 relative z-[3]"
                        style={{ color: tier.colors.text, fontSize: 10, opacity: 0.75, textShadow: "0 1px 3px rgba(255,255,255,0.4)" }}
                      >
                        {tier.label}
                      </span>
                    </div>
                  </motion.div>
                </motion.div>
              </button>
            ) : (
              /* ── BACK: Tomato Pomodoro Timer ── */
              <button
                onClick={handleTap}
                className="w-full h-full focus:outline-none cursor-pointer"
                style={{ backfaceVisibility: "hidden" }}
                aria-label="Pomodoro timer. Tap to bounce. Swipe to flip back to orb."
              >
                <TomatoTimer size={tier.baseSize} bounceControls={bounceControls} onModeChange={setPomoMode} />
              </button>
            )}
          </motion.div>
        </div>
      </div>

      {/* ── Text below orb / tomato ── */}
      <div className="relative z-10 h-5 mt-1.5 flex items-center justify-center">
        <AnimatePresence mode="wait">
          {face === "orb" ? (
            /* Orb always shows breath text */
            <motion.span
              key={`breath-${breathPhase}`}
              className="text-[11px] font-medium tracking-[0.12em] uppercase select-none"
              style={{ color: tier.colors.text, opacity: 0.5 }}
              initial={{ opacity: 0, y: breathPhase === "in" ? 4 : -4 }}
              animate={{ opacity: 0.5, y: 0 }}
              exit={{ opacity: 0, y: breathPhase === "in" ? -4 : 4 }}
              transition={{ duration: 0.6, ease: "easeInOut" }}
            >
              {breathPhase === "in" ? "Breathe in" : "Breathe out"}
            </motion.span>
          ) : pomoMode === "break" ? (
            /* Tomato in break mode → breathe text */
            <motion.span
              key={`pomo-breath-${breathPhase}`}
              className="text-[11px] font-medium tracking-[0.12em] uppercase select-none"
              style={{ color: "#16a34a", opacity: 0.5 }}
              initial={{ opacity: 0, y: breathPhase === "in" ? 4 : -4 }}
              animate={{ opacity: 0.5, y: 0 }}
              exit={{ opacity: 0, y: breathPhase === "in" ? -4 : 4 }}
              transition={{ duration: 0.6, ease: "easeInOut" }}
            >
              {breathPhase === "in" ? "Breathe in" : "Breathe out"}
            </motion.span>
          ) : (
            /* Tomato in work mode → static "Pomodoro" label, no breathing */
            <motion.span
              key="pomo-focus"
              className="text-[11px] font-medium tracking-[0.12em] uppercase select-none"
              style={{ color: "#b91c1c", opacity: 0.5 }}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 0.5, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.4, ease: "easeInOut" }}
            >
              Pomodoro
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* ── Clutter Score (orb only) ── */}
      {face === "orb" && (
        <button
          onClick={() => setExpanded(p => !p)}
          className="flex items-center gap-1.5 mt-0.5 focus:outline-none cursor-pointer rounded-lg
                     px-2.5 py-1 transition-colors hover:bg-white/10 active:bg-white/15 relative z-10"
          aria-label={expanded ? "Hide clutter breakdown" : "Show clutter breakdown"}
        >
          <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground/60 select-none">
            Clutter Score
          </span>
          {expanded ? (
            <ChevronUp className="w-3 h-3 text-muted-foreground/40" />
          ) : (
            <ChevronDown className="w-3 h-3 text-muted-foreground/40" />
          )}
        </button>
      )}

      {/* ── Expanded breakdown ── */}
      <AnimatePresence>
        {expanded && face === "orb" && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden w-full max-w-xs relative z-10"
          >
            <div
              className="rounded-xl border px-3.5 py-3 mt-2 space-y-2.5"
              style={{
                background: tier.colors.bg,
                borderColor: `${tier.colors.from.replace(/[\d.]+\)$/, "0.25)")}`,
                backdropFilter: "blur(12px)",
              }}
            >
              <div className="relative h-1.5 rounded-full bg-black/5 overflow-hidden">
                <motion.div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{ background: `linear-gradient(90deg, ${tier.colors.from}, ${tier.colors.to})` }}
                  initial={{ width: 0 }}
                  animate={{ width: `${breakdown.total}%` }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                />
              </div>

              {breakdown.details.map(d => {
                const Icon = d.icon;
                return (
                  <div key={d.label} className="flex items-center gap-2.5">
                    <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: tier.colors.text }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-1">
                        <span className="text-[11px] font-semibold text-foreground/80">{d.label}</span>
                        <span className="text-[9px] text-muted-foreground/60">+{d.value}</span>
                      </div>
                      <p className="text-[9px] text-muted-foreground/60 leading-tight truncate">{d.desc}</p>
                    </div>
                  </div>
                );
              })}

              {tierKey !== "low" && (
                <div className="flex items-start gap-1.5 pt-1.5 border-t border-black/5">
                  <Zap className="w-3 h-3 shrink-0 mt-0.5" style={{ color: tier.colors.text }} />
                  <p className="text-[9px] text-muted-foreground/70 leading-relaxed">
                    {tierKey === "medium"
                      ? "Getting busy. Consider clearing overdue tasks or rescheduling."
                      : "High load detected. Try batching meetings or deferring non-urgent items."}
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}