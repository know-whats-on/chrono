import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowLeft, CalendarDays, CheckCircle2, Clock, Timer,
  TrendingUp, TrendingDown, Minus, AlertTriangle, RotateCcw,
  Archive, BellOff, CalendarPlus, ChevronRight, Loader2,
  Sparkles, Save, CheckSquare, BarChart3, ListChecks,
  PieChart, Coffee, Eye, Users, User, Zap
} from "lucide-react";
import {
  format, startOfWeek, endOfWeek, addDays, subWeeks, differenceInMinutes,
  differenceInDays, parseISO, startOfDay, isSameDay
} from "date-fns";
import {
  getEvents, getMyLists, getDaysSince, getReminders,
  resetDaysSince, saveWeeklyReview, getWeeklyReviewHistory,
  editMyListItem, snoozeReminder, deleteReminder, deleteDaysSince
} from "../lib/api";
import { useAuth } from "../lib/auth-context";

// ── Helpers ──────────────────────────────────────────────────────────────

function fmtMins(mins: number): string {
  if (mins < 60) return `${Math.round(mins)}m`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function getISOWeekKey(date: Date): string {
  // ISO week key e.g. "2026-W09"
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function pctChange(current: number, previous: number): { pct: number; dir: "up" | "down" | "same" } {
  if (previous === 0 && current === 0) return { pct: 0, dir: "same" };
  if (previous === 0) return { pct: 100, dir: "up" };
  const p = Math.round(((current - previous) / previous) * 100);
  return { pct: Math.abs(p), dir: p > 5 ? "up" : p < -5 ? "down" : "same" };
}

// ── Section wrapper ──────────────────────────────────────────────────────

function Section({ icon: Icon, title, subtitle, children, accentColor = "var(--primary)" }: {
  icon: any; title: string; subtitle?: string; children: React.ReactNode; accentColor?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl overflow-hidden"
    >
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border/50 bg-white/10">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${accentColor}15` }}>
          <Icon className="w-3.5 h-3.5" style={{ color: accentColor }} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {subtitle && <p className="text-[10px] text-muted-foreground truncate">{subtitle}</p>}
        </div>
      </div>
      <div className="px-4 py-3">{children}</div>
    </motion.div>
  );
}

// ── Stat Pill ────────────────────────────────────────────────────────────

function StatPill({ label, value, change, icon: Icon, color }: {
  label: string; value: string; change?: { pct: number; dir: "up" | "down" | "same" };
  icon: any; color: string;
}) {
  return (
    <div className="rounded-xl px-3 py-2.5 flex flex-col gap-1 min-w-0" style={{
      background: `${color}08`, border: `1px solid ${color}20`,
    }}>
      <div className="flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5 shrink-0" style={{ color }} />
        <span className="text-lg font-bold leading-none" style={{ color }}>{value}</span>
      </div>
      <span className="text-[10px] text-muted-foreground leading-tight">{label}</span>
      {change && change.dir !== "same" && (
        <div className="flex items-center gap-0.5">
          {change.dir === "up"
            ? <TrendingUp className="w-2.5 h-2.5 text-red-500" />
            : <TrendingDown className="w-2.5 h-2.5 text-emerald-500" />
          }
          <span className={`text-[9px] font-medium ${change.dir === "up" ? "text-red-500" : "text-emerald-500"}`}>
            {change.pct}% vs last week
          </span>
        </div>
      )}
      {change && change.dir === "same" && (
        <div className="flex items-center gap-0.5">
          <Minus className="w-2.5 h-2.5 text-muted-foreground/60" />
          <span className="text-[9px] font-medium text-muted-foreground/60">Same as last week</span>
        </div>
      )}
    </div>
  );
}

// ── Mini bar chart for daily breakdown ───────────────────────────────────

function DailyBreakdownChart({ days }: {
  days: { label: string; minutes: number; isToday: boolean }[];
}) {
  const maxMins = Math.max(...days.map(d => d.minutes), 30);
  const BAR_H = 44;

  return (
    <div className="flex items-end justify-between gap-1.5 sm:gap-2.5 px-1" style={{ height: BAR_H + 28 }}>
      {days.map((d, i) => {
        const h = maxMins > 0 ? Math.max(d.minutes > 0 ? 3 : 1, (d.minutes / maxMins) * BAR_H) : 1;
        const hrs = d.minutes / 60;
        return (
          <div key={d.label} className="flex flex-col items-center flex-1 min-w-0">
            <span className="text-[8px] sm:text-[9px] font-medium mb-0.5 leading-none truncate"
              style={{ color: d.minutes > 0 ? "var(--primary)" : "var(--muted-foreground)", minHeight: 10, opacity: d.minutes > 0 ? 1 : 0.4 }}>
              {hrs >= 1 ? `${hrs.toFixed(1).replace(/\.0$/, "")}h` : d.minutes > 0 ? `${d.minutes}m` : ""}
            </span>
            <motion.div
              initial={{ height: 1 }}
              animate={{ height: h }}
              transition={{ type: "spring", damping: 20, stiffness: 200, delay: 0.04 * i }}
              className="w-full rounded-t-md"
              style={{
                background: d.isToday ? "var(--primary)" : d.minutes > 0 ? "rgba(30,27,75,0.18)" : "rgba(0,0,0,0.04)",
                maxWidth: 44,
                border: d.isToday ? "1.5px solid var(--primary)" : "none",
              }}
            />
            <span className="text-[9px] sm:text-[10px] mt-1 leading-none"
              style={{ fontWeight: d.isToday ? 700 : 500, color: d.isToday ? "var(--foreground)" : "var(--muted-foreground)" }}>
              {d.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Action Button ────────────────────────────────────────────────────────

function ActionBtn({ icon: Icon, label, color, onClick, disabled }: {
  icon: any; label: string; color: string; onClick: () => void; disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold transition active:scale-95 disabled:opacity-40"
      style={{ background: `${color}12`, color, border: `1px solid ${color}25` }}
    >
      <Icon className="w-3 h-3" />
      {label}
    </button>
  );
}

// ── Trend Sparkline (last N weeks) ───────────────────────────────────────

function TrendSparkline({ values, label, color = "#1e1b4b" }: {
  values: number[]; label: string; color?: string;
}) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values);
  const range = max - min || 1;
  const W = 120;
  const H = 32;
  const points = values.map((v, i) => ({
    x: (i / (values.length - 1)) * W,
    y: H - ((v - min) / range) * (H - 4) - 2,
  }));
  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

  return (
    <div className="flex items-center gap-2">
      <svg width={W} height={H} className="shrink-0">
        <path d={pathD} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        {/* Highlight last point */}
        <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r={2.5} fill={color} />
      </svg>
      <span className="text-[9px] text-muted-foreground">{label}</span>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// ── WEEKLY REVIEW PAGE ───────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════

export function WeeklyReviewPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const now = new Date();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

  // ─ State ──────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [thisWeekEvents, setThisWeekEvents] = useState<any[]>([]);
  const [lastWeekEvents, setLastWeekEvents] = useState<any[]>([]);
  const [myLists, setMyLists] = useState<any[]>([]);
  const [counters, setCounters] = useState<any[]>([]);
  const [reminders, setReminders] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [actionsDone, setActionsDone] = useState<Set<string>>(new Set());

  // ── Date ranges ────────────────────────────────────────────────────────
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
  const prevWeekStart = subWeeks(weekStart, 1);
  const prevWeekEnd = subWeeks(weekEnd, 1);
  const weekKey = getISOWeekKey(now);

  // ── Load data ──────────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    Promise.all([
      getEvents(weekStart.toISOString(), weekEnd.toISOString()).catch(() => []),
      getEvents(prevWeekStart.toISOString(), prevWeekEnd.toISOString()).catch(() => []),
      getMyLists().catch(() => []),
      getDaysSince().catch(() => []),
      getReminders().catch(() => []),
      getWeeklyReviewHistory().catch(() => []),
    ]).then(([tw, lw, ml, ds, rem, hist]) => {
      setThisWeekEvents(Array.isArray(tw) ? tw : []);
      setLastWeekEvents(Array.isArray(lw) ? lw : []);
      setMyLists(Array.isArray(ml) ? ml : []);
      setCounters(Array.isArray(ds) ? ds : []);
      setReminders(Array.isArray(rem) ? rem : []);
      setHistory(Array.isArray(hist) ? hist : []);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  // ── Compute meeting stats ──────────────────────────────────────────────
  const meetingStats = useMemo(() => {
    const filterTimed = (evs: any[]) => evs.filter(ev => {
      const dur = differenceInMinutes(new Date(ev.end_at), new Date(ev.start_at));
      return dur < 23 * 60; // skip all-day
    });

    const thisFiltered = filterTimed(thisWeekEvents);
    const lastFiltered = filterTimed(lastWeekEvents);

    const thisMins = thisFiltered.reduce((s, ev) =>
      s + Math.max(0, differenceInMinutes(new Date(ev.end_at), new Date(ev.start_at))), 0);
    const lastMins = lastFiltered.reduce((s, ev) =>
      s + Math.max(0, differenceInMinutes(new Date(ev.end_at), new Date(ev.start_at))), 0);

    const countDiff = thisFiltered.length - lastFiltered.length;

    // Daily breakdown for bar chart
    const dailyMap = new Map<string, number>();
    for (let i = 0; i < 7; i++) {
      dailyMap.set(format(addDays(weekStart, i), "yyyy-MM-dd"), 0);
    }
    for (const ev of thisFiltered) {
      const key = format(new Date(ev.start_at), "yyyy-MM-dd");
      if (dailyMap.has(key)) dailyMap.set(key, (dailyMap.get(key) || 0) + differenceInMinutes(new Date(ev.end_at), new Date(ev.start_at)));
    }
    const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const dailyBars = Array.from(dailyMap.entries()).map(([dateStr, mins], i) => ({
      label: DAY_LABELS[i],
      minutes: mins,
      isToday: isSameDay(parseISO(dateStr), now),
    }));

    // Back-to-back count (<=5m gap)
    const sorted = [...thisFiltered].sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
    let b2b = 0;
    for (let i = 1; i < sorted.length; i++) {
      const gap = differenceInMinutes(new Date(sorted[i].start_at), new Date(sorted[i - 1].end_at));
      if (gap >= 0 && gap <= 5) b2b++;
    }

    return {
      thisCount: thisFiltered.length,
      lastCount: lastFiltered.length,
      thisMins, lastMins,
      countDiff,
      dailyBars,
      backToBack: b2b,
      change: pctChange(thisMins, lastMins),
      countChange: pctChange(thisFiltered.length, lastFiltered.length),
    };
  }, [thisWeekEvents, lastWeekEvents]);

  // ── Time Audit ──────────────────────────────────────────────────────────
  const timeAudit = useMemo(() => {
    const WORK_START_H = 9, WORK_END_H = 17; // 9am-5pm
    const WORK_DAY_MINS = (WORK_END_H - WORK_START_H) * 60; // 480
    const WORKDAYS = 5;
    const TOTAL_WORK_MINS = WORK_DAY_MINS * WORKDAYS; // 2400

    // Classify events
    function classify(title: string): string {
      const t = (title || "").toLowerCase();
      if (/1[\s:\-]?1|one[\s\-]?on[\s\-]?one/i.test(t)) return "1:1s";
      if (/team|standup|stand[\s\-]?up|sync|all[\s\-]?hands|retro|sprint|scrum|daily|weekly|planning|huddle/i.test(t)) return "Team";
      if (/interview|client|external|vendor|partner|demo|sales|pitch|prospect|customer/i.test(t)) return "External";
      if (/focus|deep[\s\-]?work|heads[\s\-]?down|blocked|no[\s\-]?meetings|maker|do[\s\-]?not[\s\-]?disturb/i.test(t)) return "Focus";
      return "Other";
    }

    const filterTimed = (evs: any[]) => evs.filter(ev => {
      const dur = differenceInMinutes(new Date(ev.end_at), new Date(ev.start_at));
      return dur < 23 * 60;
    });

    const thisFiltered = filterTimed(thisWeekEvents);
    const lastFiltered = filterTimed(lastWeekEvents);

    // Categories for this week
    const categories: Record<string, { count: number; mins: number }> = {};
    let focusMinsThis = 0, meetingMinsThis = 0;

    for (const ev of thisFiltered) {
      const cat = classify(ev.title);
      const dur = Math.max(0, differenceInMinutes(new Date(ev.end_at), new Date(ev.start_at)));
      if (!categories[cat]) categories[cat] = { count: 0, mins: 0 };
      categories[cat].count++;
      categories[cat].mins += dur;
      if (cat === "Focus") focusMinsThis += dur;
      else meetingMinsThis += dur;
    }

    const freeMinsThis = Math.max(0, TOTAL_WORK_MINS - meetingMinsThis - focusMinsThis);

    // Last week comparison
    let focusMinsLast = 0, meetingMinsLast = 0;
    for (const ev of lastFiltered) {
      const cat = classify(ev.title);
      const dur = Math.max(0, differenceInMinutes(new Date(ev.end_at), new Date(ev.start_at)));
      if (cat === "Focus") focusMinsLast += dur;
      else meetingMinsLast += dur;
    }
    const freeMinsLast = Math.max(0, TOTAL_WORK_MINS - meetingMinsLast - focusMinsLast);

    const focusDiffMins = focusMinsThis + freeMinsThis - (focusMinsLast + freeMinsLast);
    const focusDiffHrs = Math.round(Math.abs(focusDiffMins) / 60 * 10) / 10;

    // Donut data
    const donut = [
      { label: "Meetings", mins: meetingMinsThis, color: "#1e1b4b" },
      { label: "Focus Blocks", mins: focusMinsThis, color: "#3b82f6" },
      { label: "Free Time", mins: freeMinsThis, color: "rgba(30,27,75,0.10)" },
    ].filter(s => s.mins > 0 || s.label === "Free Time");

    // Category breakdown sorted by mins desc
    const catEntries = Object.entries(categories)
      .map(([name, d]) => ({ name, ...d }))
      .sort((a, b) => b.mins - a.mins);

    const CAT_COLORS: Record<string, string> = {
      "1:1s": "#6366f1", "Team": "#1e1b4b", "External": "#0ea5e9",
      "Focus": "#10b981", "Other": "#94a3b8",
    };

    // Meeting-free streaks (workdays Mon-Fri with 0 meetings)
    const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const dailyMeetingMins = new Map<string, number>();
    for (let i = 0; i < 7; i++) {
      dailyMeetingMins.set(format(addDays(weekStart, i), "yyyy-MM-dd"), 0);
    }
    for (const ev of thisFiltered) {
      if (classify(ev.title) === "Focus") continue; // focus blocks don't count as meetings
      const key = format(new Date(ev.start_at), "yyyy-MM-dd");
      if (dailyMeetingMins.has(key)) {
        dailyMeetingMins.set(key, (dailyMeetingMins.get(key) || 0) +
          differenceInMinutes(new Date(ev.end_at), new Date(ev.start_at)));
      }
    }

    // Find consecutive meeting-free workdays
    const meetingFreeDays: string[] = [];
    let currentStreak: string[] = [];
    let longestStreak: string[] = [];
    for (let i = 0; i < 5; i++) { // Mon-Fri only
      const dateStr = format(addDays(weekStart, i), "yyyy-MM-dd");
      const mins = dailyMeetingMins.get(dateStr) || 0;
      if (mins === 0) {
        currentStreak.push(DAY_LABELS[i]);
        meetingFreeDays.push(DAY_LABELS[i]);
      } else {
        if (currentStreak.length > longestStreak.length) longestStreak = [...currentStreak];
        currentStreak = [];
      }
    }
    if (currentStreak.length > longestStreak.length) longestStreak = [...currentStreak];

    // Daily stacked bars for time audit
    const dailyStacked = Array.from(dailyMeetingMins.entries()).map(([dateStr, meetMins], i) => {
      const isWorkday = i < 5;
      const dayTotal = isWorkday ? WORK_DAY_MINS : 0;
      let focDay = 0;
      for (const ev of thisFiltered) {
        if (classify(ev.title) !== "Focus") continue;
        if (format(new Date(ev.start_at), "yyyy-MM-dd") === dateStr) {
          focDay += differenceInMinutes(new Date(ev.end_at), new Date(ev.start_at));
        }
      }
      const freeDay = Math.max(0, dayTotal - meetMins - focDay);
      return {
        label: DAY_LABELS[i],
        meeting: meetMins,
        focus: focDay,
        free: freeDay,
        isToday: isSameDay(parseISO(dateStr), now),
      };
    });

    return {
      meetingMins: meetingMinsThis, focusMins: focusMinsThis, freeMins: freeMinsThis,
      totalWorkMins: TOTAL_WORK_MINS,
      donut, catEntries, CAT_COLORS,
      focusDiffMins, focusDiffHrs,
      focusDiffDir: focusDiffMins > 30 ? "more" as const : focusDiffMins < -30 ? "less" as const : "same" as const,
      meetingFreeDays, longestStreak, dailyStacked,
    };
  }, [thisWeekEvents, lastWeekEvents, weekStart]);

  // ── List items stats ───────────────────────────────────────────────────
  const listStats = useMemo(() => {
    const todayStr = format(now, "yyyy-MM-dd");
    let completed = 0, overdue = 0, total = 0;
    const overdueItems: { text: string; listTitle: string; listId: string; itemId: string; dueDate: string; overdueDays: number }[] = [];

    for (const list of myLists) {
      if (!list.items) continue;
      for (const item of list.items) {
        total++;
        if (item.completed) { completed++; continue; }
        if (item.due_date && item.due_date < todayStr) {
          const days = differenceInDays(parseISO(todayStr), parseISO(item.due_date));
          overdue++;
          overdueItems.push({
            text: item.text, listTitle: list.title,
            listId: list.id, itemId: item.id,
            dueDate: item.due_date, overdueDays: days,
          });
        }
      }
    }

    overdueItems.sort((a, b) => b.overdueDays - a.overdueDays);
    return { completed, overdue, total, overdueItems };
  }, [myLists]);

  // ── Stale counters ────────────────────────────────────────────────────
  const staleCounters = useMemo(() => {
    const today = startOfDay(now);
    const stale: { id: string; label: string; daysSince: number; type: string }[] = [];

    for (const c of counters) {
      if ((c.type || "since") !== "since") continue;
      if (!c.last_date) continue;
      const d = differenceInDays(today, startOfDay(parseISO(c.last_date)));
      if (d >= 7) {
        stale.push({ id: c.id, label: c.label, daysSince: d, type: c.type || "since" });
      }
    }
    return stale.sort((a, b) => b.daysSince - a.daysSince);
  }, [counters]);

  // ── Upcoming countdowns ────────────────────────────────────────────────
  const upcomingCountdowns = useMemo(() => {
    const today = startOfDay(now);
    const upcoming: { label: string; daysLeft: number }[] = [];

    for (const c of counters) {
      if (c.type !== "to" || !c.target_date) continue;
      const d = differenceInDays(startOfDay(parseISO(c.target_date)), today);
      if (d >= 0 && d <= 14) {
        upcoming.push({ label: c.label, daysLeft: d });
      }
    }
    return upcoming.sort((a, b) => a.daysLeft - b.daysLeft);
  }, [counters]);

  // ── History trends ──────────────────────────────────────────────────��──
  const trends = useMemo(() => {
    if (history.length < 2) return null;
    const recent = history.slice(0, 8); // last 8 weeks
    const meetingMins = recent.map((h: any) => h.totalMeetingMins || 0).reverse();
    const completedItems = recent.map((h: any) => h.completedItems || 0).reverse();

    // Month-over-month comparison (last 4 weeks vs previous 4 weeks)
    const last4 = history.slice(0, 4);
    const prev4 = history.slice(4, 8);

    let monthTrend: { pct: number; dir: "up" | "down" | "same" } | null = null;
    if (last4.length >= 2 && prev4.length >= 2) {
      const last4Avg = last4.reduce((s: number, h: any) => s + (h.totalMeetingMins || 0), 0) / last4.length;
      const prev4Avg = prev4.reduce((s: number, h: any) => s + (h.totalMeetingMins || 0), 0) / prev4.length;
      monthTrend = pctChange(last4Avg, prev4Avg);
    }

    return { meetingMins, completedItems, monthTrend };
  }, [history]);

  // ── Quick actions ──────────────────────────────────────────────────────
  const markDone = useCallback((key: string) => {
    setActionsDone(prev => new Set(prev).add(key));
  }, []);

  const handleReset = useCallback(async (id: string) => {
    try {
      await resetDaysSince(id);
      markDone(`reset:${id}`);
      setCounters(prev => prev.map(c => c.id === id ? { ...c, last_date: format(now, "yyyy-MM-dd") } : c));
    } catch (e) { console.error("Reset counter error:", e); }
  }, [markDone]);

  const handleReschedule = useCallback(async (listId: string, itemId: string) => {
    try {
      const newDate = format(addDays(now, 7), "yyyy-MM-dd");
      await editMyListItem(listId, itemId, { due_date: newDate });
      markDone(`reschedule:${listId}:${itemId}`);
    } catch (e) { console.error("Reschedule error:", e); }
  }, [markDone]);

  const handleArchive = useCallback(async (id: string) => {
    try {
      await deleteDaysSince(id);
      markDone(`archive:${id}`);
      setCounters(prev => prev.filter(c => c.id !== id));
    } catch (e) { console.error("Archive counter error:", e); }
  }, [markDone]);

  const handleSnoozeReminder = useCallback(async (id: string) => {
    try {
      const snoozed = addDays(now, 1).toISOString();
      await snoozeReminder(id, snoozed);
      markDone(`snooze:${id}`);
    } catch (e) { console.error("Snooze reminder error:", e); }
  }, [markDone]);

  // ── Save weekly summary to KV ──────────────────────────────────────────
  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const summary = {
        totalMeetings: meetingStats.thisCount,
        totalMeetingMins: meetingStats.thisMins,
        completedItems: listStats.completed,
        overdueItems: listStats.overdue,
        staleCounters: staleCounters.length,
        backToBack: meetingStats.backToBack,
        focusMins: timeAudit.focusMins,
        freeMins: timeAudit.freeMins,
        meetingFreeDays: timeAudit.meetingFreeDays.length,
        weekRange: `${format(weekStart, "MMM d")} – ${format(weekEnd, "MMM d, yyyy")}`,
      };
      await saveWeeklyReview(weekKey, summary);
      setSaved(true);
      // Refresh history
      const hist = await getWeeklyReviewHistory().catch(() => []);
      setHistory(Array.isArray(hist) ? hist : []);
    } catch (e) { console.error("Save weekly review error:", e); }
    finally { setSaving(false); }
  }, [meetingStats, listStats, staleCounters, timeAudit, weekKey]);

  // ── Already saved this week? ───────────────────────────────────────────
  const alreadySaved = useMemo(() =>
    saved || history.some((h: any) => h.weekKey === weekKey),
    [history, weekKey, saved]);

  const userName = user?.user_metadata?.name || "";
  const firstName = userName ? userName.split(" ")[0] : "";

  // ═══════════════════════════════════════════════════════════════════════
  // ── RENDER ─────────────────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════

  return (
    <div className="min-h-[100dvh] pb-24">

      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 glass-nav border-b">
        <div className="max-w-lg mx-auto flex items-center gap-3 px-4 py-3">
          <button onClick={() => navigate(-1)}
            className="p-1.5 -ml-1 rounded-xl hover:bg-white/20 transition">
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold text-foreground">Weekly Review</h1>
            <p className="text-[10px] text-muted-foreground truncate">
              {format(weekStart, "MMM d")} – {format(weekEnd, "MMM d, yyyy")}
            </p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving || alreadySaved}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition active:scale-95 disabled:opacity-50 ${alreadySaved ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20" : "glass text-primary"}`}
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> :
              alreadySaved ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
            {alreadySaved ? "Saved" : "Save"}
          </button>
        </div>
      </div>

      {/* ── Content ──────────────────────────────────────────────────── */}
      <div className="max-w-lg mx-auto px-4 pt-5 space-y-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-primary/50" />
            <p className="text-sm text-muted-foreground">Building your weekly review...</p>
          </div>
        ) : (
          <>
            {/* ── Hero greeting ─────────────────────────────────────── */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-elevated rounded-2xl px-5 py-4 text-center"
            >
              <div className="w-10 h-10 rounded-2xl mx-auto flex items-center justify-center bg-primary/10">
                <BarChart3 className="w-5 h-5 text-primary" />
              </div>
              <h2 className="text-lg font-bold mt-1 text-foreground">
                {firstName ? `${firstName}'s Week in Review` : "Your Week in Review"}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {format(weekStart, "EEEE, MMM d")} – {format(weekEnd, "EEEE, MMM d")}
              </p>
            </motion.div>

            {/* ═══ 1. MEETING SUMMARY ═══════════════════════════════ */}
            <Section icon={CalendarDays} title="Meeting Summary" subtitle={`${meetingStats.thisCount} meetings · ${fmtMins(meetingStats.thisMins)} total`}>
              {/* Headline insight */}
              <div className="mb-3 px-3 py-2.5 rounded-xl bg-primary/5">
                <p className="text-sm text-foreground/80 leading-relaxed">
                  You had <strong>{meetingStats.thisCount} meetings</strong> this week (<strong>{fmtMins(meetingStats.thisMins)}</strong> total).
                  {meetingStats.countDiff !== 0 && (
                    <> That&apos;s <strong>{Math.abs(meetingStats.countDiff)} {Math.abs(meetingStats.countDiff) === 1 ? "meeting" : "meetings"} {meetingStats.countDiff > 0 ? "more" : "fewer"}</strong> than last week.</>
                  )}
                  {meetingStats.countDiff === 0 && meetingStats.lastCount > 0 && (
                    <> Same count as last week.</>
                  )}
                  {meetingStats.backToBack > 0 && (
                    <> <span className="text-amber-600 font-medium">{meetingStats.backToBack} back-to-back</span> with no break.</>
                  )}
                </p>
              </div>

              {/* Stats pills */}
              <div className="grid grid-cols-2 gap-2 mb-3">
                <StatPill label="meetings" value={String(meetingStats.thisCount)} change={meetingStats.countChange} icon={CalendarDays} color="#1e1b4b" />
                <StatPill label="total time" value={fmtMins(meetingStats.thisMins)} change={meetingStats.change} icon={Clock} color="#3b82f6" />
              </div>

              {/* Daily breakdown chart */}
              <div className="mt-2">
                <p className="text-[10px] text-muted-foreground font-medium mb-2 uppercase tracking-wider">Daily Breakdown</p>
                <DailyBreakdownChart days={meetingStats.dailyBars} />
              </div>
            </Section>

            {/* ═══ 1b. TIME AUDIT ═════════════════════════════════ */}
            <Section icon={PieChart} title="Time Audit" subtitle="Where did your time go?">
              {/* Insight */}
              <div className="mb-3 px-3 py-2.5 rounded-xl bg-primary/5">
                <p className="text-sm text-foreground/80 leading-relaxed">
                  Of <strong>{fmtMins(timeAudit.totalWorkMins)}</strong> work hours this week,{" "}
                  <strong>{fmtMins(timeAudit.meetingMins)}</strong> went to meetings
                  {timeAudit.focusMins > 0 && <>, <strong>{fmtMins(timeAudit.focusMins)}</strong> to focus blocks</>}
                  , and <strong>{fmtMins(timeAudit.freeMins)}</strong> was free.
                  {timeAudit.focusDiffDir !== "same" && (
                    <> You had <strong className={timeAudit.focusDiffDir === "more" ? "text-emerald-600" : "text-amber-600"}>
                      {timeAudit.focusDiffHrs}h {timeAudit.focusDiffDir}
                    </strong> focus + free time than last week.</>
                  )}
                </p>
              </div>

              {/* Donut chart + legend */}
              <div className="flex items-center gap-4 mb-4">
                <svg width={96} height={96} viewBox="0 0 96 96" className="shrink-0">
                  {(() => {
                    const R = 38, CX = 48, CY = 48, C = 2 * Math.PI * R;
                    const total = Math.max(timeAudit.donut.reduce((s, d) => s + d.mins, 0), 1);
                    let offset = 0;
                    return timeAudit.donut.map((seg, i) => {
                      const pct = seg.mins / total;
                      const dash = pct * C;
                      const gap = C - dash;
                      const el = (
                        <circle key={seg.label} cx={CX} cy={CY} r={R} fill="none" strokeWidth={14}
                          stroke={seg.color}
                          strokeDasharray={`${dash} ${gap}`}
                          strokeDashoffset={-offset}
                          strokeLinecap="round"
                          style={{ transform: "rotate(-90deg)", transformOrigin: "center" }}
                        />
                      );
                      offset += dash;
                      return el;
                    });
                  })()}
                  <text x={48} y={45} textAnchor="middle" className="text-[11px] font-bold fill-foreground">
                    {Math.round(timeAudit.meetingMins / timeAudit.totalWorkMins * 100)}%
                  </text>
                  <text x={48} y={57} textAnchor="middle" className="text-[8px] fill-muted-foreground">
                    in meetings
                  </text>
                </svg>
                <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                  {timeAudit.donut.map((seg) => (
                    <div key={seg.label} className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: seg.color }} />
                      <span className="text-[11px] text-foreground/80 flex-1 min-w-0 truncate">{seg.label}</span>
                      <span className="text-[11px] font-semibold text-foreground shrink-0">{fmtMins(seg.mins)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Category tags */}
              {timeAudit.catEntries.length > 0 && (
                <div className="mb-4">
                  <p className="text-[10px] text-muted-foreground font-medium mb-2 uppercase tracking-wider">Meeting Categories</p>
                  <div className="space-y-1.5">
                    {timeAudit.catEntries.map((cat) => {
                      const maxCatMins = Math.max(...timeAudit.catEntries.map(c => c.mins), 1);
                      const barPct = Math.max(4, (cat.mins / maxCatMins) * 100);
                      const catColor = timeAudit.CAT_COLORS[cat.name] || "#94a3b8";
                      return (
                        <div key={cat.name} className="flex items-center gap-2">
                          <span className="text-[10px] text-foreground/70 w-14 shrink-0 truncate">{cat.name}</span>
                          <div className="flex-1 h-4 rounded-md overflow-hidden" style={{ background: "rgba(0,0,0,0.04)" }}>
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${barPct}%` }}
                              transition={{ type: "spring", damping: 20, stiffness: 180 }}
                              className="h-full rounded-md"
                              style={{ background: catColor }}
                            />
                          </div>
                          <span className="text-[10px] text-muted-foreground w-10 text-right shrink-0">{fmtMins(cat.mins)}</span>
                          <span className="text-[9px] text-muted-foreground/60 w-4 text-right shrink-0">{cat.count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Daily stacked time bars */}
              <div className="mb-4">
                <p className="text-[10px] text-muted-foreground font-medium mb-2 uppercase tracking-wider">Daily Time Split</p>
                <div className="flex items-end justify-between gap-1 sm:gap-2 px-0.5" style={{ height: 72 }}>
                  {timeAudit.dailyStacked.map((d, i) => {
                    const total = d.meeting + d.focus + d.free;
                    const maxDay = Math.max(...timeAudit.dailyStacked.map(x => x.meeting + x.focus + x.free), 1);
                    const h = total > 0 ? Math.max(6, (total / maxDay) * 52) : 2;
                    const meetPct = total > 0 ? (d.meeting / total) * 100 : 0;
                    const focPct = total > 0 ? (d.focus / total) * 100 : 0;
                    return (
                      <div key={d.label} className="flex flex-col items-center flex-1 min-w-0">
                        <div className="w-full rounded-md overflow-hidden" style={{ height: h, maxWidth: 40 }}>
                          <div className="flex flex-col h-full">
                            {d.meeting > 0 && <div style={{ height: `${meetPct}%`, background: "#1e1b4b" }} />}
                            {d.focus > 0 && <div style={{ height: `${focPct}%`, background: "#3b82f6" }} />}
                            <div className="flex-1" style={{ background: "rgba(30,27,75,0.06)" }} />
                          </div>
                        </div>
                        <span className="text-[9px] sm:text-[10px] mt-1 leading-none"
                          style={{ fontWeight: d.isToday ? 700 : 500, color: d.isToday ? "var(--foreground)" : "var(--muted-foreground)" }}>
                          {d.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center gap-3 mt-2 justify-center">
                  <span className="flex items-center gap-1 text-[9px] text-muted-foreground"><span className="w-2 h-2 rounded-sm" style={{ background: "#1e1b4b" }} />Meetings</span>
                  <span className="flex items-center gap-1 text-[9px] text-muted-foreground"><span className="w-2 h-2 rounded-sm" style={{ background: "#3b82f6" }} />Focus</span>
                  <span className="flex items-center gap-1 text-[9px] text-muted-foreground"><span className="w-2 h-2 rounded-sm" style={{ background: "rgba(30,27,75,0.08)" }} />Free</span>
                </div>
              </div>

              {/* Meeting-free streaks */}
              {timeAudit.meetingFreeDays.length > 0 && (
                <div className="px-3 py-2.5 rounded-xl" style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.12)" }}>
                  <div className="flex items-center gap-2">
                    <Coffee className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <p className="text-sm text-foreground/80 leading-relaxed">
                      {timeAudit.meetingFreeDays.length === 5 ? (
                        <><strong className="text-emerald-600">Zero-meeting week!</strong> All 5 workdays were meeting-free.</>
                      ) : timeAudit.longestStreak.length >= 2 ? (
                        <><strong className="text-emerald-600">{timeAudit.longestStreak.length}-day meeting-free streak</strong> ({timeAudit.longestStreak.join(" - ")}).</>
                      ) : (
                        <><strong>{timeAudit.meetingFreeDays.length}</strong> meeting-free day{timeAudit.meetingFreeDays.length !== 1 ? "s" : ""}: {timeAudit.meetingFreeDays.join(", ")}.</>
                      )}
                    </p>
                  </div>
                </div>
              )}
            </Section>

            {/* ═══ 2. LIST ITEMS ═══════════════════════════════════ */}
            <Section icon={ListChecks} title="Lists & Action Items"
              subtitle={`${listStats.completed} completed · ${listStats.overdue} overdue`}
              accentColor="#0ea5e9">

              <div className="mb-3 px-3 py-2.5 rounded-xl" style={{ background: "rgba(14,165,233,0.06)" }}>
                <p className="text-sm text-foreground/80 leading-relaxed">
                  You completed <strong>{listStats.completed} list items</strong>
                  {listStats.overdue > 0 ? (
                    <> but <strong className="text-amber-600">{listStats.overdue} {listStats.overdue === 1 ? "is" : "are"} overdue</strong>.</>
                  ) : (
                    <> and you&apos;re all caught up — no overdue items!</>
                  )}
                </p>
              </div>

              {/* Overdue items with actions */}
              {listStats.overdueItems.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] text-amber-600 font-semibold uppercase tracking-wider">Overdue Items</p>
                  {listStats.overdueItems.slice(0, 5).map((item) => {
                    const rKey = `reschedule:${item.listId}:${item.itemId}`;
                    return (
                      <div key={`${item.listId}-${item.itemId}`}
                        className="flex items-start gap-2 px-3 py-2 rounded-xl glass border border-amber-500/15">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-foreground truncate">{item.text}</p>
                          <p className="text-[10px] text-muted-foreground">{item.listTitle} · {item.overdueDays}d overdue</p>
                        </div>
                        {!actionsDone.has(rKey) ? (
                          <ActionBtn icon={CalendarPlus} label="Reschedule" color="#f59e0b"
                            onClick={() => handleReschedule(item.listId, item.itemId)} />
                        ) : (
                          <span className="text-[10px] text-emerald-600 font-medium flex items-center gap-0.5">
                            <CheckCircle2 className="w-3 h-3" /> Done
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </Section>

            {/* ═══ 3. STALE COUNTERS ══════════════════════════════ */}
            {staleCounters.length > 0 && (
              <Section icon={Timer} title="Counters to Review"
                subtitle={`${staleCounters.length} counter${staleCounters.length !== 1 ? "s" : ""} not reset recently`}
                accentColor="#f59e0b">

                <div className="mb-3 px-3 py-2.5 rounded-xl" style={{ background: "rgba(245,158,11,0.06)" }}>
                  <p className="text-sm text-foreground/80 leading-relaxed">
                    You haven&apos;t reset these counters in a while:
                    {" "}<strong>{staleCounters.slice(0, 3).map(c => `${c.label} (${c.daysSince}d)`).join(", ")}</strong>
                    {staleCounters.length > 3 && ` and ${staleCounters.length - 3} more`}.
                  </p>
                </div>

                <div className="space-y-2">
                  {staleCounters.map((c) => (
                    <div key={c.id}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-xl glass"
                      style={{
                        borderColor: c.daysSince >= 30 ? "rgba(239,68,68,0.15)" : "rgba(245,158,11,0.15)",
                      }}>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{c.label}</p>
                        <p className="text-[10px]" style={{ color: c.daysSince >= 30 ? "#dc2626" : "#d97706" }}>
                          {c.daysSince} days since last reset
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {!actionsDone.has(`reset:${c.id}`) && !actionsDone.has(`archive:${c.id}`) ? (
                          <>
                            <ActionBtn icon={RotateCcw} label="Reset" color="#10b981"
                              onClick={() => handleReset(c.id)} />
                            <ActionBtn icon={Archive} label="Archive" color="#6b7280"
                              onClick={() => handleArchive(c.id)} />
                          </>
                        ) : (
                          <span className="text-[10px] text-emerald-600 font-medium flex items-center gap-0.5">
                            <CheckCircle2 className="w-3 h-3" />
                            {actionsDone.has(`reset:${c.id}`) ? "Reset" : "Archived"}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* ═══ 4. UPCOMING COUNTDOWNS ═════════════════════════ */}
            {upcomingCountdowns.length > 0 && (
              <Section icon={TrendingUp} title="Coming Up" subtitle="Countdowns within 2 weeks">
                <div className="space-y-1.5">
                  {upcomingCountdowns.map((cd, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-xl glass">
                      {cd.daysLeft === 0
                        ? <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0" />
                        : cd.daysLeft <= 3
                          ? <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          : <CalendarDays className="w-3.5 h-3.5 text-primary/50 shrink-0" />
                      }
                      <p className="text-xs text-foreground/80 flex-1 min-w-0 truncate">{cd.label}</p>
                      <span className="text-[10px] font-semibold shrink-0" style={{
                        color: cd.daysLeft === 0 ? "var(--destructive)" : cd.daysLeft <= 3 ? "#f59e0b" : "var(--primary)"
                      }}>
                        {cd.daysLeft === 0 ? "Today!" : cd.daysLeft === 1 ? "Tomorrow" : `${cd.daysLeft}d left`}
                      </span>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* ═══ 5. TRENDS (if history exists) ═════════════════ */}
            {trends && (
              <Section icon={BarChart3} title="Trends Over Time"
                subtitle={history.length >= 2 ? `${history.length} week${history.length !== 1 ? "s" : ""} of data` : undefined}>

                {trends.monthTrend && trends.monthTrend.dir !== "same" && (
                  <div className="mb-3 px-3 py-2.5 rounded-xl bg-primary/5">
                    <p className="text-sm text-foreground/80 leading-relaxed">
                      Your meeting load has {trends.monthTrend.dir === "up" ? (
                        <strong className="text-red-500">increased {trends.monthTrend.pct}%</strong>
                      ) : (
                        <strong className="text-emerald-600">decreased {trends.monthTrend.pct}%</strong>
                      )} compared to the prior 4 weeks.
                    </p>
                  </div>
                )}

                <div className="space-y-3">
                  {trends.meetingMins.length >= 2 && (
                    <div>
                      <p className="text-[10px] text-muted-foreground font-medium mb-1 uppercase tracking-wider">Meeting Hours</p>
                      <TrendSparkline values={trends.meetingMins} label={`Last ${trends.meetingMins.length} weeks`} color="#1e1b4b" />
                    </div>
                  )}
                  {trends.completedItems.length >= 2 && (
                    <div>
                      <p className="text-[10px] text-muted-foreground font-medium mb-1 uppercase tracking-wider">Items Completed</p>
                      <TrendSparkline values={trends.completedItems} label={`Last ${trends.completedItems.length} weeks`} color="#0ea5e9" />
                    </div>
                  )}
                </div>
              </Section>
            )}

            {/* ── Bottom CTA ─────────────────────────────────────── */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="pt-2 pb-4"
            >
              <button
                onClick={() => navigate("/assistant", { state: { initialMessage: "Summarize my week for me" } })}
                className="w-full glass flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold text-primary transition active:scale-[0.98] hover:bg-white/20"
              >
                <Sparkles className="w-4 h-4" />
                Summarize in Assistant
              </button>
            </motion.div>
          </>
        )}
      </div>
    </div>
  );
}