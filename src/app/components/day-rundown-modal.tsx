import React, { useEffect, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import {
  X, CalendarDays, CheckSquare, Clock, Bell,
  Loader2, Circle, CheckCircle2, MapPin, Wind,
  AlertTriangle, Cake, Timer, TrendingUp, Coffee,
  Sparkles, ArrowRight
} from "lucide-react";
import { format, differenceInMinutes, differenceInDays, parseISO, startOfDay, endOfDay, startOfWeek, addDays, isAfter, isBefore, isSameDay } from "date-fns";
import { getEvents, getTasks, getReminders, queryAvailability, getMyLists, getDaysSince } from "../lib/api";
import { formatTimeInTz, getDeviceTimezone, isTodayInTz } from "../lib/timezone-utils";
import { DateTime } from "luxon";
import { getWeatherLocation } from "../lib/weather-location";
import { useNavigate } from "react-router";

interface DayRundownModalProps {
  open: boolean;
  onClose: () => void;
  userTimezone?: string;
  userName?: string;
  targetStart?: Date;   // defaults to now — the first day of the range
  targetEnd?: Date;     // defaults to end of targetStart's day
  targetLabel?: string; // custom label e.g. "Tomorrow", "Next Week"
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getPhase(hour: number): {
  greeting: string;
  label: string;
  emoji: string;
  heroGradient: string;
  sheetGradient: string;
  cardBg: string;
  cardBorder: string;
  heroText: string;
  heroSubText: string;
  sectionText: string;
} {
  // Dawn: 5–7
  if (hour >= 5 && hour < 7)
    return {
      greeting: "Good Morning", label: "Dawn Brief", emoji: "🌅",
      heroGradient: "linear-gradient(160deg, #fce4b8 0%, #f9d4a0 30%, #f2b6c1 65%, #deb3d9 100%)",
      sheetGradient: "linear-gradient(180deg, #fdf3e7 0%, #fdf0e0 40%, #fbeae8 100%)",
      cardBg: "rgba(255,248,240,0.65)", cardBorder: "rgba(242,182,193,0.25)",
      heroText: "#3d2c1e", heroSubText: "#7a5f48",
      sectionText: "#8a6940",
    };
  // Morning: 7–12
  if (hour >= 7 && hour < 12)
    return {
      greeting: "Good Morning", label: "Morning Brief", emoji: "☀️",
      heroGradient: "linear-gradient(160deg, #fef3c7 0%, #fde68a 30%, #fbcfe8 70%, #f3e8ff 100%)",
      sheetGradient: "linear-gradient(180deg, #fefcf3 0%, #fef9e7 40%, #fdf2f8 100%)",
      cardBg: "rgba(255,252,245,0.65)", cardBorder: "rgba(253,224,138,0.25)",
      heroText: "#3d2c1e", heroSubText: "#7a6530",
      sectionText: "#7a6530",
    };
  // Early Afternoon: 12–15
  if (hour >= 12 && hour < 15)
    return {
      greeting: "Good Afternoon", label: "Midday Rundown", emoji: "🌤",
      heroGradient: "linear-gradient(160deg, #dbeafe 0%, #bfdbfe 35%, #c7d2fe 65%, #e0e7ff 100%)",
      sheetGradient: "linear-gradient(180deg, #f0f4ff 0%, #eef2ff 40%, #f5f3ff 100%)",
      cardBg: "rgba(240,244,255,0.65)", cardBorder: "rgba(191,219,254,0.3)",
      heroText: "#1e2a4a", heroSubText: "#4b5e80",
      sectionText: "#4b5e80",
    };
  // Late Afternoon: 15–18
  if (hour >= 15 && hour < 18)
    return {
      greeting: "Good Afternoon", label: "Afternoon Check-in", emoji: "⛅",
      heroGradient: "linear-gradient(160deg, #e0e7ff 0%, #c4b5fd 35%, #ddd6fe 65%, #fbcfe8 100%)",
      sheetGradient: "linear-gradient(180deg, #f3f0ff 0%, #f0edff 40%, #fdf2f8 100%)",
      cardBg: "rgba(243,240,255,0.6)", cardBorder: "rgba(196,181,253,0.25)",
      heroText: "#2d1f5e", heroSubText: "#6b5a96",
      sectionText: "#6b5a96",
    };
  // Sunset / Evening: 18–21
  if (hour >= 18 && hour < 21)
    return {
      greeting: "Good Evening", label: "Evening Rundown", emoji: "🌇",
      heroGradient: "linear-gradient(160deg, #fde68a 0%, #fdba74 30%, #fb923c 55%, #f87171 80%, #e879a0 100%)",
      sheetGradient: "linear-gradient(180deg, #fef7ed 0%, #fff1e6 35%, #fee2e2 70%, #fdf2f8 100%)",
      cardBg: "rgba(255,247,237,0.6)", cardBorder: "rgba(253,186,116,0.25)",
      heroText: "#3d1f0e", heroSubText: "#7a4a28",
      sectionText: "#8a5530",
    };
  // Night: 21–5
  return {
    greeting: "Good Night", label: "Day Wrap", emoji: "🌙",
    heroGradient: "linear-gradient(160deg, #312e81 0%, #3b0764 35%, #4c1d95 65%, #1e1b4b 100%)",
    sheetGradient: "linear-gradient(180deg, #1e1b4b 0%, #1e1348 25%, #1a0f3a 50%, #0f0a2a 100%)",
    cardBg: "rgba(30,27,75,0.5)", cardBorder: "rgba(129,140,248,0.2)",
    heroText: "#e0e7ff", heroSubText: "#a5b4fc",
    sectionText: "#a5b4fc",
  };
}

function isNightPhase(hour: number): boolean {
  return hour >= 21 || hour < 5;
}

function formatDurationMins(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function totalFreeHours(slots: any[]): string {
  const total = slots.reduce((acc: number, s: any) => {
    return acc + differenceInMinutes(new Date(s.end_at), new Date(s.start_at));
  }, 0);
  if (total === 0) return "0h";
  return formatDurationMins(total);
}

const PROVIDER_STYLE: Record<string, { pill: string; dot: string; badge: string; label: string }> = {
  google: { pill: "bg-blue-500/12 border-blue-400/30", dot: "#3B82F6", badge: "text-[#3B82F6]", label: "G" },
  ics:    { pill: "bg-amber-500/12 border-amber-400/30", dot: "#F59E0B", badge: "text-amber-500", label: "ICS" },
  caldav: { pill: "bg-teal-500/12 border-teal-400/30", dot: "#14B8A6", badge: "text-teal-500", label: "DAV" },
  manual: { pill: "bg-violet-500/12 border-violet-400/30", dot: "#7C3AED", badge: "text-violet-600", label: "M" },
};
function providerStyle(p?: string) { return PROVIDER_STYLE[p || "manual"] || PROVIDER_STYLE.manual; }

// ── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, icon: Icon, children, count, night, badge }: {
  title: string; icon: React.ElementType; children: React.ReactNode; count?: number; night?: boolean; badge?: { text: string; color: string; bg: string };
}) {
  return (
    <div
      className="rounded-2xl p-4"
      style={{
        background: night ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.55)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        border: night ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(255,255,255,0.5)",
        boxShadow: night ? "0 2px 12px rgba(0,0,0,0.2)" : "0 2px 12px rgba(0,0,0,0.06)",
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-3.5 h-3.5" style={{ color: night ? "#a5b4fc" : "#6b7280" }} />
        <span
          className="text-[11px] font-semibold uppercase tracking-widest"
          style={{ color: night ? "#c7d2fe" : "#374151" }}
        >
          {title}
        </span>
        {count !== undefined && count > 0 && (
          <span
            className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
            style={{
              background: night ? "rgba(129,140,248,0.2)" : "rgba(99,102,241,0.12)",
              color: night ? "#a5b4fc" : "#6366f1",
            }}
          >
            {count}
          </span>
        )}
        {badge && (
          <span
            className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
            style={{ background: badge.bg, color: badge.color }}
          >
            {badge.text}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

// ── Prep Gap Indicator ───────────────────────────────────────────────────────

function PrepGapIndicator({ minutes, startTime, tz, night }: { minutes: number; startTime: string; tz: string; night?: boolean }) {
  const isShort = minutes <= 10;
  const isTight = minutes <= 5;
  return (
    <div className="flex items-center gap-2 py-0.5 pl-3">
      <div className="relative w-6 flex items-center justify-center shrink-0 z-10">
        <div
          className="w-[3px] h-4 rounded-full"
          style={{
            background: isTight
              ? (night ? "rgba(248,113,113,0.5)" : "rgba(239,68,68,0.3)")
              : isShort
                ? (night ? "rgba(251,191,36,0.5)" : "rgba(245,158,11,0.3)")
                : (night ? "rgba(52,211,153,0.4)" : "rgba(16,185,129,0.3)"),
          }}
        />
      </div>
      <div className="flex items-center gap-1.5 flex-1">
        <Coffee className="w-3 h-3" style={{
          color: isTight ? "#ef4444" : isShort ? "#f59e0b" : (night ? "#34d399" : "#059669"),
        }} />
        <span className="text-[10px] font-medium" style={{
          color: isTight
            ? (night ? "#fca5a5" : "#dc2626")
            : isShort
              ? (night ? "#fcd34d" : "#d97706")
              : (night ? "#6ee7b7" : "#059669"),
        }}>
          {formatDurationMins(minutes)} gap
          {isTight ? " — no prep time!" : isShort ? " — tight" : " — prep time"}
        </span>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function DayRundownModal({ open, onClose, userTimezone, userName, targetStart, targetEnd, targetLabel }: DayRundownModalProps) {
  const navigate = useNavigate();
  const tz = userTimezone || getDeviceTimezone();
  const now = new Date();
  // Reference date for the rundown (defaults to now for "today")
  const refDate = targetStart || now;
  const rangeEnd = targetEnd || endOfDay(refDate);
  const isToday = isSameDay(refDate, now) && !targetStart;
  const isMultiDay = !isSameDay(startOfDay(refDate), startOfDay(rangeEnd));
  const hour = isToday ? now.getHours() : refDate.getHours();
  const phase = getPhase(isToday ? hour : 10); // future dates use morning theme

  const [events, setEvents] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [myLists, setMyLists] = useState<any[]>([]);
  const [counters, setCounters] = useState<any[]>([]);
  const [reminders, setReminders] = useState<any[]>([]);
  const [freeSlots, setFreeSlots] = useState<any[]>([]);
  const [weekEvents, setWeekEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // ── Weather state ──────────────────────────────────────────────────────────
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [locationDenied, setLocationDenied] = useState(false);
  const [weatherCity, setWeatherCity] = useState<string | null>(null);

  // Fetch weather once on first open (only for today) — prefer stored city, fall back to geolocation
  useEffect(() => {
    if (!open || weather || locationDenied || weatherLoading || !isToday) return;
    setWeatherLoading(true);

    const storedLoc = getWeatherLocation();
    if (storedLoc) {
      setWeatherCity(storedLoc.city);
      fetchWeather(storedLoc.latitude, storedLoc.longitude)
        .then(setWeather)
        .catch((e) => console.error("Weather fetch error:", e))
        .finally(() => setWeatherLoading(false));
    } else {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          try {
            const w = await fetchWeather(pos.coords.latitude, pos.coords.longitude);
            setWeather(w);
          } catch (e) {
            console.error("Weather fetch error:", e);
          } finally {
            setWeatherLoading(false);
          }
        },
        () => {
          setLocationDenied(true);
          setWeatherLoading(false);
        },
        { timeout: 8000, maximumAge: 5 * 60 * 1000 }
      );
    }
  }, [open]);

  // Reset when fully closed
  useEffect(() => {
    if (!open) {
      setLoaded(false);
      setWeather(null);
      setLocationDenied(false);
      setWeatherCity(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open || loaded) return;
    setLoading(true);

    const rangeStart = targetStart 
      ? targetStart.toISOString() 
      : DateTime.now().setZone(tz).startOf("day").toISO()!;
    const rangeEndISO = targetEnd 
      ? targetEnd.toISOString() 
      : DateTime.now().setZone(tz).endOf("day").toISO()!;

    // Fetch this week's events for meeting load trend
    const weekStart = startOfWeek(refDate, { weekStartsOn: 1 }); // Monday
    const weekEnd = endOfDay(addDays(weekStart, 6)); // Sunday end

    // For availability, use "now" as start if today, else start-of-range
    const availStart = isToday ? now.toISOString() : rangeStart;

    Promise.all([
      getEvents(rangeStart, rangeEndISO),
      getTasks("open"),
      getReminders(),
      queryAvailability({
        start_at: availStart,
        end_at: rangeEndISO,
        timezone: tz,
        mode: "any",
        duration_minutes: 15,
      }).catch(() => ({ free_slots: [] })),
      getMyLists().catch(() => []),
      getDaysSince().catch(() => []),
      getEvents(weekStart.toISOString(), weekEnd.toISOString()).catch(() => []),
    ])
      .then(([ev, t, r, avail, ml, ds, wev]) => {
        setEvents((ev as any[]).sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()));
        setTasks((t as any[]).filter((x: any) => x.status === "open"));
        setReminders((r as any[]).filter((x: any) => x.is_enabled));
        setFreeSlots((avail?.free_slots || []).slice(0, 6));
        setMyLists(Array.isArray(ml) ? ml : []);
        setCounters(Array.isArray(ds) ? ds : []);
        setWeekEvents(Array.isArray(wev) ? wev as any[] : []);
        setLoaded(true);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [open, tz]);

  useEffect(() => { if (!open) { setLoaded(false); } }, [open]);

  // Escape key
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  // Classify events — for non-today dates, everything is "future" (upcoming)
  const { pastEvents, currentEvent, futureEvents } = useMemo(() => {
    if (!isToday) {
      return { pastEvents: [] as any[], currentEvent: null, futureEvents: events };
    }
    const past: any[] = [], future: any[] = [];
    let current: any = null;
    events.forEach((ev) => {
      const start = new Date(ev.start_at);
      const end = new Date(ev.end_at);
      if (isBefore(end, now)) {
        past.push(ev);
      } else if (!isAfter(start, now) && isAfter(end, now)) {
        current = ev;
      } else {
        future.push(ev);
      }
    });
    return { pastEvents: past, currentEvent: current, futureEvents: future };
  }, [events, isToday]);

  // Gap analysis — compute prep gaps between consecutive future events
  const gapMap = useMemo(() => {
    const map = new Map<string, number>(); // eventId → gap minutes BEFORE this event
    const upcoming = currentEvent ? [currentEvent, ...futureEvents] : [...futureEvents];
    for (let i = 1; i < upcoming.length; i++) {
      const prevEnd = new Date(upcoming[i - 1].end_at);
      const nextStart = new Date(upcoming[i].start_at);
      const gap = differenceInMinutes(nextStart, prevEnd);
      if (gap >= 0 && gap <= 60) { // Only show gaps ≤60m (meaningful prep context)
        map.set(upcoming[i].id, gap);
      }
    }
    return map;
  }, [currentEvent, futureEvents]);

  // Back-to-back count (≤5m gaps)
  const backToBackCount = useMemo(() => {
    let count = 0;
    gapMap.forEach((gap) => { if (gap <= 5) count++; });
    return count;
  }, [gapMap]);

  // Overdue + due-today/due-in-range items from My Lists
  const actionItems = useMemo(() => {
    const todayStr = format(refDate, "yyyy-MM-dd");
    const rangeEndStr = format(rangeEnd, "yyyy-MM-dd");
    const items: { text: string; listTitle: string; dueDate: string; isOverdue: boolean }[] = [];
    for (const list of myLists) {
      if (!list.items) continue;
      for (const item of list.items) {
        if (item.completed) continue;
        if (!item.due_date) continue;
        const isOverdue = item.due_date < todayStr;
        const isInRange = item.due_date >= todayStr && item.due_date <= rangeEndStr;
        if (isOverdue || isInRange) {
          items.push({ text: item.text, listTitle: list.title, dueDate: item.due_date, isOverdue });
        }
      }
    }
    return items.sort((a, b) => {
      if (a.isOverdue && !b.isOverdue) return -1;
      if (!a.isOverdue && b.isOverdue) return 1;
      return a.dueDate.localeCompare(b.dueDate);
    });
  }, [myLists]);

  // Counter milestones — counters approaching notable thresholds
  const counterAlerts = useMemo(() => {
    const today = startOfDay(new Date());
    const alerts: { label: string; days: number; type: "since" | "to"; milestone: string; isUrgent: boolean }[] = [];
    for (const c of counters) {
      if (c.type === "to" && c.target_date) {
        const target = startOfDay(parseISO(c.target_date));
        const dLeft = differenceInDays(target, today);
        if (dLeft >= 0 && dLeft <= 7) {
          alerts.push({
            label: c.label,
            days: dLeft,
            type: "to",
            milestone: dLeft === 0 ? "Today!" : dLeft === 1 ? "Tomorrow" : `${dLeft} days left`,
            isUrgent: dLeft <= 2,
          });
        }
      }
      if ((c.type || "since") === "since" && c.last_date) {
        const lastDate = startOfDay(parseISO(c.last_date));
        const daysSince = differenceInDays(today, lastDate);
        const THRESHOLDS = [7, 14, 21, 30, 45, 60, 90, 100, 180, 365];
        for (const t of THRESHOLDS) {
          if (daysSince >= t && daysSince <= t + 2) {
            alerts.push({
              label: c.label,
              days: daysSince,
              type: "since",
              milestone: `${daysSince} days`,
              isUrgent: daysSince >= 30,
            });
            break;
          }
        }
      }
    }
    return alerts.sort((a, b) => {
      if (a.type === "to" && b.type !== "to") return -1;
      if (a.type !== "to" && b.type === "to") return 1;
      if (a.isUrgent && !b.isUrgent) return -1;
      if (!a.isUrgent && b.isUrgent) return 1;
      return a.days - b.days;
    });
  }, [counters]);

  // Upcoming birthdays (from counters with "birthday" in label)
  const birthdays = useMemo(() => {
    const today = startOfDay(new Date());
    const results: { name: string; date: string; daysUntil: number; isToday: boolean }[] = [];
    for (const c of counters) {
      if (!c.label?.toLowerCase().includes("birthday")) continue;
      const raw = c.target_date ? parseISO(c.target_date) : c.last_date ? parseISO(c.last_date) : null;
      if (!raw) continue;
      let nextBday = new Date(today.getFullYear(), raw.getMonth(), raw.getDate());
      if (nextBday < today) nextBday = new Date(today.getFullYear() + 1, raw.getMonth(), raw.getDate());
      const daysUntil = differenceInDays(startOfDay(nextBday), today);
      if (daysUntil <= 7) {
        let name = c.label
          .replace(/['']\s*s?\s*birthday/i, "")
          .replace(/birthday\s*(of|for)?\s*/i, "")
          .trim();
        if (!name) name = c.label;
        results.push({ name, date: format(nextBday, "MMM d"), daysUntil, isToday: daysUntil === 0 });
      }
    }
    return results.sort((a, b) => a.daysUntil - b.daysUntil);
  }, [counters]);

  // Derived states
  const allPast = pastEvents.length > 0 && !currentEvent && futureEvents.length === 0;

  // Reminders in the target range
  const todayReminders = useMemo(() => reminders.filter((r: any) => {
    if (!r.remind_at) return false;
    const d = new Date(r.remind_at);
    const tzStart = targetStart || new Date(DateTime.now().setZone(tz).startOf("day").toISO()!);
    const tzEnd = targetEnd || new Date(DateTime.now().setZone(tz).endOf("day").toISO()!);
    return d >= tzStart && d <= tzEnd;
  }), [reminders, targetStart, targetEnd, tz]);

  const freeLabel = totalFreeHours(freeSlots);
  const name = userName ? userName.split(" ")[0] : "";
  const greetingLine = isToday
    ? (name ? `${phase.greeting}, ${name}!` : `${phase.greeting}!`)
    : (targetLabel || format(refDate, "EEEE"));
  const night = isToday ? isNightPhase(hour) : false;

  // ── Meeting Load Analysis ──────────────────────────────────────────────
  const dayVibe = useMemo(() => {
    // Filter today's timed events (skip all-day ≥23h)
    const todayTimed = events.filter(ev => {
      const dur = differenceInMinutes(new Date(ev.end_at), new Date(ev.start_at));
      return dur < 23 * 60;
    });
    const todayMeetingMins = todayTimed.reduce((s, ev) =>
      s + Math.max(0, differenceInMinutes(new Date(ev.end_at), new Date(ev.start_at))), 0);
    const todayHours = todayMeetingMins / 60;

    // Compute weekly average (excluding today for fair comparison)
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const otherDayMins: Record<string, number> = {};
    let daysWithEvents = 0;

    for (const ev of weekEvents) {
      const evStart = new Date(ev.start_at);
      const dur = differenceInMinutes(new Date(ev.end_at), evStart);
      if (dur >= 23 * 60) continue; // skip all-day
      if (isSameDay(evStart, now)) continue; // exclude today
      const dayKey = format(evStart, "yyyy-MM-dd");
      otherDayMins[dayKey] = (otherDayMins[dayKey] || 0) + Math.max(0, dur);
    }

    // Count weekdays that have already passed (excluding today) for a fair avg
    const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ...
    const mondayBased = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // 0=Mon, 6=Sun
    const pastWeekdays = Math.max(1, mondayBased); // days before today this week
    const otherDayValues = Object.values(otherDayMins);
    const weekAvgMins = otherDayValues.length > 0
      ? otherDayValues.reduce((a, b) => a + b, 0) / pastWeekdays
      : 0;
    const weekAvgHours = weekAvgMins / 60;

    // Determine trend
    let trend: "lighter" | "heavier" | "similar" | "none" = "none";
    let trendPct = 0;
    if (weekAvgMins > 0) {
      const diff = todayMeetingMins - weekAvgMins;
      trendPct = Math.round((Math.abs(diff) / weekAvgMins) * 100);
      if (trendPct >= 25) {
        trend = diff > 0 ? "heavier" : "lighter";
      } else {
        trend = "similar";
      }
    }

    // Classify the day vibe
    let emoji: string;
    let label: string;
    let description: string;
    let vibeColor: string;

    if (todayTimed.length === 0) {
      emoji = "🧘"; label = "Open Day"; description = "No meetings — all focus time";
      vibeColor = "#10b981";
    } else if (todayHours <= 1) {
      emoji = "☕"; label = "Quiet Day"; description = `Just ${todayTimed.length} meeting${todayTimed.length !== 1 ? "s" : ""}`;
      vibeColor = "#10b981";
    } else if (todayHours <= 2.5) {
      emoji = "✨"; label = "Light Day"; description = `${formatDurationMins(todayMeetingMins)} of meetings`;
      vibeColor = "#3b82f6";
    } else if (todayHours <= 4.5) {
      emoji = "📋"; label = "Moderate Day"; description = `${formatDurationMins(todayMeetingMins)} of meetings`;
      vibeColor = "#f59e0b";
    } else if (todayHours <= 6) {
      emoji = "🔥"; label = "Packed Day"; description = `${formatDurationMins(todayMeetingMins)} of meetings`;
      vibeColor = "#ef4444";
    } else {
      emoji = "😵"; label = "Marathon Day"; description = `${formatDurationMins(todayMeetingMins)} of meetings!`;
      vibeColor = "#dc2626";
    }

    return {
      emoji, label, description, vibeColor,
      todayHours, weekAvgHours,
      trend, trendPct,
      todayCount: todayTimed.length,
      backToBack: backToBackCount,
    };
  }, [events, weekEvents, backToBackCount]);

  // ── Weekly bar chart data ──────────────────────────────────────────────
  const weeklyBarData = useMemo(() => {
    const weekMon = startOfWeek(now, { weekStartsOn: 1 });
    const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const bars: { label: string; date: Date; minutes: number; isToday: boolean; isFuture: boolean }[] = [];

    for (let i = 0; i < 7; i++) {
      const day = addDays(weekMon, i);
      const dayStr = format(day, "yyyy-MM-dd");
      const isToday = isSameDay(day, now);
      const isFuture = isAfter(startOfDay(day), startOfDay(now));

      let mins = 0;
      if (isToday) {
        // Use already-loaded today events for accuracy
        for (const ev of events) {
          const dur = differenceInMinutes(new Date(ev.end_at), new Date(ev.start_at));
          if (dur < 23 * 60) mins += Math.max(0, dur);
        }
      } else {
        for (const ev of weekEvents) {
          const evStart = new Date(ev.start_at);
          if (format(evStart, "yyyy-MM-dd") !== dayStr) continue;
          const dur = differenceInMinutes(new Date(ev.end_at), evStart);
          if (dur < 23 * 60) mins += Math.max(0, dur);
        }
      }

      bars.push({ label: DAY_LABELS[i], date: day, minutes: mins, isToday, isFuture });
    }

    return bars;
  }, [events, weekEvents]);

  // First future event for "commute context" — prefer a not-yet-started event
  const firstUpcoming = futureEvents.length > 0 ? futureEvents[0] : null;
  const minutesUntilFirst = firstUpcoming
    ? differenceInMinutes(new Date(firstUpcoming.start_at), now)
    : -1;

  const handleBriefMe = () => {
    onClose();
    setTimeout(() => {
      navigate("/assistant", { state: { initialMessage: "Brief me on my day" } });
    }, 300);
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[80] flex flex-col">
          {/* Backdrop */}
          <motion.div
            key="rundown-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />

          {/* Sheet */}
          <motion.div
            key="rundown-sheet"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 26, stiffness: 280 }}
            className="relative mt-auto w-full max-w-lg mx-auto z-10 flex flex-col rounded-t-3xl overflow-hidden"
            style={{
              maxHeight: "92dvh",
              background: phase.heroGradient,
              boxShadow: "0 -8px 40px rgba(0,0,0,0.15)",
            }}
          >
            {/* Drag handle */}
            <div className="w-full flex justify-center pt-2.5 shrink-0 relative z-20" onClick={onClose}>
              <div className="w-10 h-1 rounded-full" style={{ background: night ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.12)" }} />
            </div>

            {/* ── HERO HEADER ───────────────────────────────────────────── */}
            <div className="relative shrink-0 px-5 pt-4 pb-5 overflow-hidden">
              {/* sheen overlay */}
              <div className="absolute inset-0 pointer-events-none"
                style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.18) 0%, transparent 60%)" }} />

              {/* close button */}
              <button
                onClick={(e) => { e.stopPropagation(); onClose(); }}
                className="absolute top-3 right-4 p-1.5 rounded-full transition z-30"
                style={{ background: night ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.08)" }}
              >
                <X className="w-4 h-4" style={{ color: night ? "#c7d2fe" : "rgba(0,0,0,0.5)" }} />
              </button>

              {/* Greeting */}
              <div className="relative z-10">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-base">{isToday ? phase.emoji : "📋"}</span>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: phase.heroSubText }}>
                    {isToday ? phase.label : "Rundown"}
                  </span>
                </div>
                <h2 className="text-xl font-semibold leading-tight" style={{ color: phase.heroText }}>
                  {greetingLine}
                </h2>
                <p className="text-sm mt-0.5" style={{ color: phase.heroSubText }}>
                  {isMultiDay
                    ? `${format(refDate, "EEE, MMM d")} – ${format(rangeEnd, "EEE, MMM d")}`
                    : format(refDate, "EEEE, MMMM d")}
                </p>

                {/* ── Day Vibe Pill ───────────────────────────────────────── */}
                {!loading && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.1 }}
                    className="mt-2.5 flex items-center gap-2 flex-wrap"
                  >
                    {/* Main vibe pill */}
                    <div
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl"
                      style={{
                        background: night ? `${dayVibe.vibeColor}20` : `${dayVibe.vibeColor}12`,
                        border: `1px solid ${night ? `${dayVibe.vibeColor}35` : `${dayVibe.vibeColor}25`}`,
                      }}
                    >
                      <span className="text-sm leading-none">{dayVibe.emoji}</span>
                      <span className="text-[11px] font-semibold" style={{ color: dayVibe.vibeColor }}>
                        {dayVibe.label}
                      </span>
                      <span className="text-[10px]" style={{ color: night ? `${dayVibe.vibeColor}cc` : `${dayVibe.vibeColor}aa` }}>
                        {dayVibe.description}
                      </span>
                    </div>

                    {/* Trend comparison vs weekly average */}
                    {dayVibe.trend !== "none" && (
                      <div
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg"
                        style={{
                          background: night ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.04)",
                          border: night ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(0,0,0,0.06)",
                        }}
                      >
                        {dayVibe.trend === "lighter" && (
                          <>
                            <span className="text-[10px]">📉</span>
                            <span className="text-[10px] font-medium" style={{ color: night ? "#6ee7b7" : "#059669" }}>
                              {dayVibe.trendPct}% lighter than avg
                            </span>
                          </>
                        )}
                        {dayVibe.trend === "heavier" && (
                          <>
                            <span className="text-[10px]">📈</span>
                            <span className="text-[10px] font-medium" style={{ color: night ? "#fca5a5" : "#dc2626" }}>
                              {dayVibe.trendPct}% busier than avg
                            </span>
                          </>
                        )}
                        {dayVibe.trend === "similar" && (
                          <>
                            <span className="text-[10px]">📊</span>
                            <span className="text-[10px] font-medium" style={{ color: night ? "#a5b4fc" : "#6b7280" }}>
                              Typical for this week
                            </span>
                          </>
                        )}
                      </div>
                    )}

                    {/* Back-to-back warning */}
                    {dayVibe.backToBack > 0 && (
                      <div
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg"
                        style={{
                          background: night ? "rgba(248,113,113,0.12)" : "rgba(239,68,68,0.08)",
                          border: "1px solid rgba(239,68,68,0.2)",
                        }}
                      >
                        <span className="text-[10px]">⚡</span>
                        <span className="text-[10px] font-medium" style={{ color: night ? "#fca5a5" : "#dc2626" }}>
                          {dayVibe.backToBack} back-to-back
                        </span>
                      </div>
                    )}
                  </motion.div>
                )}

                {/* ── Weather + Commute Context ───────────────────────────── */}
                <div className="mt-2.5 space-y-1">
                  {weatherLoading && (
                    <div className="flex items-center gap-1.5">
                      <Loader2 className="w-3 h-3 animate-spin" style={{ color: phase.heroSubText }} />
                      <span className="text-xs" style={{ color: phase.heroSubText }}>Getting weather…</span>
                    </div>
                  )}

                  {weather && (() => {
                    const { label, emoji } = weatherInfo(weather.code);
                    const showFeels = Math.abs(weather.feelsLike - weather.temp) >= 2;
                    return (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-base leading-none">{emoji}</span>
                        <span className="text-sm font-semibold" style={{ color: phase.heroText }}>
                          {weather.temp}°C
                        </span>
                        <span className="text-xs" style={{ color: phase.heroSubText }}>{label}</span>
                        {weatherCity && (
                          <span className="text-xs" style={{ color: phase.heroSubText, opacity: 0.7 }}>
                            · {weatherCity.split(",")[0]}
                          </span>
                        )}
                        {showFeels && (
                          <span className="text-xs" style={{ color: phase.heroSubText, opacity: 0.7 }}>
                            · feels {weather.feelsLike}°
                          </span>
                        )}
                        {weather.windspeed > 30 && (
                          <span className="flex items-center gap-0.5 text-xs" style={{ color: phase.heroSubText, opacity: 0.7 }}>
                            <Wind className="w-3 h-3" />
                            {weather.windspeed} km/h
                          </span>
                        )}
                      </div>
                    );
                  })()}

                  {/* Commute context: time until first meeting (today only) */}
                  {isToday && !loading && firstUpcoming && minutesUntilFirst > 0 && minutesUntilFirst <= 120 && (
                    <div className="flex items-center gap-1.5">
                      <ArrowRight className="w-3 h-3" style={{ color: phase.heroSubText }} />
                      <span className="text-xs" style={{ color: phase.heroSubText }}>
                        {firstUpcoming.title} starts in {formatDurationMins(minutesUntilFirst)}
                        {firstUpcoming.location ? ` · ${firstUpcoming.location}` : ""}
                      </span>
                    </div>
                  )}

                  {locationDenied && !weather && (
                    <span className="text-xs" style={{ color: phase.heroSubText, opacity: 0.7 }}>
                      Set your city in Settings for weather
                    </span>
                  )}
                </div>
              </div>

              {/* Stats row */}
              {!loading && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                  className="relative z-10 grid grid-cols-4 gap-2 mt-4"
                >
                  {[
                    { val: events.length.toString(), label: "events", Icon: CalendarDays, color: "#7C3AED" },
                    { val: actionItems.length > 0 ? actionItems.length.toString() : tasks.length.toString(), label: actionItems.length > 0 ? "action items" : "tasks open", Icon: CheckSquare, color: actionItems.length > 0 ? "#F59E0B" : "#0EA5E9" },
                    { val: freeLabel, label: "free left", Icon: Clock, color: "#10B981" },
                    { val: counterAlerts.length.toString(), label: "milestones", Icon: TrendingUp, color: "#8B5CF6" },
                  ].map(({ val, label, Icon, color }) => (
                    <div
                      key={label}
                      className="rounded-2xl px-2 py-2 flex flex-col gap-0.5"
                      style={{
                        background: night ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.45)",
                        border: night ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(255,255,255,0.55)",
                      }}
                    >
                      <div className="flex items-center gap-1">
                        <Icon className="w-3 h-3 shrink-0" style={{ color }} />
                        <span className="text-base font-semibold leading-none" style={{ color: phase.heroText }}>{val}</span>
                      </div>
                      <span className="text-[9px] leading-tight" style={{ color: phase.heroSubText }}>{label}</span>
                    </div>
                  ))}
                </motion.div>
              )}

              {/* Brief Me button (today only) */}
              {!loading && isToday && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25 }}
                  className="relative z-10 mt-3"
                >
                  <button
                    onClick={handleBriefMe}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition active:scale-[0.98]"
                    style={{
                      background: night ? "rgba(129,140,248,0.2)" : "rgba(255,255,255,0.6)",
                      border: night ? "1px solid rgba(129,140,248,0.3)" : "1px solid rgba(255,255,255,0.7)",
                      color: night ? "#c7d2fe" : phase.heroText,
                      backdropFilter: "blur(12px)",
                    }}
                  >
                    <Sparkles className="w-4 h-4" />
                    Brief me in Assistant
                  </button>
                </motion.div>
              )}
            </div>

            {/* ── SCROLLABLE CONTENT ─────────────────────────────────────── */}
            <div
              className="flex-1 overflow-y-auto overflow-x-hidden px-5 pt-5 pb-8 space-y-6"
              style={{
                paddingBottom: "calc(2rem + env(safe-area-inset-bottom, 0px))",
              }}
            >
              {loading ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <Loader2 className="w-5 h-5 animate-spin" style={{ color: night ? "#818cf8" : "rgba(99,102,241,0.6)" }} />
                  <p className="text-sm" style={{ color: night ? "#a5b4fc" : "#6b7280" }}>Building your briefing…</p>
                </div>
              ) : (
                <>
                  {/* ── BIRTHDAYS ─────────────────────────────────────────── */}
                  {birthdays.length > 0 && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
                      <Section
                        title="Birthdays"
                        icon={Cake}
                        night={night}
                        badge={birthdays.some(b => b.isToday) ? { text: "Today!", color: "#ec4899", bg: "rgba(236,72,153,0.15)" } : undefined}
                      >
                        <div className="space-y-1.5">
                          {birthdays.map((b, i) => (
                            <div
                              key={i}
                              className="flex items-center gap-2.5 p-2.5 rounded-xl"
                              style={{
                                background: b.isToday
                                  ? (night ? "rgba(236,72,153,0.12)" : "rgba(236,72,153,0.08)")
                                  : (night ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.5)"),
                                border: b.isToday
                                  ? "1px solid rgba(236,72,153,0.25)"
                                  : (night ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(0,0,0,0.06)"),
                              }}
                            >
                              <span className="text-base shrink-0">{b.isToday ? "🎂" : "🎁"}</span>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium truncate" style={{ color: night ? "#e0e7ff" : "#1f2937" }}>
                                  {b.name}
                                </p>
                                <p className="text-[11px]" style={{ color: night ? "#a5b4fc" : "#6b7280" }}>
                                  {b.isToday ? "Birthday is today! 🎉" : b.daysUntil === 1 ? "Tomorrow" : `${b.date} · ${b.daysUntil} days away`}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </Section>
                    </motion.div>
                  )}

                  {/* ── ACTION ITEMS (overdue + due today) ────────────────── */}
                  {actionItems.length > 0 && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
                      <Section
                        title="Action Items"
                        icon={AlertTriangle}
                        count={actionItems.length}
                        night={night}
                        badge={actionItems.some(i => i.isOverdue) ? {
                          text: `${actionItems.filter(i => i.isOverdue).length} overdue`,
                          color: night ? "#fca5a5" : "#dc2626",
                          bg: night ? "rgba(248,113,113,0.15)" : "rgba(239,68,68,0.1)",
                        } : undefined}
                      >
                        <div className="space-y-1.5">
                          {actionItems.slice(0, 5).map((item, i) => {
                            const overdueDays = item.isOverdue
                              ? differenceInDays(new Date(), parseISO(item.dueDate))
                              : 0;
                            return (
                              <div
                                key={i}
                                className="flex items-start gap-2.5 p-2.5 rounded-xl"
                                style={{
                                  background: item.isOverdue
                                    ? (night ? "rgba(248,113,113,0.08)" : "rgba(239,68,68,0.06)")
                                    : (night ? "rgba(245,158,11,0.08)" : "rgba(245,158,11,0.06)"),
                                  border: item.isOverdue
                                    ? "1px solid rgba(239,68,68,0.2)"
                                    : "1px solid rgba(245,158,11,0.2)",
                                }}
                              >
                                <Circle className="w-4 h-4 shrink-0 mt-0.5" style={{
                                  color: item.isOverdue ? "#ef4444" : "#f59e0b",
                                }} />
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium truncate" style={{ color: night ? "#e0e7ff" : "#1f2937" }}>
                                    {item.text}
                                  </p>
                                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                    <span className="text-[10px]" style={{ color: night ? "#a5b4fc" : "#6b7280" }}>
                                      {item.listTitle}
                                    </span>
                                    <span className="text-[10px]" style={{ color: night ? "#818cf8" : "#9ca3af" }}>·</span>
                                    <span className="text-[10px] font-medium" style={{
                                      color: item.isOverdue
                                        ? (night ? "#fca5a5" : "#dc2626")
                                        : (night ? "#fcd34d" : "#d97706"),
                                    }}>
                                      {item.isOverdue ? `${overdueDays}d overdue` : "Due today"}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                          {actionItems.length > 5 && (
                            <p className="text-[11px] pl-1" style={{ color: night ? "#a5b4fc" : "#6b7280" }}>
                              +{actionItems.length - 5} more items
                            </p>
                          )}
                        </div>
                      </Section>
                    </motion.div>
                  )}

                  {/* ── TIMELINE ─────────────────────────────────────────── */}
                  {events.length > 0 && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}>
                      <Section
                        title={isToday ? "Today's Schedule" : isMultiDay ? "Schedule" : `${format(refDate, "EEEE")}'s Schedule`}
                        icon={CalendarDays}
                        count={events.length}
                        night={night}
                        badge={backToBackCount > 0 ? {
                          text: `${backToBackCount} back-to-back`,
                          color: night ? "#fca5a5" : "#dc2626",
                          bg: night ? "rgba(248,113,113,0.15)" : "rgba(239,68,68,0.1)",
                        } : undefined}
                      >
                        <div className="relative">
                          {/* Vertical rail */}
                          <div className="absolute left-[13px] top-2 bottom-2 w-px" style={{ background: night ? "rgba(129,140,248,0.3)" : "rgba(0,0,0,0.1)" }} />

                          <div className="space-y-0">
                            {/* Past events */}
                            {pastEvents.map((ev) => (
                              <div className="contents" key={ev.id}>
                                <TimelineEvent ev={ev} state="past" tz={tz} night={night} />
                              </div>
                            ))}

                            {/* NOW indicator (today only) */}
                            {isToday && (currentEvent || (pastEvents.length > 0 && futureEvents.length > 0) || allPast) && (
                              <div className="py-1 pl-0.5">
                                <div className="flex items-center gap-2">
                                  <div className="relative w-6 h-6 flex items-center justify-center shrink-0 z-10">
                                    <div className="w-2.5 h-2.5 rounded-full bg-rose-400 animate-pulse" />
                                    <div className="absolute w-5 h-5 rounded-full bg-rose-400/20 animate-ping" />
                                  </div>
                                  <div className="flex items-center gap-2 flex-1">
                                    <div className="h-px flex-1 bg-rose-400/40" />
                                    <span className="text-[9px] font-bold uppercase tracking-widest text-rose-400">now</span>
                                    {allPast && (
                                      <span className="text-[10px] font-medium text-rose-400/70">
                                        {formatTimeInTz(now.toISOString(), tz)}
                                      </span>
                                    )}
                                    <div className="h-px flex-1 bg-rose-400/40" />
                                  </div>
                                </div>

                                {allPast && freeSlots.length > 0 && (
                                  <div
                                    className="ml-8 mt-1.5 rounded-xl p-2.5"
                                    style={{
                                      background: night ? "rgba(16,185,129,0.10)" : "rgba(16,185,129,0.08)",
                                      border: "1px solid rgba(16,185,129,0.2)",
                                    }}
                                  >
                                    <div className="flex items-center gap-2">
                                      <Clock className="w-3.5 h-3.5 shrink-0" style={{ color: night ? "#34d399" : "#059669" }} />
                                      <span className="text-xs font-semibold" style={{ color: night ? "#34d399" : "#059669" }}>
                                        {freeLabel} free time left
                                      </span>
                                    </div>
                                    <div className="mt-1.5 space-y-1">
                                      {freeSlots.map((slot: any, i: number) => {
                                        const dur = differenceInMinutes(new Date(slot.end_at), new Date(slot.start_at));
                                        return (
                                          <div key={i} className="flex items-center justify-between gap-2">
                                            <span className="text-[11px]" style={{ color: night ? "#a5b4fc" : "#6b7280" }}>
                                              {formatTimeInTz(slot.start_at, tz)} – {formatTimeInTz(slot.end_at, tz)}
                                            </span>
                                            <span
                                              className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                                              style={{
                                                color: night ? "#34d399" : "#059669",
                                                background: night ? "rgba(16,185,129,0.15)" : "rgba(16,185,129,0.10)",
                                              }}
                                            >
                                              {formatDurationMins(dur)}
                                            </span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}

                                {allPast && freeSlots.length === 0 && (
                                  <div className="ml-8 mt-1.5 flex items-center gap-1.5">
                                    <Clock className="w-3 h-3" style={{ color: night ? "#818cf8" : "#9ca3af" }} />
                                    <span className="text-[11px]" style={{ color: night ? "#a5b4fc" : "#9ca3af" }}>
                                      No more events — rest of the day is free ✨
                                    </span>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Current event */}
                            {currentEvent && (
                              <div className="contents">
                                <TimelineEvent key={currentEvent.id} ev={currentEvent} state="current" tz={tz} night={night} />
                              </div>
                            )}

                            {/* Future events with prep gap indicators + multi-day headers */}
                            {futureEvents.map((ev, idx) => {
                              // For multi-day ranges, insert a day header when the day changes
                              let dayHeader: React.ReactNode = null;
                              if (isMultiDay) {
                                const evDay = format(new Date(ev.start_at), "yyyy-MM-dd");
                                const prevDay = idx > 0 ? format(new Date(futureEvents[idx - 1].start_at), "yyyy-MM-dd") : (pastEvents.length > 0 ? format(new Date(pastEvents[pastEvents.length - 1].start_at), "yyyy-MM-dd") : null);
                                if (evDay !== prevDay) {
                                  dayHeader = (
                                    <div className="py-2 pl-8" key={`dh-${evDay}`}>
                                      <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: night ? "#a5b4fc" : "#6366f1" }}>
                                        {isSameDay(new Date(ev.start_at), now) ? "Today" : format(new Date(ev.start_at), "EEE, MMM d")}
                                      </span>
                                    </div>
                                  );
                                }
                              }
                              return (
                                <div className="contents" key={ev.id}>
                                  {dayHeader}
                                  {gapMap.has(ev.id) && (
                                    <PrepGapIndicator
                                      minutes={gapMap.get(ev.id)!}
                                      startTime={ev.start_at}
                                      tz={tz}
                                      night={night}
                                    />
                                  )}
                                  <TimelineEvent ev={ev} state="future" tz={tz} night={night} />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </Section>
                    </motion.div>
                  )}

                  {events.length === 0 && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
                      <Section title={isToday ? "Today's Schedule" : "Schedule"} icon={CalendarDays} night={night}>
                        <EmptySlot icon={CalendarDays} text={isToday ? "No events today — enjoy the open day! 🎉" : `No events ${isMultiDay ? "in this period" : "on " + format(refDate, "EEEE")} — all clear! 🎉`} night={night} />
                      </Section>
                    </motion.div>
                  )}

                  {/* ── WEEKLY MEETING LOAD CHART ────────────────────────── */}
                  {weeklyBarData.some(b => b.minutes > 0) && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}>
                      <Section title="This Week's Meeting Load" icon={TrendingUp} night={night}>
                        <WeeklyMiniChart
                          bars={weeklyBarData}
                          night={night}
                          avgMinutes={(() => {
                            const past = weeklyBarData.filter(b => !b.isFuture && !b.isToday);
                            if (past.length === 0) return 0;
                            return past.reduce((s, b) => s + b.minutes, 0) / past.length;
                          })()}
                        />
                      </Section>
                    </motion.div>
                  )}

                  {/* ── COUNTER MILESTONES ─────────────────────────────────── */}
                  {counterAlerts.length > 0 && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                      <Section title="Milestones" icon={TrendingUp} count={counterAlerts.length} night={night}>
                        <div className="space-y-1.5">
                          {counterAlerts.slice(0, 5).map((alert, i) => (
                            <div
                              key={i}
                              className="flex items-center gap-2.5 p-2.5 rounded-xl"
                              style={{
                                background: alert.isUrgent
                                  ? (night ? "rgba(139,92,246,0.12)" : "rgba(139,92,246,0.06)")
                                  : (night ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.5)"),
                                border: alert.isUrgent
                                  ? "1px solid rgba(139,92,246,0.25)"
                                  : (night ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(0,0,0,0.06)"),
                              }}
                            >
                              <Timer className="w-4 h-4 shrink-0" style={{
                                color: alert.type === "to"
                                  ? (alert.isUrgent ? "#ef4444" : "#8b5cf6")
                                  : (alert.isUrgent ? "#f59e0b" : (night ? "#818cf8" : "#6b7280")),
                              }} />
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium truncate" style={{ color: night ? "#e0e7ff" : "#1f2937" }}>
                                  {alert.label}
                                </p>
                                <p className="text-[11px]" style={{ color: night ? "#a5b4fc" : "#6b7280" }}>
                                  {alert.type === "since"
                                    ? `It's been ${alert.milestone}`
                                    : alert.milestone}
                                </p>
                              </div>
                              <span
                                className="text-[10px] font-semibold px-2 py-1 rounded-full shrink-0"
                                style={{
                                  color: alert.isUrgent
                                    ? (alert.type === "to" ? "#ef4444" : "#f59e0b")
                                    : (night ? "#a5b4fc" : "#6366f1"),
                                  background: alert.isUrgent
                                    ? (alert.type === "to" ? "rgba(239,68,68,0.1)" : "rgba(245,158,11,0.1)")
                                    : (night ? "rgba(129,140,248,0.15)" : "rgba(99,102,241,0.1)"),
                                }}
                              >
                                {alert.type === "since" ? `${alert.days}d ago` : alert.milestone}
                              </span>
                            </div>
                          ))}
                        </div>
                      </Section>
                    </motion.div>
                  )}

                  {/* ── TASKS ───────────────────────────────────────────── */}
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.24 }}>
                    <Section title="Open Tasks" icon={CheckSquare} count={tasks.length} night={night}>
                      {tasks.length === 0 ? (
                        <EmptySlot icon={CheckCircle2} text="All clear — no open tasks 🙌" night={night} />
                      ) : (
                        <div className="space-y-1.5">
                          {tasks.slice(0, 6).map((t: any) => (
                            <div
                              key={t.id}
                              className="flex items-start gap-2.5 p-2.5 rounded-xl"
                              style={{
                                background: night ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.5)",
                                border: night ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(0,0,0,0.06)",
                              }}
                            >
                              <Circle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: night ? "#818cf8" : "#9ca3af" }} />
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium leading-snug truncate" style={{ color: night ? "#e0e7ff" : "#1f2937" }}>{t.title}</p>
                                {t.due_at && (
                                  <p className="text-[11px] mt-0.5" style={{ color: night ? "#a5b4fc" : "#6b7280" }}>
                                    Due {format(parseISO(t.due_at), "EEE, MMM d")}
                                  </p>
                                )}
                              </div>
                              {t.priority === "high" && (
                                <span className="text-[9px] font-bold uppercase tracking-wider text-rose-500 bg-rose-500/10 px-1.5 py-0.5 rounded-full shrink-0">
                                  High
                                </span>
                              )}
                            </div>
                          ))}
                          {tasks.length > 6 && (
                            <p className="text-[11px] pl-1" style={{ color: night ? "#a5b4fc" : "#6b7280" }}>
                              +{tasks.length - 6} more tasks
                            </p>
                          )}
                        </div>
                      )}
                    </Section>
                  </motion.div>

                  {/* ── REMINDERS ─────────────────────────────────────── */}
                  {todayReminders.length > 0 && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28 }}>
                      <Section title={isToday ? "Reminders Today" : "Reminders"} icon={Bell} count={todayReminders.length} night={night}>
                        <div className="space-y-1.5">
                          {todayReminders.map((r: any) => (
                            <div
                              key={r.id}
                              className="flex items-center gap-2.5 p-2.5 rounded-xl"
                              style={{
                                background: night ? "rgba(245,158,11,0.08)" : "rgba(245,158,11,0.08)",
                                border: "1px solid rgba(245,158,11,0.2)",
                              }}
                            >
                              <Bell className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium truncate" style={{ color: night ? "#e0e7ff" : "#1f2937" }}>{r.title || r.label}</p>
                                {r.remind_at && (
                                  <p className="text-[11px]" style={{ color: night ? "#a5b4fc" : "#6b7280" }}>
                                    {format(parseISO(r.remind_at), "h:mm a")}
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </Section>
                    </motion.div>
                  )}

                  {/* ── FREE WINDOWS ─────────────────────────────────── */}
                  {freeSlots.length > 0 && !allPast && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.32 }}>
                      <Section title="Free Windows" icon={Clock} night={night}>
                        <div className="space-y-1.5">
                          {freeSlots.map((slot: any, i: number) => {
                            const dur = differenceInMinutes(new Date(slot.end_at), new Date(slot.start_at));
                            return (
                              <div
                                key={i}
                                className="flex items-center gap-2.5 p-2.5 rounded-xl"
                                style={{
                                  background: night ? "rgba(16,185,129,0.08)" : "rgba(16,185,129,0.08)",
                                  border: "1px solid rgba(16,185,129,0.2)",
                                }}
                              >
                                <div className="w-1.5 h-8 rounded-full bg-emerald-400/50 shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium" style={{ color: night ? "#e0e7ff" : "#1f2937" }}>
                                    {formatTimeInTz(slot.start_at, tz)} – {formatTimeInTz(slot.end_at, tz)}
                                  </p>
                                  <p className="text-[11px]" style={{ color: night ? "#a5b4fc" : "#6b7280" }}>{formatDurationMins(dur)} window</p>
                                </div>
                                <span
                                  className="text-[10px] font-semibold px-2 py-1 rounded-full shrink-0"
                                  style={{
                                    color: night ? "#34d399" : "#059669",
                                    background: night ? "rgba(16,185,129,0.15)" : "rgba(16,185,129,0.12)",
                                  }}
                                >
                                  {formatDurationMins(dur)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </Section>
                    </motion.div>
                  )}
                </>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}

// ── Timeline Event ────────────────────────────────────────────────────────────

// ── Weekly Mini Bar Chart ─────────────────────────────────────────────────────

function WeeklyMiniChart({ bars, night, avgMinutes }: {
  bars: { label: string; date: Date; minutes: number; isToday: boolean; isFuture: boolean }[];
  night?: boolean;
  avgMinutes: number;
}) {
  const maxMins = Math.max(...bars.map(b => b.minutes), 60); // floor at 60m for scale
  const BAR_MAX_H = 56; // px — max bar height for mobile-friendly sizing

  function barColor(bar: { isToday: boolean; isFuture: boolean; minutes: number }) {
    if (bar.isToday) return night ? "#818cf8" : "#7c3aed";
    if (bar.isFuture) return night ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.08)";
    if (bar.minutes === 0) return night ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)";
    return night ? "rgba(129,140,248,0.45)" : "rgba(124,58,237,0.25)";
  }

  const avgPx = maxMins > 0 ? (avgMinutes / maxMins) * BAR_MAX_H : 0;

  return (
    <div className="w-full">
      {/* Chart area */}
      <div className="relative flex items-end justify-between gap-1 sm:gap-2 px-1" style={{ height: BAR_MAX_H + 24 }}>
        {/* Average line */}
        {avgMinutes > 0 && avgPx > 4 && (
          <div
            className="absolute left-0 right-0 pointer-events-none z-10"
            style={{ bottom: avgPx + 20 }}
          >
            <div className="flex items-center gap-1.5 w-full">
              <div
                className="flex-1 h-px"
                style={{
                  background: night
                    ? "repeating-linear-gradient(90deg, rgba(129,140,248,0.5) 0px, rgba(129,140,248,0.5) 3px, transparent 3px, transparent 6px)"
                    : "repeating-linear-gradient(90deg, rgba(124,58,237,0.3) 0px, rgba(124,58,237,0.3) 3px, transparent 3px, transparent 6px)",
                }}
              />
              <span
                className="text-[8px] font-semibold uppercase tracking-wider shrink-0 px-1 py-0.5 rounded"
                style={{
                  color: night ? "#a5b4fc" : "#7c3aed",
                  background: night ? "rgba(30,27,75,0.8)" : "rgba(255,255,255,0.85)",
                }}
              >
                avg
              </span>
            </div>
          </div>
        )}

        {bars.map((bar) => {
          const h = maxMins > 0 ? Math.max(bar.minutes > 0 ? 4 : 2, (bar.minutes / maxMins) * BAR_MAX_H) : 2;
          const hours = bar.minutes / 60;
          const hoursLabel = hours >= 1 ? `${hours.toFixed(1).replace(/\.0$/, "")}h` : bar.minutes > 0 ? `${bar.minutes}m` : "";

          return (
            <div key={bar.label} className="flex flex-col items-center flex-1 min-w-0">
              {/* Hours label above bar */}
              <span
                className="text-[8px] sm:text-[9px] font-medium mb-0.5 leading-none truncate"
                style={{
                  color: bar.isToday
                    ? (night ? "#c7d2fe" : "#7c3aed")
                    : bar.isFuture
                      ? (night ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.2)")
                      : (night ? "#a5b4fc" : "#6b7280"),
                  minHeight: 10,
                }}
              >
                {hoursLabel}
              </span>
              {/* Bar */}
              <motion.div
                initial={{ height: 2 }}
                animate={{ height: h }}
                transition={{ type: "spring", damping: 20, stiffness: 200, delay: 0.05 * bars.indexOf(bar) }}
                className="w-full rounded-t-md"
                style={{
                  background: barColor(bar),
                  minWidth: 8,
                  maxWidth: 48,
                  border: bar.isToday
                    ? `1.5px solid ${night ? "#a5b4fc" : "#7c3aed"}`
                    : "none",
                  boxShadow: bar.isToday
                    ? `0 0 8px ${night ? "rgba(129,140,248,0.3)" : "rgba(124,58,237,0.2)"}`
                    : "none",
                }}
              />
              {/* Day label */}
              <span
                className="text-[9px] sm:text-[10px] mt-1 leading-none"
                style={{
                  fontWeight: bar.isToday ? 700 : 500,
                  color: bar.isToday
                    ? (night ? "#e0e7ff" : "#1f2937")
                    : bar.isFuture
                      ? (night ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.25)")
                      : (night ? "#a5b4fc" : "#6b7280"),
                }}
              >
                {bar.isToday ? "Today" : bar.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TimelineEvent({ ev, state, tz, night }: { ev: any; state: "past" | "current" | "future"; tz: string; night?: boolean }) {
  const style = providerStyle(ev.provider);
  const dur = differenceInMinutes(new Date(ev.end_at), new Date(ev.start_at));
  const isPast = state === "past";
  const isCurrent = state === "current";

  return (
    <div className={`flex items-start gap-2 py-1 transition-opacity ${isPast ? "opacity-45" : ""}`}>
      {/* Dot on rail */}
      <div className="relative w-6 flex flex-col items-center shrink-0 z-10 pt-2">
        {isCurrent ? (
          <div className="w-3 h-3 rounded-full border-2 shadow-sm" style={{ background: style.dot, borderColor: night ? "rgba(255,255,255,0.3)" : "#fff" }} />
        ) : (
          <div className="w-2 h-2 rounded-full mt-0.5" style={{ background: isPast ? (night ? "#6366f1" : "#c4c4d0") : style.dot, opacity: isPast ? 0.6 : 1 }} />
        )}
      </div>

      {/* Card */}
      <div
        className={`flex-1 min-w-0 rounded-xl p-2.5 border mb-0.5 transition-all overflow-hidden ${
          isCurrent
            ? "shadow-sm ring-1"
            : ""
        } ${isCurrent ? style.pill : ""}`}
        style={isCurrent ? {
          background: night ? `${style.dot}25` : `${style.dot}14`,
          border: `1px solid ${night ? `${style.dot}50` : `${style.dot}35`}`,
          boxShadow: `0 2px 8px ${style.dot}18`,
          ringColor: `${style.dot}30`,
        } : {
          background: night ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.45)",
          border: night ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(0,0,0,0.06)",
        }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 min-w-0">
              {isCurrent && (
                <span
                  className="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 text-white"
                  style={{ background: style.dot }}
                >
                  NOW
                </span>
              )}
              <p className="text-sm font-medium truncate" style={{ color: isPast ? (night ? "#7c7fbb" : "#9ca3af") : (night ? "#e0e7ff" : "#1f2937") }}>
                {ev.title}
              </p>
            </div>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <p className="text-[11px]" style={{ color: night ? "#a5b4fc" : "#6b7280" }}>
                {ev.is_all_day ? "All day" : `${formatTimeInTz(ev.start_at, tz)} – ${formatTimeInTz(ev.end_at, tz)}`}
              </p>
              {!ev.is_all_day && <span className="text-[10px]" style={{ color: night ? "#818cf8" : "#9ca3af" }}>·</span>}
              {!ev.is_all_day && <span className="text-[10px]" style={{ color: night ? "#818cf8" : "#9ca3af" }}>{formatDurationMins(dur)}</span>}
            </div>
            {ev.location && (
              <div className="flex items-center gap-1 mt-0.5 min-w-0">
                <MapPin className="w-2.5 h-2.5 shrink-0" style={{ color: night ? "#818cf8" : "#9ca3af" }} />
                <p className="text-[10px] truncate min-w-0" style={{ color: night ? "#818cf8" : "#9ca3af" }}>{ev.location}</p>
              </div>
            )}
          </div>
          {isPast && (
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" style={{ color: night ? "#6366f1" : "#d1d5db" }} />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Empty state ──────────────────────────────────────────────────────────────

function EmptySlot({ icon: Icon, text, night }: { icon: React.ElementType; text: string; night?: boolean }) {
  return (
    <div
      className="flex items-center gap-2.5 p-3 rounded-xl"
      style={{
        background: night ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
        border: night ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(0,0,0,0.06)",
      }}
    >
      <Icon className="w-4 h-4 shrink-0" style={{ color: night ? "#6366f1" : "#9ca3af" }} />
      <p className="text-sm" style={{ color: night ? "#a5b4fc" : "#6b7280" }}>{text}</p>
    </div>
  );
}

// ── Weather helpers ───────────────────────────────────────────────────────────

interface WeatherData {
  temp: number;
  feelsLike: number;
  code: number;
  windspeed: number;
}

function weatherInfo(code: number): { label: string; emoji: string } {
  if (code === 0)          return { label: "Clear sky",       emoji: "☀️"  };
  if (code <= 2)           return { label: "Partly cloudy",   emoji: "��️"  };
  if (code === 3)          return { label: "Overcast",        emoji: "☁️"  };
  if (code <= 49)          return { label: "Foggy",           emoji: "🌫️"  };
  if (code <= 55)          return { label: "Drizzle",         emoji: "🌦️"  };
  if (code <= 65)          return { label: "Rain",            emoji: "🌧️"  };
  if (code <= 75)          return { label: "Snow",            emoji: "❄️"  };
  if (code <= 82)          return { label: "Showers",         emoji: "🌦️"  };
  if (code <= 84)          return { label: "Snow showers",    emoji: "🌨️"  };
  if (code <= 99)          return { label: "Thunderstorm",    emoji: "⛈️"  };
  return                          { label: "Weather",         emoji: "🌡️"  };
}

async function fetchWeather(lat: number, lon: number): Promise<WeatherData> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude",    String(lat));
  url.searchParams.set("longitude",   String(lon));
  url.searchParams.set("current",     "temperature_2m,apparent_temperature,weathercode,windspeed_10m");
  url.searchParams.set("timezone",    "auto");
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error("Weather fetch failed");
  const data = await res.json();
  const c = data.current;
  return {
    temp:       Math.round(c.temperature_2m),
    feelsLike:  Math.round(c.apparent_temperature),
    code:       c.weathercode,
    windspeed:  Math.round(c.windspeed_10m),
  };
}
