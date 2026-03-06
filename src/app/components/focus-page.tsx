import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router";
import {
  Play, Pause, RotateCcw, Timer, Coffee, Brain,
  ChevronDown, ChevronUp, Target, Flame, Trophy,
  Settings2, Volume2, VolumeX, SkipForward, Check,
  Clock, Zap, ListTodo, X
} from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "motion/react";
import {
  saveFocusSession, getFocusSessions, getFocusSettings,
  saveFocusSettings, getMyLists
} from "../lib/api";

// ── Types ──
interface FocusPreset {
  label: string;
  workMin: number;
  breakMin: number;
  icon: any;
}

interface FocusSession {
  id: string;
  type: "work" | "break";
  duration_seconds: number;
  preset_label: string;
  task_name?: string;
  list_name?: string;
  completed: boolean;
  started_at: string;
  ended_at: string;
}

interface FocusSettings {
  auto_start_breaks: boolean;
  auto_start_work: boolean;
  sound_enabled: boolean;
  long_break_interval: number;
  long_break_min: number;
}

const DEFAULT_SETTINGS: FocusSettings = {
  auto_start_breaks: true,
  auto_start_work: false,
  sound_enabled: true,
  long_break_interval: 4,
  long_break_min: 15,
};

const PRESETS: FocusPreset[] = [
  { label: "Pomodoro", workMin: 25, breakMin: 5, icon: Timer },
  { label: "Deep Work", workMin: 50, breakMin: 10, icon: Brain },
  { label: "Sprint", workMin: 15, breakMin: 3, icon: Zap },
  { label: "Custom", workMin: 25, breakMin: 5, icon: Settings2 },
];

// ── Audio: soft chime using Web Audio API ──
function playChime() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    // Two-tone chime
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15); // A5
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.6);
  } catch (e) {
    // Ignore audio errors
  }
}

// ── Circular Progress Ring ──
function ProgressRing({
  progress,
  size = 280,
  strokeWidth = 8,
  isBreak,
  children,
}: {
  progress: number;
  size?: number;
  strokeWidth?: number;
  isBreak: boolean;
  children: React.ReactNode;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(progress, 1));

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--border-subtle)"
          strokeWidth={strokeWidth}
          opacity={0.5}
        />
        {/* Progress arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={isBreak ? "var(--chart-2, #10b981)" : "var(--primary)"}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.5s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {children}
      </div>
    </div>
  );
}

// ── Format seconds → mm:ss ──
function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

// ── Today string for daily stats ──
function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

// ── Main Component ──
export function FocusPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Preset & custom config
  const [presetIdx, setPresetIdx] = useState(0);
  const [customWork, setCustomWork] = useState(25);
  const [customBreak, setCustomBreak] = useState(5);
  const preset = PRESETS[presetIdx];
  const workMin = preset.label === "Custom" ? customWork : preset.workMin;
  const breakMin = preset.label === "Custom" ? customBreak : preset.breakMin;

  // Timer state
  const [phase, setPhase] = useState<"idle" | "work" | "break">("idle");
  const [timeLeft, setTimeLeft] = useState(workMin * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [sessionsCompleted, setSessions] = useState(0);
  const sessionStartRef = useRef<string>("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Settings
  const [settings, setSettings] = useState<FocusSettings>(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);

  // Task association
  const [taskName, setTaskName] = useState(searchParams.get("task") || "");
  const [listName, setListName] = useState(searchParams.get("list") || "");
  const [showTaskPicker, setShowTaskPicker] = useState(false);
  const [lists, setLists] = useState<any[]>([]);

  // Stats
  const [todayStats, setTodayStats] = useState({ sessions: 0, totalMin: 0 });
  const [recentSessions, setRecentSessions] = useState<FocusSession[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // Total duration for progress calc
  const totalDuration = phase === "break" ? breakMin * 60 : workMin * 60;
  const progress = totalDuration > 0 ? 1 - timeLeft / totalDuration : 0;

  // ── Load settings & stats ──
  useEffect(() => {
    getFocusSettings()
      .then((s: any) => { if (s) setSettings({ ...DEFAULT_SETTINGS, ...s }); })
      .catch(() => {});
    loadStats();
    getMyLists().then((l: any) => setLists(Array.isArray(l) ? l : [])).catch(() => {});
  }, []);

  const loadStats = useCallback(() => {
    getFocusSessions()
      .then((data: any[]) => {
        if (!Array.isArray(data)) return;
        setRecentSessions(data.slice(0, 20));
        const today = todayKey();
        const todaySessions = data.filter(
          (s) => s.type === "work" && s.completed && s.started_at?.startsWith(today)
        );
        setTodayStats({
          sessions: todaySessions.length,
          totalMin: Math.round(todaySessions.reduce((a, s) => a + (s.duration_seconds || 0), 0) / 60),
        });
      })
      .catch(() => {});
  }, []);

  // ── Update document title with timer ──
  useEffect(() => {
    if (phase !== "idle") {
      document.title = `${formatTime(timeLeft)} - ${phase === "work" ? "Focus" : "Break"} | Chrono`;
    } else {
      document.title = "Focus Mode | Chrono";
    }
    return () => { document.title = "Chrono"; };
  }, [timeLeft, phase]);

  const handleTimerComplete = useCallback(() => {
    const wasWork = phase === "work";

    // Save session
    const session: any = {
      type: phase === "idle" ? "work" : phase,
      duration_seconds: totalDuration,
      preset_label: preset.label,
      task_name: taskName || undefined,
      list_name: listName || undefined,
      completed: true,
      started_at: sessionStartRef.current,
      ended_at: new Date().toISOString(),
    };
    saveFocusSession(session).catch(() => {});

    if (settings.sound_enabled) playChime();

    if (wasWork) {
      setSessions((prev) => prev + 1);
      setTodayStats((prev) => ({
        sessions: prev.sessions + 1,
        totalMin: prev.totalMin + Math.round(totalDuration / 60),
      }));
      toast.success(`Focus session complete! ${formatTime(totalDuration)} of deep work.`, {
        icon: <Trophy className="w-4 h-4" />,
      });
      // Check for long break
      const nextCount = sessionsCompleted + 1;
      const isLongBreak = nextCount % settings.long_break_interval === 0;
      const nextBreak = isLongBreak ? settings.long_break_min : breakMin;

      setPhase("break");
      setTimeLeft(nextBreak * 60);
      sessionStartRef.current = new Date().toISOString();
      if (settings.auto_start_breaks) {
        setIsRunning(true);
      } else {
        setIsRunning(false);
      }
    } else {
      toast("Break's over! Ready for another round?", {
        icon: <Coffee className="w-4 h-4" />,
      });
      setPhase("work");
      setTimeLeft(workMin * 60);
      sessionStartRef.current = new Date().toISOString();
      if (settings.auto_start_work) {
        setIsRunning(true);
      } else {
        setIsRunning(false);
      }
    }
  }, [phase, totalDuration, preset.label, taskName, listName, settings, sessionsCompleted, breakMin, workMin]);

  // Re-bind handleTimerComplete when deps change
  const completeRef = useRef(handleTimerComplete);
  completeRef.current = handleTimerComplete;

  const [justFinished, setJustFinished] = useState(false);

  // ── Timer tick ──
  useEffect(() => {
    if (!isRunning) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(intervalRef.current!);
          setIsRunning(false);
          setJustFinished(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isRunning]);

  // Handle completion in effect
  useEffect(() => {
    if (justFinished) {
      setJustFinished(false);
      completeRef.current();
    }
  }, [justFinished]);

  // ── Controls ──
  const startTimer = useCallback(() => {
    if (phase === "idle") {
      setPhase("work");
      setTimeLeft(workMin * 60);
    }
    sessionStartRef.current = sessionStartRef.current || new Date().toISOString();
    setIsRunning(true);
  }, [phase, workMin]);

  const pauseTimer = useCallback(() => {
    setIsRunning(false);
  }, []);

  const resetTimer = useCallback(() => {
    setIsRunning(false);
    setPhase("idle");
    setTimeLeft(workMin * 60);
    sessionStartRef.current = "";
  }, [workMin]);

  const skipPhase = useCallback(() => {
    // Save partial session
    if (phase !== "idle") {
      const elapsed = totalDuration - timeLeft;
      if (elapsed > 10) {
        saveFocusSession({
          type: phase,
          duration_seconds: elapsed,
          preset_label: preset.label,
          task_name: taskName || undefined,
          list_name: listName || undefined,
          completed: false,
          started_at: sessionStartRef.current,
          ended_at: new Date().toISOString(),
        }).catch(() => {});
      }
    }
    setIsRunning(false);
    setJustFinished(false);

    if (phase === "work") {
      setPhase("break");
      setTimeLeft(breakMin * 60);
      sessionStartRef.current = new Date().toISOString();
    } else {
      setPhase("work");
      setTimeLeft(workMin * 60);
      sessionStartRef.current = new Date().toISOString();
    }
  }, [phase, totalDuration, timeLeft, preset.label, taskName, listName, breakMin, workMin]);

  // ── Preset change (only when idle) ──
  const changePreset = useCallback((idx: number) => {
    if (phase !== "idle") return;
    setPresetIdx(idx);
    const p = PRESETS[idx];
    const wm = p.label === "Custom" ? customWork : p.workMin;
    setTimeLeft(wm * 60);
  }, [phase, customWork]);

  // ── Save settings ──
  const updateSettings = useCallback((patch: Partial<FocusSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveFocusSettings(next).catch(() => {});
      return next;
    });
  }, []);

  // Streak (consecutive days with at least 1 session)
  const streak = useMemo(() => {
    if (!recentSessions.length) return 0;
    const days = new Set(
      recentSessions
        .filter((s) => s.type === "work" && s.completed)
        .map((s) => s.started_at?.slice(0, 10))
    );
    let count = 0;
    const d = new Date();
    for (let i = 0; i < 30; i++) {
      const key = d.toISOString().slice(0, 10);
      if (days.has(key)) {
        count++;
      } else if (i > 0) {
        break;
      }
      d.setDate(d.getDate() - 1);
    }
    return count;
  }, [recentSessions]);

  // Flat list of tasks from all lists, sorted by list name
  const allTasks = useMemo(() => {
    const tasks: { name: string; listName: string }[] = [];
    for (const list of lists) {
      const items = list.items || [];
      for (const item of items) {
        if (!item.checked && !item.completed) {
          tasks.push({ name: item.text || item.title || item.name || "", listName: list.name || list.title || "" });
        }
      }
    }
    // Sort by list name alphabetically
    tasks.sort((a, b) => a.listName.localeCompare(b.listName));
    return tasks;
  }, [lists]);

  // Group tasks by list name for the picker
  const groupedTasks = useMemo(() => {
    const groups: { listName: string; tasks: { name: string; listName: string }[] }[] = [];
    let currentGroup: typeof groups[0] | null = null;
    for (const t of allTasks) {
      if (!currentGroup || currentGroup.listName !== t.listName) {
        currentGroup = { listName: t.listName, tasks: [] };
        groups.push(currentGroup);
      }
      currentGroup.tasks.push(t);
    }
    return groups;
  }, [allTasks]);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 md:py-10 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="contents">
          <h1 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>
            Focus Mode
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="p-2 rounded-xl transition hover:bg-white/20"
            style={{ color: "var(--muted-foreground)" }}
            title="Session history"
          >
            <Clock className="w-5 h-5" />
          </button>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 rounded-xl transition hover:bg-white/20"
            style={{ color: "var(--muted-foreground)" }}
            title="Focus settings"
          >
            <Settings2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Today", value: `${todayStats.sessions}`, sub: `${todayStats.totalMin}m`, icon: Target },
          { label: "Total", value: `${sessionsCompleted}`, sub: "this session", icon: Trophy },
          { label: "Streak", value: `${streak}`, sub: streak === 1 ? "day" : "days", icon: Flame },
        ].map((s) => (
          <div key={s.label} className="glass rounded-2xl p-3 text-center">
            <s.icon className="w-4 h-4 mx-auto mb-1" style={{ color: "var(--primary)" }} />
            <div className="text-lg font-semibold" style={{ color: "var(--foreground)" }}>{s.value}</div>
            <div className="text-[11px]" style={{ color: "var(--muted-foreground)" }}>{s.sub} {s.label.toLowerCase()}</div>
          </div>
        ))}
      </div>

      {/* Preset selector (only when idle) */}
      <AnimatePresence mode="wait">
        {phase === "idle" && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-center justify-center gap-2 flex-wrap"
          >
            {PRESETS.map((p, i) => (
              <button
                key={p.label}
                onClick={() => changePreset(i)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm transition ${
                  presetIdx === i ? "glass-btn-primary" : "glass hover:opacity-80"
                }`}
              >
                <p.icon className="w-3.5 h-3.5" />
                <span>{p.label}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Custom duration inputs */}
      <AnimatePresence>
        {phase === "idle" && preset.label === "Custom" && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="glass rounded-2xl p-4 flex items-center justify-center gap-6">
              <div className="text-center">
                <label className="text-xs block mb-1" style={{ color: "var(--muted-foreground)" }}>Work (min)</label>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => { setCustomWork(Math.max(5, customWork - 5)); setTimeLeft(Math.max(5, customWork - 5) * 60); }}
                    className="w-7 h-7 rounded-lg flex items-center justify-center glass hover:opacity-80 text-sm"
                  >-</button>
                  <span className="w-8 text-center font-semibold" style={{ color: "var(--foreground)" }}>{customWork}</span>
                  <button
                    onClick={() => { setCustomWork(Math.min(120, customWork + 5)); setTimeLeft(Math.min(120, customWork + 5) * 60); }}
                    className="w-7 h-7 rounded-lg flex items-center justify-center glass hover:opacity-80 text-sm"
                  >+</button>
                </div>
              </div>
              <div className="text-center">
                <label className="text-xs block mb-1" style={{ color: "var(--muted-foreground)" }}>Break (min)</label>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCustomBreak(Math.max(1, customBreak - 1))}
                    className="w-7 h-7 rounded-lg flex items-center justify-center glass hover:opacity-80 text-sm"
                  >-</button>
                  <span className="w-8 text-center font-semibold" style={{ color: "var(--foreground)" }}>{customBreak}</span>
                  <button
                    onClick={() => setCustomBreak(Math.min(30, customBreak + 1))}
                    className="w-7 h-7 rounded-lg flex items-center justify-center glass hover:opacity-80 text-sm"
                  >+</button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Timer Ring */}
      <div className="flex justify-center">
        <div className="glass-elevated rounded-full p-6">
          <ProgressRing
            progress={progress}
            size={240}
            strokeWidth={6}
            isBreak={phase === "break"}
          >
            <div className="text-center">
              {/* Phase label */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={phase}
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 5 }}
                  className="text-xs font-medium uppercase tracking-wider mb-1"
                  style={{ color: phase === "break" ? "var(--chart-2, #10b981)" : "var(--primary)" }}
                >
                  {phase === "idle" ? "Ready" : phase === "work" ? "Focus" : "Break"}
                </motion.div>
              </AnimatePresence>
              {/* Time display */}
              <div
                className="text-5xl font-bold tabular-nums tracking-tight"
                style={{ color: "var(--foreground)", fontVariantNumeric: "tabular-nums" }}
              >
                {formatTime(timeLeft)}
              </div>
              {/* Task name */}
              {taskName && (
                <div className="mt-1.5 text-xs max-w-[160px] truncate" style={{ color: "var(--muted-foreground)" }}>
                  {taskName}
                </div>
              )}
            </div>
          </ProgressRing>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-3">
        {phase !== "idle" && (
          <button
            onClick={resetTimer}
            className="w-11 h-11 rounded-full glass flex items-center justify-center hover:opacity-80 transition"
            title="Reset"
          >
            <RotateCcw className="w-4.5 h-4.5" style={{ color: "var(--muted-foreground)" }} />
          </button>
        )}

        <button
          onClick={isRunning ? pauseTimer : startTimer}
          className="w-16 h-16 rounded-full glass-btn-primary flex items-center justify-center shadow-lg transition hover:scale-105"
        >
          {isRunning ? (
            <Pause className="w-7 h-7" />
          ) : (
            <Play className="w-7 h-7 ml-0.5" />
          )}
        </button>

        {phase !== "idle" && (
          <button
            onClick={skipPhase}
            className="w-11 h-11 rounded-full glass flex items-center justify-center hover:opacity-80 transition"
            title="Skip to next phase"
          >
            <SkipForward className="w-4.5 h-4.5" style={{ color: "var(--muted-foreground)" }} />
          </button>
        )}
      </div>

      {/* Task picker */}
      <div className="flex justify-center">
        {!taskName ? (
          <button
            onClick={() => setShowTaskPicker(true)}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-xl glass hover:opacity-80 transition"
            style={{ color: "var(--muted-foreground)" }}
          >
            <ListTodo className="w-3.5 h-3.5" />
            <span>Link a task</span>
          </button>
        ) : (
          <div className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-xl glass">
            <ListTodo className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--primary)" }} />
            <span className="truncate max-w-[200px]" style={{ color: "var(--foreground)" }}>{taskName}</span>
            <button onClick={() => { setTaskName(""); setListName(""); }} className="shrink-0 hover:opacity-70">
              <X className="w-3.5 h-3.5" style={{ color: "var(--muted-foreground)" }} />
            </button>
          </div>
        )}
      </div>

      {/* Task picker modal */}
      <AnimatePresence>
        {showTaskPicker && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="modal-overlay"
            onClick={() => setShowTaskPicker(false)}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              className="modal-sheet p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold mb-3" style={{ color: "var(--foreground)" }}>
                Choose a task to focus on
              </h3>
              {allTasks.length === 0 ? (
                <p className="text-sm py-4 text-center" style={{ color: "var(--muted-foreground)" }}>
                  No open tasks found in your lists.
                </p>
              ) : (
                <div className="space-y-3 max-h-[50vh] overflow-y-auto">
                  {groupedTasks.map((group) => (
                    <div key={group.listName}>
                      <div
                        className="text-[11px] font-semibold uppercase tracking-wider px-3 py-1"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        {group.listName}
                      </div>
                      {group.tasks.map((t, i) => (
                        <button
                          key={`${t.listName}-${i}`}
                          onClick={() => {
                            setTaskName(t.name);
                            setListName(t.listName);
                            setShowTaskPicker(false);
                          }}
                          className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-white/15 transition"
                        >
                          <div className="text-sm truncate" style={{ color: "var(--foreground)" }}>{t.name}</div>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              )}
              <button
                onClick={() => setShowTaskPicker(false)}
                className="mt-3 w-full py-2 rounded-xl glass text-sm text-center hover:opacity-80 transition"
                style={{ color: "var(--muted-foreground)" }}
              >
                Cancel
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Settings panel */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="glass rounded-2xl p-4 space-y-3">
              <h3 className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>Focus Settings</h3>

              {[
                { key: "auto_start_breaks" as const, label: "Auto-start breaks" },
                { key: "auto_start_work" as const, label: "Auto-start work sessions" },
                { key: "sound_enabled" as const, label: "Sound on completion" },
              ].map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-sm" style={{ color: "var(--foreground)" }}>{label}</span>
                  <button
                    onClick={() => updateSettings({ [key]: !settings[key] })}
                    className="w-10 h-6 rounded-full transition-colors flex items-center px-0.5"
                    style={{
                      background: settings[key] ? "var(--primary)" : "var(--switch-background)",
                    }}
                  >
                    <div
                      className="w-5 h-5 rounded-full bg-white shadow transition-transform"
                      style={{ transform: settings[key] ? "translateX(16px)" : "translateX(0)" }}
                    />
                  </button>
                </div>
              ))}

              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: "var(--foreground)" }}>Long break every</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => updateSettings({ long_break_interval: Math.max(2, settings.long_break_interval - 1) })}
                    className="w-6 h-6 rounded-lg flex items-center justify-center glass hover:opacity-80 text-xs"
                  >-</button>
                  <span className="w-6 text-center text-sm font-medium" style={{ color: "var(--foreground)" }}>
                    {settings.long_break_interval}
                  </span>
                  <button
                    onClick={() => updateSettings({ long_break_interval: Math.min(8, settings.long_break_interval + 1) })}
                    className="w-6 h-6 rounded-lg flex items-center justify-center glass hover:opacity-80 text-xs"
                  >+</button>
                  <span className="text-xs ml-1" style={{ color: "var(--muted-foreground)" }}>sessions</span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: "var(--foreground)" }}>Long break duration</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => updateSettings({ long_break_min: Math.max(5, settings.long_break_min - 5) })}
                    className="w-6 h-6 rounded-lg flex items-center justify-center glass hover:opacity-80 text-xs"
                  >-</button>
                  <span className="w-8 text-center text-sm font-medium" style={{ color: "var(--foreground)" }}>
                    {settings.long_break_min}m
                  </span>
                  <button
                    onClick={() => updateSettings({ long_break_min: Math.min(45, settings.long_break_min + 5) })}
                    className="w-6 h-6 rounded-lg flex items-center justify-center glass hover:opacity-80 text-xs"
                  >+</button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Session History */}
      <AnimatePresence>
        {showHistory && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="glass rounded-2xl p-4">
              <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--foreground)" }}>Recent Sessions</h3>
              {recentSessions.length === 0 ? (
                <p className="text-sm text-center py-3" style={{ color: "var(--muted-foreground)" }}>
                  No sessions yet. Start your first focus session!
                </p>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {recentSessions.map((s) => (
                    <div key={s.id} className="flex items-center justify-between py-2 border-b" style={{ borderColor: "var(--border-subtle)" }}>
                      <div className="flex items-center gap-2 min-w-0">
                        {s.type === "work" ? (
                          <Brain className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--primary)" }} />
                        ) : (
                          <Coffee className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--chart-2, #10b981)" }} />
                        )}
                        <div className="min-w-0">
                          <div className="text-sm truncate" style={{ color: "var(--foreground)" }}>
                            {s.type === "work" ? "Focus" : "Break"} — {Math.round(s.duration_seconds / 60)}m
                            {!s.completed && <span className="text-xs ml-1" style={{ color: "var(--muted-foreground)" }}>(partial)</span>}
                          </div>
                          {s.task_name && (
                            <div className="text-[11px] truncate" style={{ color: "var(--muted-foreground)" }}>{s.task_name}</div>
                          )}
                        </div>
                      </div>
                      <div className="text-[11px] shrink-0 ml-2" style={{ color: "var(--muted-foreground)" }}>
                        {new Date(s.started_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Motivational footer */}
      {phase === "work" && isRunning && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center text-sm italic"
          style={{ color: "var(--muted-foreground)" }}
        >
          Deep work is the superpower of the 21st century.
        </motion.p>
      )}
      {phase === "break" && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center text-sm italic"
          style={{ color: "var(--muted-foreground)" }}
        >
          Rest, stretch, hydrate. You earned it.
        </motion.p>
      )}
    </div>
  );
}