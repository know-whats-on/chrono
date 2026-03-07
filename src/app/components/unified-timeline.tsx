import React from "react";
import {
  CalendarDays, Bell, ChevronRight, Plus
} from "lucide-react";
import { format, parseISO, differenceInMinutes, isAfter, isBefore, isToday, isTomorrow, startOfDay } from "date-fns";
import { formatTimeInTz } from "../lib/timezone-utils";
import { LIST_TYPE_META, type ListType } from "./shared-list-items";

type DayGroup = {
  dateKey: string;
  label: string;
  sub: string;
  isToday: boolean;
  events: any[];
};

interface UnifiedTimelineProps {
  events: any[];
  tasks: any[]; // now My Lists (array of list objects with .items[])
  reminders: any[];
  freeSlots: any[];
  dayGroups: DayGroup[];
  currentEvent: any;
  tz: string;
  now: Date;
  onEventClick: (id: string) => void;
  onNavigate: (path: string) => void;
  formatEventTime: (dt: string) => string;
  showTasks: boolean;
  showReminders: boolean;
}

/**
 * Unified entry types for the merged timeline.
 * Events, tasks, and reminders are all shown on one rail
 * with distinct visual treatment.
 */
type TimelineEntry =
  | { type: "event"; data: any; time: Date }
  | { type: "task"; data: any; time: Date | null }
  | { type: "reminder"; data: any; time: Date | null };

export function UnifiedTimeline({
  events,
  tasks,
  reminders,
  freeSlots,
  dayGroups,
  currentEvent,
  tz,
  now,
  onEventClick,
  onNavigate,
  formatEventTime,
  showTasks,
  showReminders,
}: UnifiedTimelineProps) {
  // Build merged timeline entries for today
  const todayKey = format(startOfDay(now), "yyyy-MM-dd");
  const todayGroup = dayGroups.find((g) => g.isToday);

  // Flatten My Lists into individual open items with list context
  const allListItems = React.useMemo(() => {
    if (!showTasks) return [];
    const items: any[] = [];
    for (const list of tasks) {
      const lt = (list.list_type || "todo") as ListType;
      for (const item of (list.items || [])) {
        if (!item.completed) {
          items.push({ ...item, _listTitle: list.title, _listType: lt, _listId: list.id });
        }
      }
    }
    return items;
  }, [tasks, showTasks]);

  // No timed tasks from My Lists (they don't have due_at on items), so all go to untimed section
  const untimedTasks = allListItems;

  const timedReminders = showReminders
    ? reminders.filter((r) => r.due_at && format(startOfDay(new Date(r.due_at)), "yyyy-MM-dd") === todayKey)
    : [];
  const untimedReminders = showReminders
    ? reminders.filter((r) => !r.due_at || format(startOfDay(new Date(r.due_at)), "yyyy-MM-dd") !== todayKey)
    : [];

  // Merge today's timed entries (events + timed reminders only now)
  const todayTimedEntries: TimelineEntry[] = [];
  if (todayGroup) {
    todayGroup.events.forEach((ev) => {
      todayTimedEntries.push({ type: "event", data: ev, time: new Date(ev.start_at) });
    });
  }
  timedReminders.forEach((r) => {
    todayTimedEntries.push({ type: "reminder", data: r, time: new Date(r.due_at) });
  });
  todayTimedEntries.sort((a, b) => (a.time?.getTime() || 0) - (b.time?.getTime() || 0));

  // Classify entry state
  const classifyState = (entry: TimelineEntry): "past" | "current" | "future" => {
    if (entry.type === "event") {
      const start = new Date(entry.data.start_at);
      const end = new Date(entry.data.end_at);
      if (isBefore(end, now)) return "past";
      if (!isAfter(start, now) && isAfter(end, now)) return "current";
      return "future";
    }
    if (!entry.time) return "future";
    return isBefore(entry.time, now) ? "past" : "future";
  };

  // NOW indicator index for today
  let nowInsertIndex = -1;
  for (let i = 0; i < todayTimedEntries.length; i++) {
    const state = classifyState(todayTimedEntries[i]);
    if (state === "current" || state === "future") {
      if (i > 0 || currentEvent) nowInsertIndex = i;
      break;
    }
  }
  if (nowInsertIndex === -1 && todayTimedEntries.length > 0 && todayTimedEntries.every(e => classifyState(e) === "past")) {
    nowInsertIndex = todayTimedEntries.length;
  }

  // Future day groups (non-today)
  const futureDayGroups = dayGroups.filter((g) => !g.isToday);

  const isEmpty = todayTimedEntries.length === 0 && futureDayGroups.length === 0 && untimedTasks.length === 0 && untimedReminders.length === 0;

  return (
    <div className="glass rounded-2xl p-4 md:p-3.5 flex flex-col flex-1 min-h-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-2 shrink-0">
        <div className="flex items-center gap-2 text-sm font-medium">
          <CalendarDays className="w-4 h-4" />
          Timeline
        </div>
        <button onClick={() => onNavigate("/calendar")} className="text-xs text-primary font-medium hover:underline flex items-center gap-0.5">
          View all <ChevronRight className="w-3 h-3" />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {isEmpty ? (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground mb-2">Nothing on your timeline</p>
            <button onClick={() => onNavigate("/calendar")} className="inline-flex items-center gap-1 text-sm text-primary font-medium hover:underline">
              <Plus className="w-3.5 h-3.5" />
              View calendar
            </button>
          </div>
        ) : (
          <div className="relative">
            {/* Vertical rail */}
            <div className="absolute left-[9px] top-2 bottom-2 w-px bg-border/50" />

            <div className="space-y-0.5">
              {/* ── Today section ── */}
              {(todayTimedEntries.length > 0 || freeSlots.length > 0) && (
                <div>
                  <DateSeparator label="Today" sub={format(now, "EEEE, MMM d")} isToday />

                  {todayTimedEntries.map((entry, ei) => (
                    <div key={`${entry.type}-${entry.data.id}`} className="contents">
                      {ei === nowInsertIndex && <NowIndicator />}
                      <MergedTimelineRow
                        entry={entry}
                        state={classifyState(entry)}
                        tz={tz}
                        onEventClick={onEventClick}
                        onNavigate={onNavigate}
                        formatEventTime={formatEventTime}
                      />
                    </div>
                  ))}

                  {nowInsertIndex === todayTimedEntries.length && <NowIndicator />}

                  {/* Free time slots */}
                  {freeSlots.length > 0 && (
                    <div className="pt-0.5 pl-[26px] pb-1">
                      {freeSlots.map((slot, i) => {
                        const start = new Date(slot.start_at);
                        const end = new Date(slot.end_at);
                        const duration = differenceInMinutes(end, start);
                        const hours = Math.floor(duration / 60);
                        const mins = duration % 60;
                        return (
                          <div key={i} className="flex items-center gap-2 py-0.5 text-xs text-muted-foreground">
                            <div className="w-1 h-3.5 rounded-full bg-emerald-500/40 shrink-0" />
                            <span className="text-[11px] font-medium text-emerald-600/80">
                              {formatTimeInTz(slot.start_at, tz)} – {formatTimeInTz(slot.end_at, tz)}
                            </span>
                            <span className="text-[10px] text-emerald-500/60">
                              {hours > 0 ? `${hours}h ` : ""}{mins > 0 ? `${mins}m` : ""} free
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ── Future day groups ── */}
              {futureDayGroups.map((group) => (
                <div key={group.dateKey} className="mt-2">
                  <DateSeparator label={group.label} sub={group.sub} isToday={false} />
                  {group.events.map((ev) => (
                    <MergedTimelineRow
                      key={ev.id}
                      entry={{ type: "event", data: ev, time: new Date(ev.start_at) }}
                      state="future"
                      tz={tz}
                      onEventClick={onEventClick}
                      onNavigate={onNavigate}
                      formatEventTime={formatEventTime}
                    />
                  ))}
                </div>
              ))}

              {/* ── Untimed lists & reminders section ── */}
              {(untimedTasks.length > 0 || untimedReminders.length > 0) && (
                <div className="mt-3 pt-2 border-t border-border/30">
                  {/* My Lists items, grouped by list */}
                  {untimedTasks.length > 0 && (() => {
                    // Group items by their parent list
                    const grouped = new Map<string, { title: string; type: ListType; items: any[] }>();
                    for (const item of untimedTasks) {
                      if (!grouped.has(item._listId)) {
                        grouped.set(item._listId, { title: item._listTitle, type: item._listType, items: [] });
                      }
                      grouped.get(item._listId)!.items.push(item);
                    }
                    return Array.from(grouped.entries()).map(([listId, group]) => {
                      const tm = LIST_TYPE_META[group.type] || LIST_TYPE_META.todo;
                      return (
                        <div key={listId} className="mb-2">
                          <div className="flex items-center gap-2 py-1 px-1 mb-0.5">
                            <div className="relative w-[18px] flex items-center justify-center shrink-0 z-10">
                              <span style={{ color: tm.color }}>{React.cloneElement(tm.icon as React.ReactElement, { className: "w-3 h-3" })}</span>
                            </div>
                            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: tm.color }}>
                              {group.title}
                            </span>
                            <span className="text-[8px] px-1 py-0.5 rounded" style={{ color: tm.color, background: `${tm.color}12` }}>
                              {tm.label}
                            </span>
                            <div className="h-px flex-1" style={{ background: `${tm.color}20` }} />
                            <button onClick={() => onNavigate("/track?tab=tasks")} className="text-[9px] font-medium hover:underline flex items-center gap-0.5" style={{ color: tm.color }}>
                              Open <ChevronRight className="w-2.5 h-2.5" />
                            </button>
                          </div>
                          {group.items.slice(0, 4).map((item: any) => (
                            <div
                              key={item.id}
                              className="flex items-center gap-2 py-1 px-2 rounded-lg cursor-pointer transition"
                              style={{ ["--hover-bg" as any]: `${tm.color}08` }}
                              onClick={() => onNavigate("/track?tab=tasks")}
                              onMouseEnter={(e) => (e.currentTarget.style.background = `${tm.color}08`)}
                              onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                            >
                              <div className="relative w-[18px] flex items-center justify-center shrink-0 z-10">
                                <div className="w-2 h-2 rounded-sm" style={{ background: tm.color }} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-[12px] font-medium truncate">{item.text}</p>
                                {item.note && (
                                  <p className="text-[10px] text-muted-foreground truncate">{item.note}</p>
                                )}
                              </div>
                              {item.quantity && (
                                <span className="text-[9px] font-medium px-1.5 py-0.5 rounded shrink-0" style={{ color: tm.color, background: `${tm.color}12` }}>
                                  x{item.quantity}
                                </span>
                              )}
                              {item.day_number && (
                                <span className="text-[9px] font-medium px-1.5 py-0.5 rounded shrink-0" style={{ color: tm.color, background: `${tm.color}12` }}>
                                  Day {item.day_number}
                                </span>
                              )}
                            </div>
                          ))}
                          {group.items.length > 4 && (
                            <button
                              onClick={() => onNavigate("/track?tab=tasks")}
                              className="text-[10px] font-medium pl-[26px] py-0.5 hover:underline"
                              style={{ color: tm.color }}
                            >
                              +{group.items.length - 4} more items
                            </button>
                          )}
                        </div>
                      );
                    });
                  })()}

                  {/* Reminders */}
                  {untimedReminders.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 py-1 px-1 mb-0.5">
                        <div className="relative w-[18px] flex items-center justify-center shrink-0 z-10">
                          <Bell className="w-3 h-3 text-amber-500" />
                        </div>
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-500">
                          Reminders
                        </span>
                        <div className="h-px flex-1 bg-amber-500/15" />
                        <button onClick={() => onNavigate("/track?tab=reminders")} className="text-[9px] text-amber-500 font-medium hover:underline flex items-center gap-0.5">
                          View all <ChevronRight className="w-2.5 h-2.5" />
                        </button>
                      </div>
                      {untimedReminders.map((r) => (
                        <div
                          key={r.id}
                          className="flex items-center gap-2 py-1 px-2 rounded-lg cursor-pointer transition hover:bg-amber-500/5"
                          onClick={() => onNavigate("/track?tab=reminders")}
                        >
                          <div className="relative w-[18px] flex items-center justify-center shrink-0 z-10">
                            <Bell className="w-2.5 h-2.5 text-amber-500/70" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] font-medium truncate">{r.title}</p>
                            {r.due_at && (
                              <p className="text-[10px] text-muted-foreground">{formatEventTime(r.due_at)}</p>
                            )}
                          </div>
                          {r.snoozed_until && (
                            <span className="text-[9px] text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded shrink-0">
                              Snoozed
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Date separator ── */
function DateSeparator({ label, sub, isToday }: { label: string; sub: string; isToday: boolean }) {
  return (
    <div className="flex items-center gap-2 py-1 px-1">
      <div className="relative w-[18px] flex items-center justify-center shrink-0 z-10">
        <div className={`w-2.5 h-2.5 rounded-sm rotate-45 ${isToday ? "bg-primary" : "bg-muted-foreground/30"}`} />
      </div>
      <span className={`text-[11px] font-semibold uppercase tracking-wider ${isToday ? "text-primary" : "text-muted-foreground/70"}`}>
        {label}
      </span>
      <div className="h-px flex-1 bg-border/40" />
      <span className="text-[9px] text-muted-foreground/50 pr-1">
        {sub}
      </span>
    </div>
  );
}

/* ── NOW indicator ── */
function NowIndicator() {
  return (
    <div className="flex items-center gap-2 py-0.5 px-1">
      <div className="relative w-[18px] flex items-center justify-center shrink-0 z-10">
        <div className="w-2.5 h-2.5 rounded-full bg-rose-400 animate-pulse" />
        <div className="absolute w-4 h-4 rounded-full bg-rose-400/20 animate-ping" />
      </div>
      <div className="flex items-center gap-1.5 flex-1">
        <div className="h-px flex-1 bg-rose-400/30" />
        <span className="text-[8px] font-bold uppercase tracking-[0.15em] text-rose-400">now</span>
        <span className="text-[9px] text-rose-400/50 tabular-nums">
          {new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
        </span>
        <div className="h-px flex-1 bg-rose-400/30" />
      </div>
    </div>
  );
}

/* ── Merged timeline row (event / task / reminder) ── */
function MergedTimelineRow({
  entry,
  state,
  tz,
  onEventClick,
  onNavigate,
  formatEventTime,
}: {
  entry: TimelineEntry;
  state: "past" | "current" | "future";
  tz: string;
  onEventClick: (id: string) => void;
  onNavigate: (path: string) => void;
  formatEventTime: (dt: string) => string;
}) {
  const isPast = state === "past";
  const isCurrent = state === "current";

  if (entry.type === "event") {
    const ev = entry.data;
    let providerColor = ev.provider === "google" ? "bg-blue-500" : ev.provider === "ics" ? "bg-amber-500" : ev.provider === "caldav" ? "bg-teal-500" : "bg-primary/60";
    const customColorStyle = ev.color ? { backgroundColor: ev.color } : {};
    return (
      <div
        className={`flex items-center gap-2 py-1 px-2 rounded-lg cursor-pointer transition ${
          isPast ? "opacity-50 hover:opacity-75" : isCurrent ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-muted/50"
        }`}
        onClick={() => onEventClick(ev.id)}
      >
        <div className="relative w-[18px] flex items-center justify-center shrink-0 z-10">
          <div 
            className={`w-2 h-2 rounded-full ${isCurrent ? "bg-primary ring-2 ring-primary/20" : (!ev.color ? providerColor : "")}`} 
            style={!isCurrent && ev.color ? customColorStyle : undefined}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-[11px] font-medium shrink-0 ${isPast ? "text-muted-foreground" : "text-foreground"}`}>
              {ev.is_all_day ? "All day" : formatTimeInTz(ev.start_at, tz)}
            </span>
            {ev.provider && ev.provider !== "manual" && (
              <span className={`inline-flex items-center justify-center w-3.5 h-3.5 rounded text-[7px] font-bold text-white shrink-0 ${
                ev.provider === "google" ? "bg-blue-500" : ev.provider === "caldav" ? "bg-teal-500" : "bg-amber-500"
              }`}>
                {ev.provider === "google" ? "G" : ev.provider === "caldav" ? "D" : "I"}
              </span>
            )}
            <p className={`text-[12px] truncate ${isPast ? "text-muted-foreground" : "font-medium"}`}>{ev.title}</p>
          </div>
        </div>
        {ev.start_at && ev.end_at && !ev.is_all_day && (() => {
          const dur = differenceInMinutes(new Date(ev.end_at), new Date(ev.start_at));
          if (dur <= 0) return null;
          const h = Math.floor(dur / 60);
          const m = dur % 60;
          return (
            <span className="text-[9px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
              {h > 0 ? `${h}h` : ""}{m > 0 ? `${m}m` : ""}
            </span>
          );
        })()}
      </div>
    );
  }

  if (entry.type === "task") {
    const t = entry.data;
    const priorityColor = t.priority === "high" ? "bg-destructive" : t.priority === "medium" ? "bg-amber-500" : "bg-blue-500";
    return (
      <div
        className={`flex items-center gap-2 py-1 px-2 rounded-lg cursor-pointer transition ${
          isPast ? "opacity-50 hover:opacity-75" : "hover:bg-blue-500/5"
        }`}
        onClick={() => onNavigate("/track?tab=tasks")}
      >
        <div className="relative w-[18px] flex items-center justify-center shrink-0 z-10">
          <div className={`w-2 h-2 rounded-sm ${priorityColor}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-[11px] font-medium shrink-0 ${isPast ? "text-muted-foreground" : "text-blue-600 dark:text-blue-400"}`}>
              {t.due_at ? formatTimeInTz(t.due_at, tz) : "--:--"}
            </span>
            <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded bg-blue-500/15 text-[7px] font-bold text-blue-500 shrink-0">
              T
            </span>
            <p className={`text-[12px] truncate ${isPast ? "text-muted-foreground" : "font-medium"}`}>{t.title}</p>
          </div>
        </div>
        {t.estimate_minutes && (
          <span className="text-[9px] text-blue-500/70 bg-blue-500/8 px-1.5 py-0.5 rounded shrink-0">
            {t.estimate_minutes}m
          </span>
        )}
      </div>
    );
  }

  if (entry.type === "reminder") {
    const r = entry.data;
    return (
      <div
        className={`flex items-center gap-2 py-1 px-2 rounded-lg cursor-pointer transition ${
          isPast ? "opacity-50 hover:opacity-75" : "hover:bg-amber-500/5"
        }`}
        onClick={() => onNavigate("/track?tab=reminders")}
      >
        <div className="relative w-[18px] flex items-center justify-center shrink-0 z-10">
          <Bell className="w-2.5 h-2.5 text-amber-500/70" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-[11px] font-medium shrink-0 ${isPast ? "text-muted-foreground" : "text-amber-600 dark:text-amber-400"}`}>
              {r.due_at ? formatTimeInTz(r.due_at, tz) : "--:--"}
            </span>
            <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded bg-amber-500/15 text-[7px] font-bold text-amber-500 shrink-0">
              R
            </span>
            <p className={`text-[12px] truncate ${isPast ? "text-muted-foreground" : "font-medium"}`}>{r.title}</p>
          </div>
        </div>
        {r.snoozed_until && (
          <span className="text-[9px] text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded shrink-0">
            Snoozed
          </span>
        )}
      </div>
    );
  }

  return null;
}