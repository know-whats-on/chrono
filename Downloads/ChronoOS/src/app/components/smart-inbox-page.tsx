import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "../lib/auth-context";
import { motion, AnimatePresence, useMotionValue, useTransform } from "motion/react";
import type { PanInfo } from "motion/react";
import {
  ArrowLeft, Inbox, CalendarDays, AlertTriangle, Bell,
  Gift, ListChecks, RotateCcw, ChevronRight, Loader2, Check,
  AlarmClock, X, Zap, PartyPopper
} from "lucide-react";
import {
  getEvents, getMyLists, getDaysSince, getReminders, getContacts,
  getInboxState, dismissInboxItem, snoozeInboxItem, resetDaysSince
} from "../lib/api";
import { getDeviceTimezone, formatTimeInTz } from "../lib/timezone-utils";
import { toast } from "sonner";

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

type InboxItemType =
  | "meeting_prep"
  | "overdue_item"
  | "due_soon_item"
  | "stale_counter"
  | "calendar_conflict"
  | "birthday"
  | "reminder_due";

interface InboxItem {
  id: string;
  type: InboxItemType;
  priority: number; // 0 = highest
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  iconBg: string;
  actionLabel: string;
  actionRoute?: string;
  onAction?: () => void;
  meta?: any;
  timestamp?: Date;
}

// ═══════════════════════════════════════════════════════════════════
// Priority map (lower = higher priority)
// ═══════════════════════════════════════════════════════════════════
const PRIORITY: Record<InboxItemType, number> = {
  calendar_conflict: 0,
  overdue_item: 1,
  reminder_due: 2,
  meeting_prep: 3,
  due_soon_item: 4,
  stale_counter: 5,
  birthday: 6,
};

// ═══════════════════════════════════════════════════════════════════
// Swipeable Action Card — liquid glass
// ═══════════════════════════════════════════════════════════════════

const SWIPE_THRESHOLD = 80;

function SwipeableCard({
  item,
  onDismiss,
  onSnooze,
  onAction,
}: {
  item: InboxItem;
  onDismiss: () => void;
  onSnooze: () => void;
  onAction: () => void;
}) {
  const x = useMotionValue(0);
  const leftOpacity = useTransform(x, [-SWIPE_THRESHOLD * 1.5, -SWIPE_THRESHOLD * 0.5], [1, 0]);
  const rightOpacity = useTransform(x, [SWIPE_THRESHOLD * 0.5, SWIPE_THRESHOLD * 1.5], [0, 1]);
  const scale = useTransform(
    x,
    [-SWIPE_THRESHOLD * 2, 0, SWIPE_THRESHOLD * 2],
    [0.96, 1, 0.96]
  );

  const handleDragEnd = (_: any, info: PanInfo) => {
    if (info.offset.x < -SWIPE_THRESHOLD) {
      onDismiss();
    } else if (info.offset.x > SWIPE_THRESHOLD) {
      onSnooze();
    }
  };

  return (
    <div className="relative overflow-hidden rounded-2xl">
      {/* Swipe reveal layers */}
      <motion.div
        className="absolute inset-0 flex items-center justify-end pr-5 rounded-2xl"
        style={{ background: "var(--destructive)", opacity: leftOpacity }}
      >
        <div className="flex items-center gap-2 text-destructive-foreground">
          <Check className="w-4 h-4" />
          <span className="text-xs font-semibold">Dismiss</span>
        </div>
      </motion.div>
      <motion.div
        className="absolute inset-0 flex items-center justify-start pl-5 rounded-2xl"
        style={{ background: "rgba(196,160,255,0.25)", opacity: rightOpacity }}
      >
        <div className="flex items-center gap-2 text-primary">
          <AlarmClock className="w-4 h-4" />
          <span className="text-xs font-semibold">Snooze</span>
        </div>
      </motion.div>

      {/* Main card — glass */}
      <motion.div
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.4}
        onDragEnd={handleDragEnd}
        className="glass relative rounded-2xl p-3.5 cursor-grab active:cursor-grabbing"
        style={{ x, scale, touchAction: "pan-y" }}
        whileTap={{ scale: 0.98 }}
      >
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
            style={{ background: item.iconBg }}
          >
            {item.icon}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-foreground leading-tight truncate">
              {item.title}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
              {item.subtitle}
            </p>
          </div>

          {/* Action button */}
          <button
            onClick={(e) => { e.stopPropagation(); onAction(); }}
            className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold transition active:scale-95 bg-primary/8 text-primary hover:bg-primary/15"
          >
            {item.actionLabel}
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>

        {/* Quick action row */}
        <div className="flex items-center gap-2 mt-2.5 pl-12">
          <button
            onClick={(e) => { e.stopPropagation(); onDismiss(); }}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] text-muted-foreground hover:bg-white/20 transition"
          >
            <X className="w-3 h-3" /> Dismiss
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onSnooze(); }}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] text-primary hover:bg-white/20 transition"
          >
            <AlarmClock className="w-3 h-3" /> Snooze 1h
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════

export function SmartInboxPage() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const tz = profile?.timezone || getDeviceTimezone();

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<InboxItem[]>([]);
  const [inboxState, setInboxState] = useState<{ dismissed: Record<string, number>; snoozed: Record<string, number> }>({ dismissed: {}, snoozed: {} });
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());

  // ── Load data ──
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const now = new Date();
      const tomorrow = new Date(now.getTime() + 24 * 3600000);
      const weekLater = new Date(now.getTime() + 7 * 86400000);
      const todayStr = now.toISOString().slice(0, 10);

      const [events, myLists, counters, reminders, contacts, state] = await Promise.all([
        getEvents(now.toISOString(), weekLater.toISOString()).catch(() => []),
        getMyLists().catch(() => []),
        getDaysSince().catch(() => []),
        getReminders().catch(() => []),
        getContacts().catch(() => []),
        getInboxState().catch(() => ({ dismissed: {}, snoozed: {} })),
      ]);

      setInboxState(state);
      const allItems: InboxItem[] = [];
      const evArr = Array.isArray(events) ? events : [];
      const listsArr = Array.isArray(myLists) ? myLists : [];
      const countersArr = Array.isArray(counters) ? counters : [];
      const remArr = Array.isArray(reminders) ? reminders : [];

      // ── 1. Meeting Prep: upcoming meetings (next 24h) with no description ──
      const timedEvents = evArr.filter((e: any) => {
        const dur = (new Date(e.end_at).getTime() - new Date(e.start_at).getTime()) / 3600000;
        return dur < 23;
      });
      const upcoming24h = timedEvents.filter((e: any) => {
        const start = new Date(e.start_at);
        return start > now && start <= tomorrow;
      });
      for (const ev of upcoming24h) {
        const hasDesc = ev.description && ev.description.trim().length > 10;
        if (!hasDesc) {
          const hoursUntil = Math.round((new Date(ev.start_at).getTime() - now.getTime()) / 3600000);
          allItems.push({
            id: `prep:${ev.id}`,
            type: "meeting_prep",
            priority: PRIORITY.meeting_prep,
            title: ev.title || "Untitled Meeting",
            subtitle: `In ${hoursUntil <= 1 ? "less than an hour" : `${hoursUntil}h`} — no agenda set`,
            icon: <CalendarDays className="w-4 h-4 text-blue-500" />,
            iconBg: "rgba(59,130,246,0.1)",
            actionLabel: "Prep",
            actionRoute: "/calendar",
            meta: ev,
          });
        }
      }

      // ── 2. Overdue list items ──
      for (const list of listsArr) {
        for (const item of (list.items || [])) {
          if (item.completed) continue;
          if (item.due_date && item.due_date < todayStr) {
            const daysOverdue = Math.round((now.getTime() - new Date(item.due_date).getTime()) / 86400000);
            allItems.push({
              id: `overdue:${list.id}:${item.id}`,
              type: "overdue_item",
              priority: PRIORITY.overdue_item,
              title: item.text,
              subtitle: `${daysOverdue} day${daysOverdue !== 1 ? "s" : ""} overdue from "${list.name}"`,
              icon: <AlertTriangle className="w-4 h-4 text-destructive" />,
              iconBg: "rgba(220,38,70,0.08)",
              actionLabel: "View",
              actionRoute: "/track?tab=tasks",
              meta: { listId: list.id, itemId: item.id },
            });
          }
        }
      }

      // ── 3. Due soon list items (today or tomorrow) ──
      const tomorrowStr = tomorrow.toISOString().slice(0, 10);
      for (const list of listsArr) {
        for (const item of (list.items || [])) {
          if (item.completed) continue;
          if (item.due_date === todayStr || item.due_date === tomorrowStr) {
            const isToday = item.due_date === todayStr;
            allItems.push({
              id: `due:${list.id}:${item.id}`,
              type: "due_soon_item",
              priority: PRIORITY.due_soon_item,
              title: item.text,
              subtitle: `Due ${isToday ? "today" : "tomorrow"} — "${list.name}"`,
              icon: <ListChecks className="w-4 h-4 text-amber-500" />,
              iconBg: "rgba(245,158,11,0.1)",
              actionLabel: "View",
              actionRoute: "/track?tab=tasks",
              meta: { listId: list.id, itemId: item.id },
            });
          }
        }
      }

      // ── 4. Stale counters (≥7 days) ──
      for (const c of countersArr) {
        if ((c.type || "since") !== "since" || !c.last_date) continue;
        if (c.label?.toLowerCase().includes("birthday")) continue;
        const daysSince = Math.round((now.getTime() - new Date(c.last_date).getTime()) / 86400000);
        if (daysSince >= 7) {
          const urgency = daysSince >= 30 ? "high" : daysSince >= 14 ? "medium" : "low";
          allItems.push({
            id: `stale:${c.id}`,
            type: "stale_counter",
            priority: PRIORITY.stale_counter,
            title: c.label,
            subtitle: `It's been ${daysSince} days — time to reset?`,
            icon: <RotateCcw className="w-4 h-4 text-primary" />,
            iconBg: "rgba(30,27,75,0.06)",
            actionLabel: "Reset",
            onAction: async () => {
              try {
                await resetDaysSince(c.id);
                toast.success(`Reset "${c.label}"`);
                loadData();
              } catch (e: any) {
                toast.error(e.message || "Failed to reset");
              }
            },
            meta: { counterId: c.id, daysSince, urgency },
          });
        }
      }

      // ── 5. Calendar conflicts (overlapping events in next 48h) ──
      const next48h = timedEvents
        .filter((e: any) => new Date(e.start_at) <= new Date(now.getTime() + 48 * 3600000))
        .sort((a: any, b: any) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
      const conflictsSeen = new Set<string>();
      for (let i = 0; i < next48h.length; i++) {
        for (let j = i + 1; j < next48h.length; j++) {
          const a = next48h[i];
          const b = next48h[j];
          const aEnd = new Date(a.end_at).getTime();
          const bStart = new Date(b.start_at).getTime();
          if (bStart < aEnd) {
            const key = `conflict:${[a.id, b.id].sort().join(":")}`;
            if (!conflictsSeen.has(key)) {
              conflictsSeen.add(key);
              allItems.push({
                id: key,
                type: "calendar_conflict",
                priority: PRIORITY.calendar_conflict,
                title: "Calendar Conflict",
                subtitle: `"${a.title || "Untitled"}" overlaps with "${b.title || "Untitled"}"`,
                icon: <Zap className="w-4 h-4 text-destructive" />,
                iconBg: "rgba(220,38,70,0.08)",
                actionLabel: "Resolve",
                actionRoute: "/calendar",
                meta: { eventA: a.id, eventB: b.id },
              });
            }
          }
        }
      }

      // ── 6. Birthdays coming up (within 7 days) ──
      for (const c of countersArr) {
        if (!c.label?.toLowerCase().includes("birthday")) continue;
        const targetDate = c.target_date || c.last_date;
        if (!targetDate) continue;
        const td = new Date(targetDate);
        let next = new Date(td.getFullYear() === now.getFullYear() ? targetDate : targetDate);
        next.setFullYear(now.getFullYear());
        if (next < new Date(todayStr)) next.setFullYear(now.getFullYear() + 1);
        const daysUntil = Math.round((next.getTime() - now.getTime()) / 86400000);
        if (daysUntil >= 0 && daysUntil <= 7) {
          const name = c.label.replace(/[''\u2019]s?\s*birthday/i, "").replace(/birthday\s*(of|for)?\s*/i, "").trim() || c.label;
          allItems.push({
            id: `bday:${c.id}`,
            type: "birthday",
            priority: PRIORITY.birthday,
            title: daysUntil === 0 ? `${name}'s birthday is today!` : `${name}'s birthday`,
            subtitle: daysUntil === 0
              ? "Don't forget to send wishes!"
              : `In ${daysUntil} day${daysUntil !== 1 ? "s" : ""} — plan something?`,
            icon: <Gift className="w-4 h-4 text-pink-400" />,
            iconBg: "rgba(236,72,153,0.08)",
            actionLabel: "Plan",
            actionRoute: "/assistant",
            meta: { name, daysUntil },
          });
        }
      }

      // ── 7. Reminders due today/overdue ──
      for (const r of remArr) {
        if (!r.is_enabled) continue;
        if (r.snoozed_until && new Date(r.snoozed_until) > now) continue;
        if (!r.due_at) continue;
        const dueDate = r.due_at.slice(0, 10);
        const isDueToday = dueDate === todayStr;
        const isOverdue = dueDate < todayStr;
        if (isDueToday || isOverdue) {
          allItems.push({
            id: `rem:${r.id}`,
            type: "reminder_due",
            priority: PRIORITY.reminder_due,
            title: r.title,
            subtitle: isOverdue
              ? `Overdue (was due ${dueDate})`
              : `Due today at ${formatTimeInTz(r.due_at, tz)}`,
            icon: <Bell className="w-4 h-4 text-amber-500" />,
            iconBg: "rgba(245,158,11,0.08)",
            actionLabel: "View",
            actionRoute: "/track?tab=reminders",
            meta: { reminderId: r.id },
          });
        }
      }

      // Sort by priority then by time sensitivity
      allItems.sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return (a.timestamp?.getTime() || 0) - (b.timestamp?.getTime() || 0);
      });

      setItems(allItems);
    } catch (e: any) {
      console.error("Smart Inbox load error:", e);
      toast.error("Failed to load inbox");
    } finally {
      setLoading(false);
    }
  }, [tz]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Filter out dismissed / snoozed ──
  const visibleItems = useMemo(() => {
    const nowMs = Date.now();
    return items.filter((item) => {
      if (inboxState.dismissed[item.id]) return false;
      const snoozedUntil = inboxState.snoozed[item.id];
      if (snoozedUntil && snoozedUntil > nowMs) return false;
      if (removingIds.has(item.id)) return false;
      return true;
    });
  }, [items, inboxState, removingIds]);

  // ── Handlers ──
  const handleDismiss = useCallback(async (itemId: string) => {
    setRemovingIds((s) => new Set(s).add(itemId));
    try {
      await dismissInboxItem(itemId);
      setInboxState((s) => ({
        ...s,
        dismissed: { ...s.dismissed, [itemId]: Date.now() },
      }));
    } catch (e) {
      console.error("Dismiss failed:", e);
    }
    setTimeout(() => setRemovingIds((s) => { const n = new Set(s); n.delete(itemId); return n; }), 300);
  }, []);

  const handleSnooze = useCallback(async (itemId: string) => {
    const until = new Date(Date.now() + 3600000).toISOString(); // 1 hour
    setRemovingIds((s) => new Set(s).add(itemId));
    try {
      await snoozeInboxItem(itemId, until);
      setInboxState((s) => ({
        ...s,
        snoozed: { ...s.snoozed, [itemId]: Date.now() + 3600000 },
      }));
      toast.success("Snoozed for 1 hour");
    } catch (e) {
      console.error("Snooze failed:", e);
    }
    setTimeout(() => setRemovingIds((s) => { const n = new Set(s); n.delete(itemId); return n; }), 300);
  }, []);

  const handleAction = useCallback((item: InboxItem) => {
    if (item.onAction) {
      item.onAction();
    } else if (item.actionRoute) {
      navigate(item.actionRoute);
    }
  }, [navigate]);

  // ── Group by type for section headers ──
  const TYPE_LABELS: Record<InboxItemType, string> = {
    calendar_conflict: "Calendar Conflicts",
    overdue_item: "Overdue",
    reminder_due: "Reminders Due",
    meeting_prep: "Needs Prep",
    due_soon_item: "Due Soon",
    stale_counter: "Stale Counters",
    birthday: "Birthdays",
  };

  const groupedItems = useMemo(() => {
    const groups: { type: InboxItemType; label: string; items: InboxItem[] }[] = [];
    let currentType: InboxItemType | null = null;
    for (const item of visibleItems) {
      if (item.type !== currentType) {
        currentType = item.type;
        groups.push({ type: item.type, label: TYPE_LABELS[item.type], items: [] });
      }
      groups[groups.length - 1].items.push(item);
    }
    return groups;
  }, [visibleItems]);

  const firstName = (profile?.name || user?.user_metadata?.name || "").split(" ")[0];

  return (
    <div className="contents">
      <div className="min-h-screen pb-24">
        {/* Header — glass nav */}
        <div className="sticky top-0 z-30 px-4 py-3 flex items-center gap-3 glass-nav border-b">
          <button
            onClick={() => navigate(-1)}
            className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-white/20 transition"
          >
            <ArrowLeft className="w-4 h-4 text-muted-foreground" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold text-foreground flex items-center gap-2">
              <Inbox className="w-4.5 h-4.5 text-primary" />
              Smart Inbox
            </h1>
          </div>
          {visibleItems.length > 0 && (
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
              {visibleItems.length}
            </span>
          )}
        </div>

        <div className="max-w-lg mx-auto px-4 pt-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-primary/50" />
              <p className="text-xs text-muted-foreground">Scanning your data...</p>
            </div>
          ) : visibleItems.length === 0 ? (
            /* ── Inbox Zero state ── */
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center justify-center py-16 gap-4"
            >
              <div
                className="w-16 h-16 rounded-3xl glass-elevated flex items-center justify-center"
              >
                <PartyPopper className="w-7 h-7 text-primary" />
              </div>
              <div className="text-center">
                <h2 className="text-lg font-bold text-foreground">Inbox Zero!</h2>
                <p className="text-sm text-muted-foreground mt-1 max-w-[260px]">
                  {firstName ? `Nice work, ${firstName}!` : "Nice work!"} Nothing needs your attention right now.
                </p>
              </div>
              <button
                onClick={() => navigate("/")}
                className="mt-2 glass flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-primary transition active:scale-95 hover:bg-white/20"
              >
                Back to Today
              </button>
            </motion.div>
          ) : (
            <>
              {/* Summary pill */}
              <div className="flex items-center gap-2 mb-4">
                <div className="glass flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold text-primary">
                  <Zap className="w-3 h-3" />
                  {visibleItems.length} action{visibleItems.length !== 1 ? "s" : ""} need{visibleItems.length === 1 ? "s" : ""} attention
                </div>
              </div>

              {/* Grouped items */}
              <div className="space-y-5">
                <AnimatePresence mode="popLayout">
                  {groupedItems.map((group) => (
                    <motion.div
                      key={group.type}
                      layout
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -12, transition: { duration: 0.2 } }}
                    >
                      <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2 px-1">
                        {group.label}
                      </h3>
                      <div className="space-y-2">
                        <AnimatePresence mode="popLayout">
                          {group.items.map((item) => (
                            <motion.div
                              key={item.id}
                              layout
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0, transition: { duration: 0.25 } }}
                            >
                              <SwipeableCard
                                item={item}
                                onDismiss={() => handleDismiss(item.id)}
                                onSnooze={() => handleSnooze(item.id)}
                                onAction={() => handleAction(item)}
                              />
                            </motion.div>
                          ))}
                        </AnimatePresence>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>

              {/* Swipe hint */}
              <p className="text-center text-[10px] text-muted-foreground/60 mt-6">
                Swipe left to dismiss, right to snooze
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
