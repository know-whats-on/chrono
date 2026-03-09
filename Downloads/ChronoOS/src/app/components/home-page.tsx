import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "../lib/auth-context";
import { getMyLists, getReminders, getDaysSince, getEvents, updateMe, queryAvailability, getRules, getWithPrefetch, request } from "../lib/api";
import {
  CalendarDays, CheckSquare, Clock, Bell, Timer,
  Plus, GripVertical, Eye, EyeOff, ChevronRight, ChevronLeft, Loader2,
  Inbox, ExternalLink, Settings, Sun, Moon, CloudSun,
  Cloud, CloudRain, CloudSnow, CloudLightning, CloudDrizzle,
  Rss, Send, Sparkles, Newspaper, X, BarChart3,
  ListTodo, CalendarPlus, Check, Target, FileText,
  Zap, Search, Users, FolderOpen
} from "lucide-react";
import { format, differenceInDays, parseISO, addDays, startOfDay, endOfDay, differenceInMinutes, isAfter, isBefore, isToday, isTomorrow } from "date-fns";
import {
  formatTimeInTz, formatDateInTz, isTodayInTz, isTomorrowInTz, getDeviceTimezone
}
 from "../lib/timezone-utils";
import { EventDetailsModal } from "./event-details-modal";
import { DayRundownModal } from "./day-rundown-modal";
import { NewsSection } from "./news-section";
import { NewsCarouselTile } from "./news-carousel-tile";
import { RssFeedTile } from "./rss-feed-tile";
import { UnifiedTimeline } from "./unified-timeline";
import { BreathingOrb } from "./breathing-orb";
import { useCalendarWeather, getWeatherInfo as getWeatherInfoShared } from "../lib/use-weather";
import { LIST_TYPE_META, type ListType } from "./shared-list-items";
import { useRotatingPlaceholder, buildPersonalizedPrompts } from "../lib/rotating-placeholder";
import { getContacts } from "../lib/api";
import { classifyCapture, executeCapture, executeRemove, useListAutocomplete, type CaptureType } from "../lib/quick-capture";
import { ListAutocompleteDropdown } from "./list-autocomplete";
import { useQuerySuggestions, QuerySuggestionsDropdown } from "./query-suggestions";
import { toast } from "sonner";
import { motion, AnimatePresence } from "motion/react";

/** Convert raw day count to a friendlier unit when large enough */
function formatDuration(absDays: number): { value: number; unit: string } {
  const months = Math.round(absDays / 30.44);
  if (months > 12) {
    const years = +(absDays / 365.25).toFixed(1);
    return { value: parseFloat(String(years)), unit: years === 1 ? "Year" : "Years" };
  }
  if (absDays > 31) {
    return { value: months, unit: months === 1 ? "Month" : "Months" };
  }
  return { value: absDays, unit: absDays === 1 ? "Day" : "Days" };
}

type WidgetId = "news" | "timeline" | "tasks" | "reminders" | "counters" | "rss_feeds";

const widgetMeta: Record<WidgetId, { label: string; icon: any }> = {
  news: { label: "News", icon: Newspaper },
  timeline: { label: "Timeline", icon: CalendarDays },
  tasks: { label: "Lists", icon: CheckSquare },
  reminders: { label: "Reminders", icon: Bell },
  counters: { label: "Counters", icon: Timer },
  rss_feeds: { label: "RSS Feeds", icon: Rss },
};

const ALL_WIDGETS: WidgetId[] = ["news", "timeline", "tasks", "reminders", "counters", "rss_feeds"];

const formatEventTimeHelper = (dt: string, timezone: string) => {
  if (isTodayInTz(dt, timezone)) return `Today ${formatTimeInTz(dt, timezone)}`;
  if (isTomorrowInTz(dt, timezone)) return `Tomorrow ${formatTimeInTz(dt, timezone)}`;
  return formatDateInTz(dt, timezone, { includeWeekday: true, includeTime: true });
};

function getGreeting(): { text: string; Icon: any } {
  const h = new Date().getHours();
  if (h < 12) return { text: "Good morning", Icon: Sun };
  if (h < 17) return { text: "Good afternoon", Icon: CloudSun };
  return { text: "Good evening", Icon: Moon };
}

// ── WMO weather code → icon + label mapping ──
const WMO_MAP: Record<number, { label: string; Icon: any }> = {
  0: { label: "Clear", Icon: Sun },
  1: { label: "Mostly clear", Icon: Sun },
  2: { label: "Partly cloudy", Icon: CloudSun },
  3: { label: "Overcast", Icon: Cloud },
  45: { label: "Foggy", Icon: Cloud },
  48: { label: "Rime fog", Icon: Cloud },
  51: { label: "Light drizzle", Icon: CloudDrizzle },
  53: { label: "Drizzle", Icon: CloudDrizzle },
  55: { label: "Heavy drizzle", Icon: CloudDrizzle },
  56: { label: "Freezing drizzle", Icon: CloudDrizzle },
  57: { label: "Freezing drizzle", Icon: CloudDrizzle },
  61: { label: "Light rain", Icon: CloudRain },
  63: { label: "Rain", Icon: CloudRain },
  65: { label: "Heavy rain", Icon: CloudRain },
  66: { label: "Freezing rain", Icon: CloudRain },
  67: { label: "Freezing rain", Icon: CloudRain },
  71: { label: "Light snow", Icon: CloudSnow },
  73: { label: "Snow", Icon: CloudSnow },
  75: { label: "Heavy snow", Icon: CloudSnow },
  77: { label: "Snow grains", Icon: CloudSnow },
  80: { label: "Showers", Icon: CloudRain },
  81: { label: "Showers", Icon: CloudRain },
  82: { label: "Heavy showers", Icon: CloudRain },
  85: { label: "Snow showers", Icon: CloudSnow },
  86: { label: "Snow showers", Icon: CloudSnow },
  95: { label: "Thunderstorm", Icon: CloudLightning },
  96: { label: "Thunderstorm + hail", Icon: CloudLightning },
  99: { label: "Thunderstorm + hail", Icon: CloudLightning },
};

function getWeatherInfo(code: number) {
  return WMO_MAP[code] || { label: "Unknown", Icon: Cloud };
}

interface WeatherData {
  temp: number;
  high: number;
  low: number;
  code: number;
  location: string;
}

function useWeather(timezone?: string) {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchWeather() {
      try {
        const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "";
        const cityPart = tz.split("/").pop()?.replace(/_/g, " ") || "";
        if (!cityPart) return;

        const geoRes = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityPart)}&count=1&language=en`
        );
        const geoData = await geoRes.json();
        const place = geoData?.results?.[0];
        if (!place) return;

        const { latitude, longitude, name: locationName } = place;

        const weatherRes = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`
        );
        const weatherData = await weatherRes.json();

        if (!cancelled) {
          setWeather({
            temp: Math.round(weatherData.current.temperature_2m),
            high: Math.round(weatherData.daily.temperature_2m_max[0]),
            low: Math.round(weatherData.daily.temperature_2m_min[0]),
            code: weatherData.current.weather_code,
            location: locationName || cityPart,
          });
        }
      } catch (e) {
        // Silently fail if weather is blocked or offline
        console.warn("Weather fetch failed, continuing without weather");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchWeather();
    return () => { cancelled = true; };
  }, [timezone]);

  return { weather, loading };
}

/** Check if current time falls within user's work hours for today */
function isCurrentlyWorkHours(workHoursRules: Record<string, { start: string; end: string }> | null): boolean {
  if (!workHoursRules) return false;
  const dayMap: Record<number, string> = { 0: "sun", 1: "mon", 2: "tue", 3: "wed", 4: "thu", 5: "fri", 6: "sat" };
  const now = new Date();
  const dayKey = dayMap[now.getDay()];
  const hours = workHoursRules[dayKey];
  if (!hours?.start || !hours?.end) return false;
  const [sh, sm] = hours.start.split(":").map(Number);
  const [eh, em] = hours.end.split(":").map(Number);
  const currentMins = now.getHours() * 60 + now.getMinutes();
  return currentMins >= sh * 60 + sm && currentMins < eh * 60 + em;
}

/** Get today's date string for daily-reset keys */
function getTodayKey(): string {
  return format(new Date(), "yyyy-MM-dd");
}

import { EventModeDashboard } from "./event-mode-dashboard";

export function HomePage() {
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [appMode, setAppMode] = useState(() => typeof window !== "undefined" ? localStorage.getItem("chrono_mode") || "business" : "business");

  useEffect(() => {
    const handleStorageChange = () => setAppMode(localStorage.getItem("chrono_mode") || "business");
    window.addEventListener("chrono_mode_changed", handleStorageChange);
    return () => window.removeEventListener("chrono_mode_changed", handleStorageChange);
  }, []);

  const [events, setEvents] = useState<any[]>([]);
  const [myLists, setMyLists] = useState<any[]>([]);
  const [reminders, setReminders] = useState<any[]>([]);
  const [daysSince, setDaysSince] = useState<any[]>([]);
  const [freeSlots, setFreeSlots] = useState<any[]>([]);
  const [loadingFree, setLoadingFree] = useState(false);
  const [customizing, setCustomizing] = useState(false);
  const [layout, setLayout] = useState<{ order: WidgetId[]; hidden: WidgetId[] }>({
    order: ["news", "timeline", "tasks", "reminders", "counters", "rss_feeds"],
    hidden: [],
  });
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [rundownOpen, setRundownOpen] = useState(false);
  const [newsView, setNewsView] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [counterPage, setCounterPage] = useState(0);

  // ── Work-hour news/rss visibility ──
  const [workHoursRules, setWorkHoursRules] = useState<Record<string, { start: string; end: string }> | null>(null);
  const [newsWorkHourOverrideDate, setNewsWorkHourOverrideDate] = useState<string | null>(null);

  const { weather } = useWeather(profile?.timezone);
  const { weather: hourlyWeather } = useCalendarWeather(profile?.timezone, 2);

  const todayHourly = React.useMemo(() => {
    if (!hourlyWeather) return [];
    const todayKey = format(new Date(), "yyyy-MM-dd");
    const hourlyEntries = hourlyWeather.hourly[todayKey] || [];
    const currentHour = new Date().getHours();
    return hourlyEntries.filter((h) => h.hour >= currentHour).slice(0, 12);
  }, [hourlyWeather]);

  useEffect(() => {
    if (profile?.dashboard_layout) {
      const saved = profile.dashboard_layout;
      // Migrate old widget IDs
      let order: WidgetId[] = (saved.order || []).map((id: string) => {
        if (id === "upcoming_events" || id === "free_time") return "timeline";
        if (id === "days_since" || id === "days_to") return "counters";
        return id;
      }).filter((id: string, i: number, arr: string[]) => arr.indexOf(id) === i) as WidgetId[];
      // Ensure all new widgets exist
      for (const w of ALL_WIDGETS) {
        if (!order.includes(w)) order.push(w);
      }
      // Migrate hidden
      const hidden: WidgetId[] = (saved.hidden || []).map((id: string) => {
        if (id === "upcoming_events" || id === "free_time") return "timeline";
        if (id === "days_since" || id === "days_to") return "counters";
        return id;
      }).filter((id: string, i: number, arr: string[]) => arr.indexOf(id) === i) as WidgetId[];
      setLayout({ order, hidden });
    }
  }, [profile]);

  const loadData = useCallback(async () => {
    try {
      const now = new Date();
      const weekLater = addDays(now, 7);
      const [ev, openEv, ml, r, ds] = await Promise.all([
        getWithPrefetch("events", () => getEvents(startOfDay(now).toISOString(), weekLater.toISOString())),
        getWithPrefetch("openEvents", () => request("/open-events-calendar").catch(() => [])),
        getWithPrefetch("myLists", () => getMyLists()),
        getWithPrefetch("reminders", () => getReminders()),
        getWithPrefetch("daysSince", () => getDaysSince()),
      ]);
      
      const mappedOpenEvents = (openEv || []).map((slot: any) => ({
        id: slot.id,
        summary: `${slot.event_title} - ${slot.session_title}`,
        start_at: slot.start_time,
        end_at: slot.end_time,
        source: "open-scheduling"
      }));

      const allCombinedEvents = [...(ev || []), ...mappedOpenEvents].sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());

      setEvents(allCombinedEvents);
      setMyLists(Array.isArray(ml) ? ml : []);
      setReminders(r.filter((r: any) => r.is_enabled).slice(0, 5));
      setDaysSince(ds);
    } catch (e) {
      console.error("Failed to load dashboard data:", e);
    }
  }, []);

  const loadFreeTime = useCallback(async () => {
    if (!profile) return;
    setLoadingFree(true);
    try {
      const tz = profile?.timezone || getDeviceTimezone();
      const now = new Date();
      const todayEnd = endOfDay(now);
      const result = await queryAvailability({
        start_at: now.toISOString(),
        end_at: todayEnd.toISOString(),
        timezone: tz,
        mode: "work_hours",
        duration_minutes: 15,
      });
      setFreeSlots((result.free_slots || []).slice(0, 4));
    } catch (e) {
      console.error("Failed to load free time:", e);
    } finally {
      setLoadingFree(false);
    }
  }, [profile]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { loadFreeTime(); }, [loadFreeTime]);

  // Fetch work-hours rules for news visibility gating (uses prefetch cache)
  useEffect(() => {
    getWithPrefetch("rules", () => getRules()).then((r: any) => {
      if (r?.work_hours) setWorkHoursRules(r.work_hours);
    }).catch(() => {});
  }, []);

  // Check sessionStorage for today's work-hour override (resets daily)
  useEffect(() => {
    const stored = sessionStorage.getItem("chrono_news_wh_override");
    if (stored === getTodayKey()) {
      setNewsWorkHourOverrideDate(stored);
    }
  }, []);

  const inWorkHours = isCurrentlyWorkHours(workHoursRules);
  const newsEnabled = !layout.hidden.includes("news");
  const rssEnabled = !layout.hidden.includes("rss_feeds");
  const workHourOverrideToday = newsWorkHourOverrideDate === getTodayKey();
  // Show prompt if either news or rss is enabled, we're in work hours, and user hasn't overridden today
  const showWorkHourPrompt = (newsEnabled || rssEnabled) && inWorkHours && !workHourOverrideToday;
  // Final visibility: enabled AND (not work hours OR override granted)
  const newsVisible = newsEnabled && (!inWorkHours || workHourOverrideToday);
  const rssVisible = rssEnabled && (!inWorkHours || workHourOverrideToday);

  const confirmWorkHourOverride = () => {
    const key = getTodayKey();
    sessionStorage.setItem("chrono_news_wh_override", key);
    setNewsWorkHourOverrideDate(key);
  };

  const toggleWidget = (id: WidgetId) => {
    setLayout((prev) => ({
      ...prev,
      hidden: prev.hidden.includes(id)
        ? prev.hidden.filter((h) => h !== id)
        : [...prev.hidden, id],
    }));
  };

  const moveWidget = (id: WidgetId, dir: -1 | 1) => {
    setLayout((prev) => {
      const idx = prev.order.indexOf(id);
      if (idx < 0) return prev;
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= prev.order.length) return prev;
      const newOrder = [...prev.order];
      [newOrder[idx], newOrder[newIdx]] = [newOrder[newIdx], newOrder[idx]];
      return { ...prev, order: newOrder };
    });
  };

  const saveLayout = async () => {
    setCustomizing(false);
    await updateMe({ dashboard_layout: layout });
    await refreshProfile();
  };

  const tz = profile?.timezone || getDeviceTimezone();
  const formatEventTime = (dt: string) => formatEventTimeHelper(dt, tz);

  const greeting = getGreeting();
  const firstName = user?.user_metadata?.name?.split(" ")[0] || "";
  const outlookAccounts: string[] = profile?.outlook_accounts || [];
  const gmailAccounts: string[] = profile?.gmail_accounts || [];
  const hasEmailAccounts = outlookAccounts.length > 0 || gmailAccounts.length > 0;
  const allEmails = [
    ...outlookAccounts.map((e) => ({ email: e, provider: "outlook" as const })),
    ...gmailAccounts.map((e) => ({ email: e, provider: "gmail" as const })),
  ];

  // ── Timeline: group events by date with visual separators ──
  const now = new Date();

  /** Friendly date label */
  function dateSeparatorLabel(dateKey: string): { label: string; sub: string; isToday: boolean } {
    const d = parseISO(dateKey);
    if (isToday(d)) return { label: "Today", sub: format(d, "EEEE, MMM d"), isToday: true };
    if (isTomorrow(d)) return { label: "Tomorrow", sub: format(d, "EEEE, MMM d"), isToday: false };
    return { label: format(d, "EEEE"), sub: format(d, "MMM d"), isToday: false };
  }

  type DayGroup = {
    dateKey: string;
    label: string;
    sub: string;
    isToday: boolean;
    events: any[];
  };

  const { dayGroups, currentEvent } = React.useMemo(() => {
    const groups: Map<string, any[]> = new Map();
    let current: any = null;

    const sorted = [...events].sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());

    sorted.forEach((ev) => {
      const start = new Date(ev.start_at);
      const end = new Date(ev.end_at);
      if (!isAfter(start, now) && isAfter(end, now)) current = ev;
      const key = format(startOfDay(start), "yyyy-MM-dd");
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(ev);
    });

    const result: DayGroup[] = [];
    groups.forEach((evs, dateKey) => {
      const { label, sub, isToday: isTodayFlag } = dateSeparatorLabel(dateKey);
      result.push({ dateKey, label, sub, isToday: isTodayFlag, events: evs });
    });

    return { dayGroups: result, currentEvent: current };
  }, [events]);

  const renderWidget = (id: WidgetId) => {
    if (layout.hidden.includes(id)) return null;
    const meta = widgetMeta[id];

    switch (id) {
      case "timeline":
        return (
          <WidgetCard key={id} title="Timeline" icon={<CalendarDays className="w-4 h-4" />} action={() => navigate("/calendar")} className="md:col-span-2 lg:col-span-2">
            {events.length === 0 && !loadingFree ? (
              <EmptyState text="No events today" cta="View calendar" onClick={() => navigate("/calendar")} />
            ) : (
              <div className="relative">
                {/* Vertical rail */}
                <div className="absolute left-[9px] top-2 bottom-2 w-px bg-border/50" />

                <div className="space-y-0.5">
                  {/* Grouped events */}
                  {dayGroups.map((group, gi) => {
                    // Classify events within today's group as past/current/future
                    const classifyState = (ev: any): "past" | "current" | "future" => {
                      if (!group.isToday) return "future";
                      const start = new Date(ev.start_at);
                      const end = new Date(ev.end_at);
                      if (isBefore(end, now)) return "past";
                      if (!isAfter(start, now) && isAfter(end, now)) return "current";
                      return "future";
                    };

                    // Determine where to inject NOW marker in today's group
                    let nowInsertIndex = -1;
                    if (group.isToday) {
                      for (let i = 0; i < group.events.length; i++) {
                        const state = classifyState(group.events[i]);
                        if (state === "current" || state === "future") {
                          // Insert NOW before the first current/future event (but after any past events)
                          if (i > 0 || currentEvent) {
                            nowInsertIndex = state === "current" ? i : i;
                          }
                          break;
                        }
                      }
                      // If all events are past, show NOW at the end
                      if (nowInsertIndex === -1 && group.events.every(ev => classifyState(ev) === "past")) {
                        nowInsertIndex = group.events.length;
                      }
                    }

                    return (
                      <div key={group.dateKey} className={gi > 0 ? "mt-1.5" : ""}>
                        {/* ── Date separator ── */}
                        <div className="flex items-center gap-2 py-1 px-1">
                          <div className="relative w-[18px] flex items-center justify-center shrink-0 z-10">
                            <div className={`w-2.5 h-2.5 rounded-sm rotate-45 ${group.isToday ? "bg-primary" : "bg-muted-foreground/30"}`} />
                          </div>
                          <span className={`text-[11px] font-semibold uppercase tracking-wider ${group.isToday ? "text-primary" : "text-muted-foreground/70"}`}>
                            {group.label}
                          </span>
                          <div className="h-px flex-1 bg-border/40" />
                          <span className="text-[9px] text-muted-foreground/50 pr-1">
                            {group.sub}
                          </span>
                        </div>

                        {/* ── Events + NOW indicator ── */}
                        {group.events.map((ev, ei) => (
                          <div key={ev.id} className="contents">
                            {/* NOW marker before this event */}
                            {group.isToday && ei === nowInsertIndex && (
                              <NowIndicator />
                            )}
                            <TimelineItem ev={ev} state={classifyState(ev)} tz={tz} onClick={() => setSelectedEventId(ev.id)} />
                          </div>
                        ))}

                        {/* NOW marker after all events (all-past case) */}
                        {group.isToday && nowInsertIndex === group.events.length && (
                          <NowIndicator />
                        )}

                        {/* ── Free time slots (today only) ── */}
                        {group.isToday && freeSlots.length > 0 && (
                          <div className="pt-0.5 pl-[26px] pb-1">
                            {freeSlots.map((slot, i) => {
                              const start = parseISO(slot.start_at);
                              const end = parseISO(slot.end_at);
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
                    );
                  })}
                </div>
              </div>
            )}
          </WidgetCard>
        );

      case "tasks":
        return (
          <WidgetCard key={id} title={meta.label} icon={<CheckSquare className="w-4 h-4" />} action={() => navigate("/track?tab=tasks")}>
            {myLists.length === 0 ? (
              <EmptyState text="No lists yet" cta="Create a list" onClick={() => navigate("/track?tab=tasks")} />
            ) : (
              <div className="space-y-1">
                {myLists.slice(0, 5).map((list: any) => {
                  const lt = (list.list_type || "todo") as ListType;
                  const tm = LIST_TYPE_META[lt];
                  const openItems = (list.items || []).filter((i: any) => !i.completed);
                  const totalItems = (list.items || []).length;
                  return (
                    <div
                      key={list.id}
                      className="flex items-center gap-3 py-1.5 md:py-1 px-3 rounded-xl hover:bg-muted/50 transition cursor-pointer"
                      onClick={() => navigate("/track?tab=tasks")}
                    >
                      <div
                        className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
                        style={{ background: tm.gradient }}
                      >
                        <span style={{ color: tm.color }}>{React.cloneElement(tm.icon as React.ReactElement, { className: "w-3 h-3" })}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{list.title}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {openItems.length} open{totalItems > 0 ? ` / ${totalItems} total` : ""}
                        </p>
                      </div>
                      <span
                        className="text-[9px] font-medium px-1.5 py-0.5 rounded shrink-0"
                        style={{ color: tm.color, background: `${tm.color}12` }}
                      >
                        {tm.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </WidgetCard>
        );

      case "reminders":
        return (
          <WidgetCard key={id} title={meta.label} icon={<Bell className="w-4 h-4" />} action={() => navigate("/track?tab=reminders")}>
            {reminders.length === 0 ? (
              <EmptyState text="No active reminders" cta="Add a reminder" onClick={() => navigate("/track?tab=reminders")} />
            ) : (
              <div className="space-y-0.5">
                {reminders.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 py-1.5 md:py-1 px-3 rounded-xl hover:bg-muted/50 transition cursor-pointer" onClick={() => navigate("/track?tab=reminders")}>
                    <Bell className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm truncate">{r.title}</p>
                      {r.due_at && <p className="text-xs text-muted-foreground mt-0.5">{formatEventTime(r.due_at)}</p>}
                    </div>
                    {r.snoozed_until && (
                      <span className="text-[10px] text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded shrink-0">
                        Snoozed
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </WidgetCard>
        );

      case "counters": {
        const sinceTrackers = daysSince.filter(ds => (ds.type || "since") === "since");
        const toTrackers = daysSince.filter(ds => ds.type === "to");
        const sortedTo = [...toTrackers].sort((a, b) => {
          const dA = differenceInDays(startOfDay(parseISO(a.target_date)), startOfDay(new Date()));
          const dB = differenceInDays(startOfDay(parseISO(b.target_date)), startOfDay(new Date()));
          return dA - dB;
        });
        const isEmpty = sinceTrackers.length === 0 && sortedTo.length === 0;

        // Merge all counters: countdowns first, then days-since
        const allCounters = [
          ...sortedTo.map(ds => ({ ...ds, _kind: "to" as const })),
          ...sinceTrackers.map(ds => ({ ...ds, _kind: "since" as const })),
        ];
        const PAGE_SIZE = 3;
        const totalPages = Math.max(1, Math.ceil(allCounters.length / PAGE_SIZE));
        const safePage = Math.min(counterPage, totalPages - 1);
        const pageItems = allCounters.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
        const canPrev = safePage > 0;
        const canNext = safePage < totalPages - 1;

        return (
          <WidgetCard key={id} title="Counters" icon={<Timer className="w-4 h-4" />} action={() => navigate("/track?tab=days-since")}>
            {isEmpty ? (
              <EmptyState text="No counters yet" cta="Create a counter" onClick={() => navigate("/track?tab=days-since")} />
            ) : (
              <div className="relative">
                {/* Nav arrows */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mb-1.5">
                    <button
                      onClick={(e) => { e.stopPropagation(); setCounterPage(Math.max(0, safePage - 1)); }}
                      disabled={!canPrev}
                      className="p-1 rounded-lg hover:bg-muted transition disabled:opacity-20"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: totalPages }).map((_, i) => (
                        <button
                          key={i}
                          onClick={(e) => { e.stopPropagation(); setCounterPage(i); }}
                          className={`rounded-full transition-all ${
                            i === safePage
                              ? "w-4 h-1.5 bg-primary"
                              : "w-1.5 h-1.5 bg-muted-foreground/25 hover:bg-muted-foreground/40"
                          }`}
                        />
                      ))}
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); setCounterPage(Math.min(totalPages - 1, safePage + 1)); }}
                      disabled={!canNext}
                      className="p-1 rounded-lg hover:bg-muted transition disabled:opacity-20"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                <div className="flex gap-1.5">
                  {pageItems.map((ds) => {
                    if (ds._kind === "to") {
                      const days = differenceInDays(startOfDay(parseISO(ds.target_date)), startOfDay(new Date()));
                      const isPast = days < 0;
                      const { value, unit } = formatDuration(Math.abs(days));
                      return (
                        <div key={ds.id} className={`rounded-xl px-3 py-2 text-center cursor-pointer hover:bg-muted transition flex-1 min-w-[80px] ${isPast ? "bg-amber-500/10" : "bg-primary/5"}`} onClick={() => navigate("/track?tab=days-since")}>
                          <p className={`text-lg font-bold leading-none ${isPast ? "text-amber-500" : "text-primary"}`}>{value}</p>
                          <p className="text-[9px] text-muted-foreground mt-0.5 uppercase tracking-wider">
                            {isPast ? `${unit} over` : days === 0 ? "today!" : `${unit} left`}
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{ds.label}</p>
                        </div>
                      );
                    } else {
                      const days = differenceInDays(startOfDay(new Date()), startOfDay(parseISO(ds.last_date)));
                      const { value, unit } = formatDuration(Math.abs(days));
                      return (
                        <div key={ds.id} className="bg-muted/50 rounded-xl px-3 py-2 text-center cursor-pointer hover:bg-muted transition flex-1 min-w-[80px]" onClick={() => navigate("/track?tab=days-since")}>
                          <p className="text-lg font-bold leading-none">{value}</p>
                          <p className="text-[9px] text-muted-foreground mt-0.5 uppercase tracking-wider">{unit} ago</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{ds.label}</p>
                        </div>
                      );
                    }
                  })}
                </div>
              </div>
            )}
          </WidgetCard>
        );
      }

      case "rss_feeds":
        if (!rssVisible) return null;
        return <RssFeedTile key={id} />;

      case "news":
        if (!newsVisible) return null;
        return <NewsCarouselTile key={id} onOpenNews={() => setNewsView(true)} />;

      default:
        return null;
    }
  };

  if (appMode === "host") {
    return <EventModeDashboard />;
  }

  return (
    <div className="max-w-lg mx-auto px-3 sm:px-4 py-5 sm:py-6 md:max-w-none md:px-6 lg:px-10 xl:px-14 md:py-4 lg:py-5 md:h-[calc(100dvh-56px-26px)] md:flex md:flex-col md:overflow-hidden">
      {/* ── Header ── */}
      <div className="relative z-[1] flex flex-col items-center md:flex-row md:items-center md:justify-between mb-5 sm:mb-6 md:mb-4 shrink-0">
        <div className="w-full md:w-auto">
          {/* Mobile: compact title */}
          <h1 className="text-xl font-semibold md:hidden text-center">
            {firstName ? `${firstName}'s` : "Your"} Today
          </h1>
          {/* Desktop: greeting-style header */}
          <div className="hidden md:flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, rgba(196,160,255,0.2), rgba(160,196,255,0.2))" }}>
              <greeting.Icon className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                {greeting.text}{firstName ? `, ${firstName}` : ""}
              </h1>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Here's your day at a glance</span>
                {weather && (() => {
                  const wi = getWeatherInfo(weather.code);
                  return (
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-muted/40">
                      <wi.Icon className="w-3.5 h-3.5" />
                      <span className="font-medium text-foreground">{weather.temp}°</span>
                      <span className="text-xs">{wi.label}{weather.location ? ` in ${weather.location}` : ""}</span>
                      <span className="text-[10px] opacity-60">H:{weather.high}° L:{weather.low}°</span>
                    </span>
                  );
                })()}
              </div>
            </div>
          </div>
          {/* Mobile: date + weather */}
          <div className="flex items-center justify-center gap-2 mt-0.5 md:hidden">
            <p className="text-sm text-muted-foreground">
              {format(new Date(), "EEEE, MMMM d")}
            </p>
            {weather && (() => {
              const wi = getWeatherInfo(weather.code);
              return (
                <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                  <span className="text-muted-foreground/40">·</span>
                  <wi.Icon className="w-3.5 h-3.5" />
                  <span className="font-medium text-foreground">{weather.temp}°</span>
                </span>
              );
            })()}
          </div>
        </div>
        {/* ── Mobile controls row ── */}
        <div className="flex items-center justify-center gap-1.5 mt-2 md:hidden flex-wrap">
          {hasEmailAccounts && (
            <div className="relative">
              <button
                onClick={() => setInboxOpen(!inboxOpen)}
                className="flex items-center justify-center w-9 h-9 rounded-xl glass hover:bg-white/10 transition shrink-0"
              >
                <Inbox className="w-4 h-4" />
              </button>
            </div>
          )}
          <div className="flex items-center rounded-xl overflow-hidden border"
            style={{ borderColor: "rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.05)" }}>
            <button onClick={() => { setNewsView(false); setCustomizing(false); }}
              className={`text-[13px] font-medium px-2.5 py-1.5 transition ${!newsView && !customizing ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              Dashboard
            </button>
            <button onClick={() => { setNewsView(true); setCustomizing(false); }}
              className={`text-[13px] font-medium px-2.5 py-1.5 transition ${newsView ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              News
            </button>
          </div>
          <button onClick={() => setRundownOpen(true)}
            className="text-[13px] font-medium px-2.5 py-1.5 rounded-xl transition shrink-0"
            style={{ background: "linear-gradient(135deg, rgba(196,160,255,0.25), rgba(160,196,255,0.25))", border: "1px solid rgba(255,255,255,0.45)", color: "var(--foreground)" }}>
            Rundown
          </button>
          <button onClick={() => { customizing ? saveLayout() : setCustomizing(true); setNewsView(false); }}
            className="text-[13px] text-primary font-medium px-2 py-1.5 rounded-xl hover:bg-white/20 transition shrink-0">
            {customizing ? "Done" : "Customize"}
          </button>
        </div>

        {/* ── Desktop controls row ── */}
        <div className="hidden md:flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground px-3 py-1.5 glass rounded-xl">
            <CalendarDays className="w-3.5 h-3.5" />
            {format(new Date(), "EEEE, MMMM d")}
          </span>
          {hasEmailAccounts && (
            <div className="relative">
              <button onClick={() => setInboxOpen(!inboxOpen)}
                className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-xl glass hover:bg-white/10 transition">
                <Inbox className="w-4 h-4" />
                Inbox
              </button>
              {inboxOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setInboxOpen(false)} />
                  <div className="absolute right-0 top-full mt-1 z-50 w-72 glass rounded-xl border border-border/50 shadow-lg p-2 space-y-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-2 pt-1 pb-1.5">Quick-switch</p>
                    {allEmails.map(({ email, provider }) => {
                      const initial = email[0].toUpperCase();
                      const label = email.split("@")[0];
                      const domain = email.split("@")[1];
                      const isOutlook = provider === "outlook";
                      const color = isOutlook ? "#0078D4" : "#EA4335";
                      const href = isOutlook
                        ? `https://outlook.office.com/mail/?login_hint=${encodeURIComponent(email)}`
                        : `https://mail.google.com/mail/u/?authuser=${encodeURIComponent(email)}`;
                      return (
                        <a key={email} href={href} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-2.5 py-2 px-2.5 rounded-lg hover:bg-muted/80 transition group">
                          <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ background: `${color}15` }}>
                            <span className="text-[11px] font-bold" style={{ color }}>{initial}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{label}</p>
                            <p className="text-[10px] text-muted-foreground truncate">@{domain} · {isOutlook ? "Outlook" : "Gmail"}</p>
                          </div>
                          <ExternalLink className="w-3.5 h-3.5 opacity-40 group-hover:opacity-100 transition shrink-0" style={{ color }} />
                        </a>
                      );
                    })}
                    <button onClick={() => { setInboxOpen(false); navigate("/email"); }}
                      className="w-full text-[10px] text-muted-foreground hover:text-foreground py-1.5 text-center transition flex items-center justify-center gap-1">
                      <Settings className="w-3 h-3" /> Manage accounts
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
          <div className="flex items-center rounded-xl overflow-hidden border"
            style={{ borderColor: "rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.05)" }}>
            <button onClick={() => { setNewsView(false); setCustomizing(false); }}
              className={`text-sm font-medium px-3 py-1.5 transition ${!newsView && !customizing ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-white/10"}`}>
              Dashboard
            </button>
            <button onClick={() => { setNewsView(true); setCustomizing(false); }}
              className={`text-sm font-medium px-3 py-1.5 transition ${newsView ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-white/10"}`}>
              News
            </button>
          </div>
          <button onClick={() => setRundownOpen(true)}
            className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-xl transition"
            style={{ background: "linear-gradient(135deg, rgba(196,160,255,0.25), rgba(160,196,255,0.25))", border: "1px solid rgba(255,255,255,0.45)", color: "var(--foreground)" }}>
            Rundown
          </button>
          <button onClick={() => { customizing ? saveLayout() : setCustomizing(true); setNewsView(false); }}
            className="text-sm text-primary font-medium px-3 py-1.5 rounded-xl hover:bg-white/20 transition">
            {customizing ? "Done" : "Customize"}
          </button>
        </div>
      </div>

      {/* ── Hourly weather strip ── */}
      {todayHourly.length > 0 && !customizing && !newsView && (
        null
      )}

      {/* ── Ask Chrono input ── */}
      {!customizing && !newsView && (
        <div className="relative z-50">
          <AskChronoInput myLists={myLists} reminders={reminders} daysSince={daysSince} />
        </div>
      )}

      {/* ── Quick Actions: Smart Inbox | Weekly Review | Focus Mode ── */}
      {!customizing && !newsView && (() => {
        const dayOfWeek = new Date().getDay();
        const isReviewDay = dayOfWeek === 5 || dayOfWeek === 6 || dayOfWeek === 0;
        return (
          <div className="relative z-[1] grid grid-cols-3 gap-2 md:gap-3 max-w-lg mb-4 md:hidden">
            {/* Smart Inbox */}
            <button
              onClick={() => navigate("/inbox")}
              className="glass flex flex-col items-center gap-1.5 md:gap-2 px-2 md:px-4 py-3 md:py-4 rounded-2xl transition active:scale-[0.97] group hover:bg-white/20 text-center"
            >
              <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl flex items-center justify-center shrink-0 bg-primary/8">
                <Inbox className="w-4 h-4 md:w-5 md:h-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] md:text-xs font-semibold text-primary leading-tight">
                  Smart Inbox
                </p>
                <p className="text-[9px] md:text-[10px] text-muted-foreground leading-tight mt-0.5 hidden sm:block">
                  Actions that need attention
                </p>
              </div>
              
            </button>

            {/* Weekly Review */}
            <button
              onClick={() => navigate("/weekly-review")}
              className={`flex flex-col items-center gap-1.5 md:gap-2 px-2 md:px-4 py-3 md:py-4 rounded-2xl transition active:scale-[0.97] group hover:bg-white/20 text-center ${isReviewDay ? "glass-elevated" : "glass"}`}
            >
              <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl flex items-center justify-center shrink-0 bg-primary/8">
                <BarChart3 className="w-4 h-4 md:w-5 md:h-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] md:text-xs font-semibold text-primary leading-tight">
                  Weekly Review
                </p>
                <p className="text-[9px] md:text-[10px] text-muted-foreground leading-tight mt-0.5 hidden sm:block">
                  {isReviewDay ? "Reflect on your week" : "Stats and trends"}
                </p>
              </div>
              
            </button>

            {/* Focus Mode */}
            <button
              onClick={() => navigate("/focus")}
              className="glass flex flex-col items-center gap-1.5 md:gap-2 px-2 md:px-4 py-3 md:py-4 rounded-2xl transition active:scale-[0.97] group hover:bg-white/20 text-center"
            >
              <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl flex items-center justify-center shrink-0 bg-primary/8">
                <Target className="w-4 h-4 md:w-5 md:h-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] md:text-xs font-semibold text-primary leading-tight">
                  Focus Mode
                </p>
                <p className="text-[9px] md:text-[10px] text-muted-foreground leading-tight mt-0.5 hidden sm:block">
                  Pomodoro or deep work
                </p>
              </div>
              
            </button>
          </div>
        );
      })()}

      {customizing ? (
        <div className="relative z-[1] space-y-2 mb-6 max-w-lg">
          <p className="text-sm text-muted-foreground mb-3">Reorder and toggle widgets</p>
          {layout.order.map((id, idx) => {
            const meta = widgetMeta[id];
            const Icon = meta.icon;
            const isHidden = layout.hidden.includes(id);
            return (
              <div key={id} className="flex items-center gap-2 p-3 glass rounded-xl">
                <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" />
                <Icon className="w-4 h-4 shrink-0" />
                <span className={`flex-1 text-sm ${isHidden ? "text-muted-foreground line-through" : ""}`}>
                  {meta.label}
                </span>
                <div className="flex items-center gap-1">
                  <button onClick={() => moveWidget(id, -1)} disabled={idx === 0} className="p-1 rounded hover:bg-muted disabled:opacity-30">
                    <ChevronRight className="w-3.5 h-3.5 -rotate-90" />
                  </button>
                  <button onClick={() => moveWidget(id, 1)} disabled={idx === layout.order.length - 1} className="p-1 rounded hover:bg-muted disabled:opacity-30">
                    <ChevronRight className="w-3.5 h-3.5 rotate-90" />
                  </button>
                  <button onClick={() => toggleWidget(id)} className="p-1 rounded hover:bg-muted">
                    {isHidden ? <EyeOff className="w-3.5 h-3.5 text-muted-foreground" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : newsView ? (
        <div className="flex-1 min-h-0 md:flex md:flex-col md:overflow-hidden">
          <NewsSection />
        </div>
      ) : (
        <>
          {/* ── Work-hour news/rss prompt ── */}
          {showWorkHourPrompt && (
            <div className="relative z-[1] glass rounded-xl border border-amber-500/20 p-3 mb-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                <Clock className="w-4 h-4 text-amber-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">You're in work hours</p>
                <p className="text-xs text-muted-foreground">News & RSS feeds are hidden during work hours. Show them anyway?</p>
              </div>
              <button
                onClick={confirmWorkHourOverride}
                className="text-xs font-medium text-primary px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 transition shrink-0"
              >
                Show
              </button>
            </div>
          )}

          {/* ── Mobile: single column ── */}
          <div className="space-y-5 md:hidden" style={{ overflowAnchor: 'none' as any }}>
            {/* Breathing Orb — mobile */}
            <BreathingOrb events={events} tasks={myLists} reminders={reminders} now={now} />

            {layout.order.map((id) => {
              const widget = renderWidget(id);
              if (!widget) return null;
              // Constrain timeline to half height on mobile
              if (id === "timeline") {
                return (
                  <div key={id} className="relative z-[1] max-h-[240px] overflow-y-auto rounded-2xl">
                    {widget}
                  </div>
                );
              }
              return <div className="relative z-[1]" key={id}>{widget}</div>;
            })}
          </div>

          {/* ── Desktop: 2-zone layout (Left: cards + news/feeds | Right: Timeline) ── */}
          <div className={`hidden md:grid gap-3 lg:gap-4 flex-1 min-h-0 ${
            newsVisible || rssVisible
              ? "md:grid-cols-[1fr_minmax(260px,0.85fr)]"
              : "md:grid-cols-[1fr]"
          }`}>
            {/* ── Left zone: Quick-action cards + News/Feeds columns ── */}
            {(newsVisible || rssVisible) && (
              <div className="relative z-[1] flex flex-col gap-3 lg:gap-4 min-h-0 overflow-hidden">
                {/* Quick-action cards row */}
                {(() => {
                  const dayOfWeek = new Date().getDay();
                  const isReviewDay = dayOfWeek === 5 || dayOfWeek === 6 || dayOfWeek === 0;
                  return (
                    <div className="grid grid-cols-3 gap-2 lg:gap-3 shrink-0">
                      {/* Smart Inbox */}
                      <button
                        onClick={() => navigate("/inbox")}
                        className="glass flex flex-col items-center gap-1.5 md:gap-2 px-2 md:px-4 py-3 md:py-4 rounded-2xl transition active:scale-[0.97] group hover:bg-white/20 text-center"
                      >
                        <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl flex items-center justify-center shrink-0 bg-primary/8">
                          <Inbox className="w-4 h-4 md:w-5 md:h-5 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[11px] md:text-xs font-semibold text-primary leading-tight">
                            Smart Inbox
                          </p>
                          <p className="text-[9px] md:text-[10px] text-muted-foreground leading-tight mt-0.5">
                            Actions that need attention
                          </p>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-primary/40 group-hover:translate-x-0.5 transition-transform" />
                      </button>

                      {/* Weekly Review */}
                      <button
                        onClick={() => navigate("/weekly-review")}
                        className={`flex flex-col items-center gap-1.5 md:gap-2 px-2 md:px-4 py-3 md:py-4 rounded-2xl transition active:scale-[0.97] group hover:bg-white/20 text-center ${isReviewDay ? "glass-elevated" : "glass"}`}
                      >
                        <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl flex items-center justify-center shrink-0 bg-primary/8">
                          <BarChart3 className="w-4 h-4 md:w-5 md:h-5 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[11px] md:text-xs font-semibold text-primary leading-tight">
                            Weekly Review
                          </p>
                          <p className="text-[9px] md:text-[10px] text-muted-foreground leading-tight mt-0.5">
                            {isReviewDay ? "Reflect on your week" : "Stats and trends"}
                          </p>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-primary/40 group-hover:translate-x-0.5 transition-transform" />
                      </button>

                      {/* Focus Mode */}
                      <button
                        onClick={() => navigate("/focus")}
                        className="glass flex flex-col items-center gap-1.5 md:gap-2 px-2 md:px-4 py-3 md:py-4 rounded-2xl transition active:scale-[0.97] group hover:bg-white/20 text-center"
                      >
                        <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl flex items-center justify-center shrink-0 bg-primary/8">
                          <Target className="w-4 h-4 md:w-5 md:h-5 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[11px] md:text-xs font-semibold text-primary leading-tight">
                            Focus Mode
                          </p>
                          <p className="text-[9px] md:text-[10px] text-muted-foreground leading-tight mt-0.5">
                            Pomodoro or deep work
                          </p>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-primary/40 group-hover:translate-x-0.5 transition-transform" />
                      </button>
                    </div>
                  );
                })()}

                {/* News + Feeds sub-grid */}
                <div className={`grid gap-3 lg:gap-4 flex-1 min-h-0 overflow-hidden ${
                  newsVisible && rssVisible ? "grid-cols-2" : "grid-cols-1"
                }`}>
                  {/* News carousel */}
                  {newsVisible && (
                    <div className="flex flex-col min-h-0 overflow-hidden">
                      <NewsCarouselTile onOpenNews={() => setNewsView(true)} />
                    </div>
                  )}

                  {/* RSS feeds */}
                  {rssVisible && (
                    <div className="flex flex-col min-h-0 overflow-hidden">
                      <RssFeedTile />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Right zone: Unified Timeline + Counters (full height) ── */}
            <div className="flex flex-col gap-3 lg:gap-4 min-h-0" style={{ overflow: "visible" }}>
              {/* If no news/feeds visible, show quick-action cards here */}
              {!newsVisible && !rssVisible && (() => {
                const dayOfWeek = new Date().getDay();
                const isReviewDay = dayOfWeek === 5 || dayOfWeek === 6 || dayOfWeek === 0;
                return (
                  <div className="relative z-[1] grid grid-cols-3 gap-2 lg:gap-3 max-w-lg shrink-0">
                    <button onClick={() => navigate("/inbox")} className="glass flex flex-col items-center gap-1.5 md:gap-2 px-2 md:px-4 py-3 md:py-4 rounded-2xl transition active:scale-[0.97] group hover:bg-white/20 text-center">
                      <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl flex items-center justify-center shrink-0 bg-primary/8"><Inbox className="w-4 h-4 md:w-5 md:h-5 text-primary" /></div>
                      <div className="min-w-0"><p className="text-[11px] md:text-xs font-semibold text-primary leading-tight">Smart Inbox</p><p className="text-[9px] md:text-[10px] text-muted-foreground leading-tight mt-0.5">Actions that need attention</p></div>
                      <ChevronRight className="w-3.5 h-3.5 text-primary/40 group-hover:translate-x-0.5 transition-transform" />
                    </button>
                    <button onClick={() => navigate("/weekly-review")} className={`flex flex-col items-center gap-1.5 md:gap-2 px-2 md:px-4 py-3 md:py-4 rounded-2xl transition active:scale-[0.97] group hover:bg-white/20 text-center ${isReviewDay ? "glass-elevated" : "glass"}`}>
                      <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl flex items-center justify-center shrink-0 bg-primary/8"><BarChart3 className="w-4 h-4 md:w-5 md:h-5 text-primary" /></div>
                      <div className="min-w-0"><p className="text-[11px] md:text-xs font-semibold text-primary leading-tight">Weekly Review</p><p className="text-[9px] md:text-[10px] text-muted-foreground leading-tight mt-0.5">{isReviewDay ? "Reflect on your week" : "Stats and trends"}</p></div>
                      <ChevronRight className="w-3.5 h-3.5 text-primary/40 group-hover:translate-x-0.5 transition-transform" />
                    </button>
                    <button onClick={() => navigate("/focus")} className="glass flex flex-col items-center gap-1.5 md:gap-2 px-2 md:px-4 py-3 md:py-4 rounded-2xl transition active:scale-[0.97] group hover:bg-white/20 text-center">
                      <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl flex items-center justify-center shrink-0 bg-primary/8"><Target className="w-4 h-4 md:w-5 md:h-5 text-primary" /></div>
                      <div className="min-w-0"><p className="text-[11px] md:text-xs font-semibold text-primary leading-tight">Focus Mode</p><p className="text-[9px] md:text-[10px] text-muted-foreground leading-tight mt-0.5">Pomodoro or deep work</p></div>
                      <ChevronRight className="w-3.5 h-3.5 text-primary/40 group-hover:translate-x-0.5 transition-transform" />
                    </button>
                  </div>
                );
              })()}

              {/* Breathing Orb — clutter score */}
              <BreathingOrb
                events={events}
                tasks={myLists}
                reminders={reminders}
                now={now}
              />

              {/* Unified Timeline (events + tasks + reminders merged) */}
              {!layout.hidden.includes("timeline") && (
                <div className="relative z-[1] flex-1 min-h-0 overflow-hidden rounded-2xl">
                  <UnifiedTimeline
                    events={events}
                    tasks={myLists}
                    reminders={reminders}
                    freeSlots={freeSlots}
                    dayGroups={dayGroups}
                    currentEvent={currentEvent}
                    tz={tz}
                    now={now}
                    onEventClick={(id: string) => setSelectedEventId(id)}
                    onNavigate={navigate}
                    formatEventTime={formatEventTime}
                    showTasks={!layout.hidden.includes("tasks")}
                    showReminders={!layout.hidden.includes("reminders")}
                  />
                </div>
              )}

              {/* Counters row */}
              {!layout.hidden.includes("counters") && (
                <div className="relative z-[1]">{renderWidget("counters")}</div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Mobile Quick-switch modal (centered) */}
      {inboxOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center md:hidden" onClick={() => setInboxOpen(false)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div
            className="relative w-[calc(100vw-48px)] max-w-sm glass rounded-2xl border border-border/50 shadow-2xl p-4 space-y-1"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">Quick-switch</p>
              <button onClick={() => setInboxOpen(false)} className="p-1.5 rounded-lg hover:bg-white/15 transition">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto space-y-0.5">
              {allEmails.map(({ email, provider }) => {
                const initial = email[0].toUpperCase();
                const label = email.split("@")[0];
                const domain = email.split("@")[1];
                const isOutlook = provider === "outlook";
                const color = isOutlook ? "#0078D4" : "#EA4335";
                const href = isOutlook
                  ? `https://outlook.office.com/mail/?login_hint=${encodeURIComponent(email)}`
                  : `https://mail.google.com/mail/u/?authuser=${encodeURIComponent(email)}`;
                return (
                  <a
                    key={email}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 py-2.5 px-3 rounded-xl hover:bg-muted/80 active:bg-muted transition group"
                  >
                    <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: `${color}15` }}>
                      <span className="text-sm font-bold" style={{ color }}>{initial}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{label}</p>
                      <p className="text-[11px] text-muted-foreground truncate">@{domain} · {isOutlook ? "Outlook" : "Gmail"}</p>
                    </div>
                    <ExternalLink className="w-4 h-4 opacity-40 group-hover:opacity-100 transition shrink-0" style={{ color }} />
                  </a>
                );
              })}
            </div>
            <div className="pt-2 border-t border-border/30 mt-1">
              <button
                onClick={() => { setInboxOpen(false); navigate("/settings"); }}
                className="w-full text-xs text-muted-foreground hover:text-foreground py-2 text-center transition flex items-center justify-center gap-1.5 rounded-lg hover:bg-white/10"
              >
                <Settings className="w-3.5 h-3.5" /> Manage accounts
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Event Details Modal */}
      <EventDetailsModal
        eventId={selectedEventId}
        onClose={() => setSelectedEventId(null)}
        userTimezone={profile?.timezone}
        outlookAccounts={profile?.outlook_accounts || []}
        gmailAccounts={profile?.gmail_accounts || []}
      />

      {/* Day Rundown Modal */}
      <DayRundownModal
        open={rundownOpen}
        onClose={() => setRundownOpen(false)}
        userTimezone={profile?.timezone}
        userName={user?.user_metadata?.name}
      />
    </div>
  );
}

/* ── Timeline item ── */
function TimelineItem({ ev, state, tz, onClick }: { ev: any; state: "past" | "current" | "future"; tz: string; onClick: () => void }) {
  const providerColor = ev.provider === "google" ? "bg-blue-500" : ev.provider === "ics" ? "bg-amber-500" : ev.provider === "caldav" ? "bg-teal-500" : "bg-primary/60";
  const isPast = state === "past";
  const isCurrent = state === "current";

  return (
    <div
      className={`flex items-center gap-2 py-1 md:py-0.5 px-2 rounded-lg cursor-pointer transition ${
        isPast ? "opacity-50 hover:opacity-75" : isCurrent ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-muted/50"
      }`}
      onClick={onClick}
    >
      {/* Dot on rail */}
      <div className="relative w-[18px] flex items-center justify-center shrink-0 z-10">
        <div className={`w-2 h-2 rounded-full ${isCurrent ? "bg-primary ring-2 ring-primary/20" : providerColor}`} />
      </div>
      {/* Time + title */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-[11px] font-medium shrink-0 ${isPast ? "text-muted-foreground" : "text-foreground"}`}>
            {formatTimeInTz(ev.start_at, tz)}
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
      {/* Duration */}
      {ev.start_at && ev.end_at && (() => {
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

function WidgetCard({ icon, title, children, action, className }: {
  icon?: React.ReactNode;
  title: string;
  children: React.ReactNode;
  action?: () => void;
  className?: string;
}) {
  return (
    <div className={`glass rounded-2xl p-5 md:p-3.5 shadow-sm md:shadow-none md:flex md:flex-col md:min-h-0 md:overflow-hidden ${className || ""}`}>
      <div className="flex items-center justify-between mb-3.5 md:mb-2 shrink-0">
        <div className="flex items-center gap-2 text-sm font-medium">
          {icon}
          {title}
        </div>
        {action && (
          <button onClick={action} className="text-xs text-primary font-medium hover:underline flex items-center gap-0.5">
            View all <ChevronRight className="w-3 h-3" />
          </button>
        )}
      </div>
      <div className="md:flex-1 md:min-h-0 md:overflow-y-auto md:flex md:flex-col">
        {children}
      </div>
    </div>
  );
}

function EmptyState({ text, cta, onClick }: { text: string; cta: string; onClick: () => void }) {
  return (
    <div className="text-center py-4 md:py-0 md:flex-1 md:flex md:flex-col md:items-center md:justify-center">
      <p className="text-sm text-muted-foreground mb-2">{text}</p>
      <button onClick={onClick} className="inline-flex items-center gap-1 text-sm text-primary font-medium hover:underline">
        <Plus className="w-3.5 h-3.5" />
        {cta}
      </button>
    </div>
  );
}

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

const CAPTURE_ICONS: Record<CaptureType, React.ReactNode> = {
  task: <ListTodo className="w-3.5 h-3.5 text-primary" />,
  reminder: <Bell className="w-3.5 h-3.5 text-amber-500" />,
  event: <CalendarPlus className="w-3.5 h-3.5 text-blue-500" />,
  counter: <Timer className="w-3.5 h-3.5 text-emerald-500" />,
  note: <FileText className="w-3.5 h-3.5 text-orange-500" />,
};

function AskChronoInput({ myLists, reminders, daysSince }: { myLists: any[]; reminders: any[]; daysSince: any[] }) {
  const [value, setValue] = useState("");
  const [contacts, setContacts] = useState<any[]>([]);
  const [executing, setExecuting] = useState(false);
  const [justDone, setJustDone] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    getContacts().then(setContacts).catch(() => {});
  }, []);

  const personalizedPrompts = useMemo(
    () => buildPersonalizedPrompts(contacts, myLists, daysSince, reminders, { Zap, CalendarDays, Search, CalendarPlus, Bell, Timer, Users, FolderOpen }),
    [contacts, myLists, daysSince, reminders],
  );
  const animatedPlaceholder = useRotatingPlaceholder(!value, personalizedPrompts.placeholders);

  const options = useMemo(() => classifyCapture(value, contacts, myLists), [value, contacts, myLists]);
  const { isSlashActive, suggestions, selectList, partialQuery, hasExactMatch } = useListAutocomplete(value, setValue);
  const homeSuggestionCtx = useMemo(() => ({
    lists: (myLists || []).map((l: any) => ({ id: l.id, title: l.title })),
    contacts: (contacts || []).map((c: any) => ({ id: c.id, name: c.name })),
    reminders: (reminders || []).map((r: any) => ({ id: r.id, title: r.title })),
  }), [myLists, contacts, reminders]);
  const { suggestions: homeQuerySuggestions, shouldShow: showHomeQuerySuggestions } = useQuerySuggestions(value, isSlashActive, homeSuggestionCtx);

  const handleCapture = useCallback(async (type: CaptureType, opt?: { targetList?: string; cleanSubject?: string }) => {
    if (!value.trim() || executing) return;
    setExecuting(true);
    try {
      const msg = await executeCapture(type, value, opt);
      toast.success(msg);
      setJustDone(msg);
      setValue("");
      setTimeout(() => setJustDone(null), 2500);
    } catch (e: any) {
      console.error("Quick capture error:", e);
      if (e.message?.startsWith("__CONTACT_NOT_FOUND__:")) {
        // Contact not found — redirect to assistant for guided contact creation
        const parts = e.message.split(":");
        const contactName = parts[1];
        toast.error(`Contact "${contactName}" not found. Redirecting to assistant...`);
        navigate("/assistant", { state: { initialMessage: value } });
        setValue("");
      } else {
        toast.error(e.message || "Failed to capture");
      }
    } finally {
      setExecuting(false);
    }
  }, [value, executing]);

  const handleRemove = useCallback(async (rawInput: string) => {
    if (executing) return;
    setExecuting(true);
    try {
      const msg = await executeRemove(rawInput);
      toast.success(msg);
      setJustDone(msg);
      setValue("");
      setTimeout(() => setJustDone(null), 2500);
      // Data will refresh on next mount/interaction
    } catch (e: any) {
      if (e.message === "__REMOVE_EMPTY__" || e.message === "__REMOVE_NO_TARGET__") {
        // Forward to assistant for guided help
        navigate("/assistant", { state: { initialMessage: rawInput } });
        setValue("");
      } else {
        toast.error(e.message || "Failed to remove item");
      }
    } finally {
      setExecuting(false);
    }
  }, [executing, navigate]);

  const handleSubmit = () => {
    let q = value.trim();
    if (!q) return;

    // If input matches slash-list or contact note pattern, auto-execute as a capture
    const currentOptions = classifyCapture(q, contacts, myLists);
    const slashOpt = currentOptions.find((o) => o.targetList);
    const noteOpt = currentOptions.find((o) => o.type === "note");
    if (slashOpt) {
      handleCapture(slashOpt.type, { targetList: slashOpt.targetList, cleanSubject: slashOpt.cleanSubject });
      return;
    }
    if (noteOpt) {
      handleCapture("note");
      return;
    }
    
    // Check for Commands to forward appropriately
    const commandMatch = q.match(/^(?:\/)(Add|Find|Remove|Inside|Capabilities)(?=\s|$)/i);
    if (commandMatch) {
      if (commandMatch[1].toLowerCase() === "add") {
        const stripped = q.replace(/^\/Add(?=\s|$)\s*/i, "");
        // If /Add has content, strip the prefix; otherwise forward the raw command
        // so the assistant can show a helpful prompt
        q = stripped || q;
      }
      // /Remove with a target can be executed directly from home page
      if (commandMatch[1].toLowerCase() === "remove") {
        const removeContent = q.replace(/^\/Remove(?=\s|$)\s*/i, "").trim();
        if (removeContent && removeContent.includes("/")) {
          // Has content + target — execute directly
          handleRemove(q);
          return;
        }
      }
      navigate("/assistant", { state: { initialMessage: q } });
      return;
    }
    
    navigate("/assistant", { state: { initialMessage: q } });
  };

  return (
    <div className="mb-3">
      <div className="relative">
        <form
          onSubmit={(e) => { 
            e.preventDefault(); 
            const hasValidCommand = value.match(/(?:^|\s)\/(Find|Add|Remove|Inside|Capabilities)(?=\s|$)/i);
            if (!isSlashActive || hasExactMatch || suggestions.length === 0 || hasValidCommand) {
              handleSubmit(); 
            }
          }}
          className="relative flex items-center"
        >
          <div className="absolute left-3 flex items-center pointer-events-none">
            <Sparkles className="w-4 h-4 text-primary/60" />
          </div>
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder=""
            style={{ fontSize: "16px" }}
            className="w-full pl-9 pr-10 py-2.5 rounded-xl glass border border-border/40 text-[16px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition"
          />
          {!value && !justDone && (
            <span className="absolute left-9 top-1/2 -translate-y-1/2 text-[16px] text-muted-foreground/50 pointer-events-none select-none truncate max-w-[calc(100%-5rem)]">
              {animatedPlaceholder}<span className="animate-pulse">|</span>
            </span>
          )}
          <button
            type="submit"
            disabled={!value.trim()}
            className="absolute right-2 p-1.5 rounded-lg text-primary hover:bg-primary/10 transition disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
        <ListAutocompleteDropdown
          suggestions={suggestions}
          isActive={isSlashActive}
          onSelect={selectList}
          partialQuery={partialQuery}
          hasExactMatch={hasExactMatch}
        />
        {!isSlashActive && (
          <QuerySuggestionsDropdown
            suggestions={homeQuerySuggestions}
            shouldShow={showHomeQuerySuggestions}
            onSelect={(text) => { setValue(text); }}
            inputText={value}
          />
        )}
      </div>

      {/* Quick capture inline cards */}
      <AnimatePresence>
        {value.trim().length >= 2 && options.length > 0 && !justDone && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="overflow-hidden"
          >
            <div className="flex flex-wrap gap-1.5 mt-2">
              {options.map((opt) => (
                <button
                  key={opt.type}
                  onClick={() => handleCapture(opt.type, { targetList: opt.targetList, cleanSubject: opt.cleanSubject })}
                  disabled={executing}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-medium transition active:scale-[0.97] disabled:opacity-50 ${
                    opt.primary
                      ? "glass-elevated text-primary"
                      : "glass text-foreground/70 hover:text-foreground"
                  }`}
                >
                  {executing && opt.primary ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                  ) : CAPTURE_ICONS[opt.type]}
                  <span>{opt.label}</span>
                  {opt.primary && (
                    <span className="text-[9px] text-muted-foreground/50 ml-0.5">
                      {opt.sublabel}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Success feedback */}
      <AnimatePresence>
        {justDone && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="flex items-center gap-2 mt-2 px-3 py-2 rounded-xl glass" style={{ borderColor: "rgba(16,185,129,0.2)" }}>
              <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <p className="text-[11px] text-emerald-600 font-medium truncate">{justDone}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default HomePage;