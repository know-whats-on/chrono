import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { getEvents, createEvent, updateEvent, deleteEvent, editEventInstance, deleteEventInstance, queryAvailability, getRules, getBookingLinks, createBookingLink } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { copyToClipboard } from "../lib/clipboard";
import { EventDetailsModal } from "./event-details-modal";
import {
  ChevronLeft, ChevronRight, Plus, X, Trash2, Calendar as CalendarIcon,
  Eye, EyeOff, Loader2, Focus, Repeat, UtensilsCrossed, Link2, Copy, CheckCircle2
} from "lucide-react";
import {
  format, startOfWeek, endOfWeek, startOfDay, endOfDay, addDays, addWeeks,
  subWeeks, subDays, isSameDay, parseISO, setHours, setMinutes, differenceInMinutes,
  getDay, isBefore
} from "date-fns";
import {
  getLocalHourMinute, isSameDayInTz, formatTimeInTz, getDateKeyInTz, formatRangeInTz,
  getDeviceTimezone, isTodayInTz
} from "../lib/timezone-utils";
import { useCalendarWeather, getWeatherInfo, type CalendarWeatherData } from "../lib/use-weather";
import { toast } from "sonner";
import { HostCalendarView } from "./host-calendar-page";

type ViewMode = "day" | "3day" | "week" | "agenda";

const PROVIDER_COLORS: Record<string, { bg: string; border: string; text: string; badge: string }> = {
  google: { bg: "bg-blue-500/10", border: "border-l-blue-500", text: "text-blue-700", badge: "bg-blue-500" },
  ics: { bg: "bg-amber-500/10", border: "border-l-amber-500", text: "text-amber-700", badge: "bg-amber-500" },
  caldav: { bg: "bg-teal-500/10", border: "border-l-teal-500", text: "text-teal-700", badge: "bg-teal-500" },
  manual: { bg: "bg-primary/10", border: "border-l-primary", text: "text-primary", badge: "bg-primary" },
};

function getProviderStyle(provider?: string) {
  return PROVIDER_COLORS[provider || "manual"] || PROVIDER_COLORS.manual;
}

export function CalendarPage() {
  const { profile } = useAuth();
  const [appMode, setAppMode] = useState(() => typeof window !== "undefined" ? localStorage.getItem("chrono_mode") || "business" : "business");

  useEffect(() => {
    const handleStorageChange = () => setAppMode(localStorage.getItem("chrono_mode") || "business");
    window.addEventListener("chrono_mode_changed", handleStorageChange);
    return () => window.removeEventListener("chrono_mode_changed", handleStorageChange);
  }, []);

  const [view, setView] = useState<ViewMode>(() =>
    typeof window !== "undefined" && window.innerWidth < 768 ? "3day" : "week"
  );
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [editEvent, setEditEvent] = useState<any>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formDate, setFormDate] = useState("");
  const [formStartTime, setFormStartTime] = useState("09:00");
  const [formEndTime, setFormEndTime] = useState("10:00");
  const [showFreeBusy, setShowFreeBusy] = useState(false);
  const [busyBlocks, setBusyBlocks] = useState<any[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [focusBlocks, setFocusBlocks] = useState<any[]>([]);
  const [mealBlocks, setMealBlocks] = useState<any[]>([]);
  const [formRecurrence, setFormRecurrence] = useState<string>("none");
  const [formRecurrenceEnd, setFormRecurrenceEnd] = useState<string>("");
  const [recurringPrompt, setRecurringPrompt] = useState<{ event: any; action: "edit" | "delete" } | null>(null);
  const [bookingCode, setBookingCode] = useState<string | null>(null);
  const [bookingCopied, setBookingCopied] = useState(false);

  // Load focus blocks from availability rules
  useEffect(() => {
    const loadFocusBlocks = async () => {
      try {
        const rules = await getRules();
        setFocusBlocks(rules?.focus_blocks || []);
        setMealBlocks(rules?.meal_hours || []);
      } catch (e) {
        console.error("Failed to load focus blocks:", e);
      }
    };
    loadFocusBlocks();
  }, []);

  const loadEvents = useCallback(async () => {
    try {
      setLoadingEvents(true);
      let start: Date, end: Date;
      if (view === "day") {
        start = startOfDay(currentDate);
        end = endOfDay(currentDate);
      } else if (view === "3day") {
        start = startOfDay(currentDate);
        end = addDays(start, 2);
      } else if (view === "week") {
        start = startOfWeek(currentDate, { weekStartsOn: 1 });
        end = endOfWeek(currentDate, { weekStartsOn: 1 });
      } else {
        start = startOfDay(currentDate);
        end = addDays(start, 14);
      }
      const ev = await getEvents(start.toISOString(), end.toISOString());
      setEvents(ev);
    } catch (e) {
      console.error("Failed to load events:", e);
    } finally {
      setLoadingEvents(false);
    }
  }, [view, currentDate]);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  // Load Free/Busy data when toggled on
  useEffect(() => {
    if (!showFreeBusy) {
      setBusyBlocks([]);
      return;
    }
    const loadBusy = async () => {
      try {
        const tz = profile?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
        let start: Date, end: Date;
        if (view === "day") {
          start = startOfDay(currentDate);
          end = endOfDay(currentDate);
        } else {
          start = startOfWeek(currentDate, { weekStartsOn: 1 });
          end = endOfWeek(currentDate, { weekStartsOn: 1 });
        }
        const result = await queryAvailability({
          start_at: start.toISOString(),
          end_at: end.toISOString(),
          timezone: tz,
          mode: "any",
        });
        const blocks = (result.conflicts || []).map((c: any) => ({
          start: c.start_at,
          end: c.end_at,
          type: c.rule_kind || "event",
          label: c.title || c.rule_kind?.replace(/_/g, " ") || "Busy",
          id: c.id,
        }));
        setBusyBlocks(blocks);
      } catch (e) {
        console.error("Failed to load free/busy:", e);
      }
    };
    loadBusy();
  }, [showFreeBusy, view, currentDate, profile]);

  const navigate = (dir: -1 | 1) => {
    if (view === "day") setCurrentDate((d) => dir === 1 ? addDays(d, 1) : subDays(d, 1));
    else if (view === "3day") setCurrentDate((d) => dir === 1 ? addDays(d, 3) : subDays(d, 3));
    else if (view === "week") setCurrentDate((d) => dir === 1 ? addWeeks(d, 1) : subWeeks(d, 1));
    else setCurrentDate((d) => dir === 1 ? addDays(d, 14) : subDays(d, 14));
  };

  const openCreate = () => {
    setEditEvent(null);
    setFormTitle("");
    setFormDate(format(currentDate, "yyyy-MM-dd"));
    setFormStartTime("09:00");
    setFormEndTime("10:00");
    setFormRecurrence("none");
    setFormRecurrenceEnd("");
    setShowCreate(true);
  };

  const openEdit = (ev: any) => {
    if (ev.provider === "ics" || ev.provider === "caldav") return;
    // If it's a recurring instance, prompt for "this event" vs "all events"
    if (ev.recurring_event_id || ev.recurrence_rule) {
      setRecurringPrompt({ event: ev, action: "edit" });
      return;
    }
    doOpenEdit(ev);
  };

  const doOpenEdit = (ev: any) => {
    setEditEvent(ev);
    setFormTitle(ev.title);
    setFormDate(format(parseISO(ev.start_at), "yyyy-MM-dd"));
    setFormStartTime(format(parseISO(ev.start_at), "HH:mm"));
    setFormEndTime(format(parseISO(ev.end_at), "HH:mm"));
    const rule = ev.recurrence_rule;
    setFormRecurrence(rule ? rule.frequency : "none");
    setFormRecurrenceEnd(rule?.end_date || "");
    setShowCreate(true);
  };

  const handleEditThisInstance = () => {
    if (!recurringPrompt) return;
    const ev = recurringPrompt.event;
    // Open edit form for just this instance — we'll save via edit-instance endpoint
    setEditEvent({ ...ev, _editMode: "instance" });
    setFormTitle(ev.title);
    setFormDate(format(parseISO(ev.start_at), "yyyy-MM-dd"));
    setFormStartTime(format(parseISO(ev.start_at), "HH:mm"));
    setFormEndTime(format(parseISO(ev.end_at), "HH:mm"));
    setFormRecurrence("none");
    setFormRecurrenceEnd("");
    setRecurringPrompt(null);
    setShowCreate(true);
  };

  const handleEditAllInSeries = () => {
    if (!recurringPrompt) return;
    const ev = recurringPrompt.event;
    const parentId = ev.recurring_event_id || ev.id;
    // Find the parent from the events list or use the original event's data
    const parentEv = events.find((e: any) => e.id === parentId) || ev;
    setEditEvent({ ...parentEv, id: parentId, _editMode: "series" });
    setFormTitle(parentEv.title);
    setFormDate(format(parseISO(parentEv.start_at), "yyyy-MM-dd"));
    setFormStartTime(format(parseISO(parentEv.start_at), "HH:mm"));
    setFormEndTime(format(parseISO(parentEv.end_at), "HH:mm"));
    const rule = parentEv.recurrence_rule;
    setFormRecurrence(rule ? rule.frequency : "none");
    setFormRecurrenceEnd(rule?.end_date || "");
    setRecurringPrompt(null);
    setShowCreate(true);
  };

  const handleSave = async () => {
    const [startH, startM] = formStartTime.split(":").map(Number);
    const [endH, endM] = formEndTime.split(":").map(Number);
    const baseDate = parseISO(formDate);
    const start_at = setMinutes(setHours(baseDate, startH), startM).toISOString();
    const end_at = setMinutes(setHours(baseDate, endH), endM).toISOString();

    const recurrence_rule = formRecurrence !== "none" ? {
      frequency: formRecurrence,
      interval: 1,
      ...(formRecurrenceEnd ? { end_date: formRecurrenceEnd } : {}),
    } : null;

    if (editEvent) {
      if (editEvent._editMode === "instance") {
        // Edit a single instance via the special endpoint
        const parentId = editEvent.recurring_event_id || editEvent.id;
        await editEventInstance(parentId, {
          instance_date: editEvent.instance_date,
          title: formTitle,
          start_at,
          end_at,
        });
      } else {
        // Edit entire series or a regular event
        const updates: any = { title: formTitle, start_at, end_at };
        if (recurrence_rule) {
          updates.recurrence_rule = recurrence_rule;
        } else if (editEvent.recurrence_rule) {
          // Removing recurrence
          updates.recurrence_rule = null;
        }
        await updateEvent(editEvent.id, updates);
      }
    } else {
      const data: any = { title: formTitle, start_at, end_at };
      if (recurrence_rule) data.recurrence_rule = recurrence_rule;
      await createEvent(data);
    }
    setShowCreate(false);
    loadEvents();
  };

  const handleDelete = async (id: string) => {
    // Check if it's a recurring event (any instance or the parent)
    const ev = events.find((e: any) => e.id === id);
    if (ev && (ev.recurring_event_id || ev.recurrence_rule)) {
      setRecurringPrompt({ event: ev, action: "delete" });
      return;
    }
    await deleteEvent(id);
    loadEvents();
  };

  const handleDeleteThisInstance = async () => {
    if (!recurringPrompt) return;
    const ev = recurringPrompt.event;
    const parentId = ev.recurring_event_id || ev.id;
    await deleteEventInstance(parentId, { instance_date: ev.instance_date });
    setRecurringPrompt(null);
    loadEvents();
  };

  const handleDeleteAllInSeries = async () => {
    if (!recurringPrompt) return;
    const ev = recurringPrompt.event;
    const parentId = ev.recurring_event_id || ev.id;
    await deleteEvent(parentId);
    setRecurringPrompt(null);
    loadEvents();
  };

  // Load booking link
  useEffect(() => {
    getBookingLinks().then((links: any[]) => {
      if (Array.isArray(links) && links.length > 0) setBookingCode(links[0].code);
    }).catch(() => {});
  }, []);

  const handleBookingLink = async () => {
    let code = bookingCode;
    if (!code) {
      try {
        const link = await createBookingLink();
        code = link.code;
        setBookingCode(code);
      } catch { return; }
    }
    const url = `${window.location.origin}/book/${code}`;
    const ok = await copyToClipboard(url);
    if (ok) {
      setBookingCopied(true);
      toast.success("Booking link copied!");
      setTimeout(() => setBookingCopied(false), 2000);
    }
  };

  const weekDays = Array.from({ length: 7 }, (_, i) =>
    addDays(startOfWeek(currentDate, { weekStartsOn: 1 }), i)
  );

  const hours = Array.from({ length: 24 }, (_, i) => i);

  const tz = profile?.timezone || getDeviceTimezone();

  // Weather data for calendar views
  const { weather: calendarWeather } = useCalendarWeather(profile?.timezone, 16);

  const getEventsForDay = (day: Date) =>
    events.filter((e) => isSameDayInTz(e.start_at, day.toISOString(), tz));

  if (appMode === "host") {
    return <HostCalendarView />;
  }

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-4 py-3 sm:py-4 md:h-[calc(100dvh-56px-26px)] md:flex md:flex-col md:overflow-hidden">
      {/* Header — two rows on mobile, one row on desktop */}
      <div className="mb-3 sm:mb-4 space-y-2 sm:space-y-0 shrink-0">
        {/* Row 1: Navigation + Date (full width on mobile) */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 sm:gap-2 min-w-0 flex-1">
            <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-muted transition shrink-0">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <h2 className="text-sm sm:text-base font-semibold truncate">
              {view === "day"
                ? format(currentDate, "EEE, MMM d")
                : view === "3day"
                ? `${format(currentDate, "MMM d")} – ${format(addDays(currentDate, 2), "MMM d, yyyy")}`
                : view === "week"
                ? `${format(weekDays[0], "MMM d")} – ${format(weekDays[6], "MMM d, yyyy")}`
                : format(currentDate, "MMMM yyyy")}
            </h2>
            <button onClick={() => navigate(1)} className="p-1.5 rounded-lg hover:bg-muted transition shrink-0">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          {/* Desktop-only: controls inline */}
          <div className="hidden sm:flex items-center gap-1 shrink-0">
            <button
              onClick={() => setCurrentDate(new Date())}
              className="text-xs text-primary font-medium px-2 py-1.5 rounded-lg hover:bg-muted border border-transparent hover:border-border transition"
            >
              Today
            </button>
            <button
              onClick={() => setShowFreeBusy(!showFreeBusy)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition border ${
                showFreeBusy
                  ? "bg-destructive/10 border-destructive/30 text-destructive"
                  : "text-muted-foreground hover:bg-muted border-transparent"
              }`}
              title="Free/Busy overlay"
            >
              {showFreeBusy ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              <span>Free/Busy</span>
            </button>
            <button
              onClick={handleBookingLink}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition border text-muted-foreground hover:bg-muted border-transparent"
              title="Copy meeting booking link"
            >
              {bookingCopied ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <Link2 className="w-3.5 h-3.5" />}
              <span>{bookingCopied ? "Copied!" : "Booking Link"}</span>
            </button>
            <div className="w-px h-5 bg-border mx-0.5" />
            {(["day", "3day", "week", "agenda"] as ViewMode[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition capitalize ${
                  view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {v === "day" ? "Day" : v === "3day" ? "3 Days" : v === "week" ? "Week" : "Agenda"}
              </button>
            ))}
          </div>
        </div>
        {/* Row 2: Mobile-only controls */}
        <div className="flex sm:hidden items-center justify-between gap-1">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentDate(new Date())}
              className="text-xs text-primary font-medium px-2.5 py-1.5 rounded-lg hover:bg-muted border border-transparent hover:border-border transition"
            >
              Today
            </button>
            <button
              onClick={() => setShowFreeBusy(!showFreeBusy)}
              className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition border ${
                showFreeBusy
                  ? "bg-destructive/10 border-destructive/30 text-destructive"
                  : "text-muted-foreground hover:bg-muted border-transparent"
              }`}
              title="Free/Busy overlay"
            >
              {showFreeBusy ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={handleBookingLink}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition border text-muted-foreground hover:bg-muted border-transparent"
              title="Copy meeting booking link"
            >
              {bookingCopied ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <Link2 className="w-3.5 h-3.5" />}
            </button>
          </div>
          <div className="flex items-center gap-1">
            {(["day", "3day", "week", "agenda"] as ViewMode[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition capitalize ${
                  view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {v === "day" ? "Day" : v === "3day" ? "3 Days" : v === "week" ? "Week" : "Agenda"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Loading skeleton */}
      {loadingEvents && (
        <CalendarSkeleton view={view} />
      )}

      {/* Views */}
      {!loadingEvents && (
        <div className="md:flex-1 md:min-h-0 md:flex md:flex-col">
          {view === "agenda" ? (
            <div className="md:flex-1 md:overflow-y-auto">
              <AgendaView events={events} onEdit={openEdit} onSelect={setSelectedEventId} onDelete={handleDelete} showFreeBusy={showFreeBusy} tz={tz} weather={calendarWeather} />
            </div>
          ) : view === "day" ? (
            <DayView
              day={currentDate}
              events={getEventsForDay(currentDate)}
              hours={hours}
              onEdit={openEdit}
              onSelect={setSelectedEventId}
              onDelete={handleDelete}
              showFreeBusy={showFreeBusy}
              busyBlocks={busyBlocks}
              tz={tz}
              focusBlocks={focusBlocks}
              mealBlocks={mealBlocks}
              weather={calendarWeather}
            />
          ) : view === "3day" ? (
            <ThreeDayView
              days={Array.from({ length: 3 }, (_, i) => addDays(startOfDay(currentDate), i))}
              events={events}
              hours={hours}
              onEdit={openEdit}
              onSelect={setSelectedEventId}
              onDelete={handleDelete}
              showFreeBusy={showFreeBusy}
              busyBlocks={busyBlocks}
              tz={tz}
              focusBlocks={focusBlocks}
              mealBlocks={mealBlocks}
              weather={calendarWeather}
            />
          ) : (
            <WeekView
              weekDays={weekDays}
              events={events}
              hours={hours}
              onEdit={openEdit}
              onSelect={setSelectedEventId}
              onDelete={handleDelete}
              showFreeBusy={showFreeBusy}
              busyBlocks={busyBlocks}
              tz={tz}
              focusBlocks={focusBlocks}
              mealBlocks={mealBlocks}
              weather={calendarWeather}
            />
          )}
        </div>
      )}

      {/* FAB */}
      <button
        onClick={openCreate}
        className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] right-5 md:bottom-8 md:right-8 w-14 h-14 bg-primary text-primary-foreground rounded-full shadow-lg flex items-center justify-center hover:scale-105 transition active:scale-95 hover:shadow-xl z-40"
      >
        <Plus className="w-7 h-7" />
      </button>

      {/* Event Details Modal */}
      <EventDetailsModal
        eventId={selectedEventId}
        onClose={() => setSelectedEventId(null)}
        userTimezone={tz}
        outlookAccounts={profile?.outlook_accounts || []}
        gmailAccounts={profile?.gmail_accounts || []}
        onEdit={(ev) => {
          setSelectedEventId(null);
          // Remap camelCase from event details to snake_case expected by openEdit
          const mapped = {
            ...ev,
            start_at: ev.start_at || ev.startAt,
            end_at: ev.end_at || ev.endAt,
          };
          openEdit(mapped);
        }}
        onDelete={async (id, mode) => {
          setSelectedEventId(null);
          if (mode === "normal") {
            await deleteEvent(id);
          } else if (mode === "single") {
            const ev = events.find((e: any) => e.id === id);
            const parentId = ev?.recurring_event_id || id;
            await deleteEventInstance(parentId, { instance_date: ev?.instance_date });
          } else if (mode === "all") {
            const ev = events.find((e: any) => e.id === id);
            const parentId = ev?.recurring_event_id || id;
            await deleteEvent(parentId);
          }
          loadEvents();
        }}
      />

      {/* Recurring Event Prompt */}
      {recurringPrompt && (
        <div className="modal-overlay" onClick={() => setRecurringPrompt(null)}>
          <div className="modal-sheet p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-base">
                {recurringPrompt.action === "edit" ? "Edit Recurring Event" : "Delete Recurring Event"}
              </h3>
              <button onClick={() => setRecurringPrompt(null)} className="p-1.5 rounded hover:bg-muted">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              <span className="font-medium text-foreground">{recurringPrompt.event.title}</span> is part of a recurring series. What would you like to {recurringPrompt.action}?
            </p>
            <div className="space-y-2">
              <button
                onClick={recurringPrompt.action === "edit" ? handleEditThisInstance : handleDeleteThisInstance}
                className="w-full py-2.5 bg-muted hover:bg-muted/80 rounded-lg text-sm font-medium transition"
              >
                {recurringPrompt.action === "edit" ? "This event only" : "This event only"}
              </button>
              <button
                onClick={recurringPrompt.action === "edit" ? handleEditAllInSeries : handleDeleteAllInSeries}
                className={`w-full py-2.5 rounded-lg text-sm font-medium transition ${
                  recurringPrompt.action === "delete"
                    ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    : "bg-primary text-primary-foreground hover:bg-primary/90"
                }`}
              >
                {recurringPrompt.action === "edit" ? "All events in series" : "All events in series"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div
            className="modal-sheet p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-base">
                {editEvent
                  ? editEvent._editMode === "instance"
                    ? "Edit This Event"
                    : editEvent._editMode === "series"
                    ? "Edit Series"
                    : "Edit Event"
                  : "New Event"}
              </h3>
              <button onClick={() => setShowCreate(false)} className="p-1.5 rounded hover:bg-muted">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <input
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="Event title"
                className="w-full px-3 py-2.5 rounded-lg border bg-input-background text-sm"
                autoFocus
              />
              <input
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border bg-input-background text-sm"
              />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Start</label>
                  <input
                    type="time"
                    value={formStartTime}
                    onChange={(e) => setFormStartTime(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg border bg-input-background text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">End</label>
                  <input
                    type="time"
                    value={formEndTime}
                    onChange={(e) => setFormEndTime(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg border bg-input-background text-sm"
                  />
                </div>
              </div>

              {/* Recurrence */}
              {editEvent?._editMode !== "instance" && (
                <div>
                  <label className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                    <Repeat className="w-3 h-3" /> Repeat
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { value: "none", label: "None" },
                      { value: "daily", label: "Daily" },
                      { value: "weekly", label: "Weekly" },
                      { value: "monthly", label: "Monthly" },
                      { value: "yearly", label: "Yearly" },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setFormRecurrence(opt.value)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition border ${
                          formRecurrence === opt.value
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-muted/50 text-muted-foreground border-transparent hover:bg-muted"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  {formRecurrence !== "none" && (
                    <div className="mt-2">
                      <label className="text-xs text-muted-foreground mb-1 block">End date (optional)</label>
                      <input
                        type="date"
                        value={formRecurrenceEnd}
                        onChange={(e) => setFormRecurrenceEnd(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-lg border bg-input-background text-sm"
                        placeholder="Repeats forever if empty"
                      />
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {formRecurrenceEnd
                          ? `Repeats ${formRecurrence} until ${format(parseISO(formRecurrenceEnd), "MMM d, yyyy")}`
                          : `Repeats ${formRecurrence} indefinitely`}
                      </p>
                    </div>
                  )}
                </div>
              )}

              <button
                onClick={handleSave}
                disabled={!formTitle.trim()}
                className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {editEvent ? "Save changes" : formRecurrence !== "none" ? "Create recurring event" : "Create event"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Skeleton loader for calendar views
function CalendarSkeleton({ view }: { view: ViewMode }) {
  if (view === "agenda") {
    return (
      <div className="space-y-4 animate-pulse">
        {[1, 2, 3].map((g) => (
          <div key={g}>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-muted" />
              <div className="space-y-1">
                <div className="h-3 w-16 bg-muted rounded" />
                <div className="h-2.5 w-24 bg-muted rounded" />
              </div>
            </div>
            <div className="space-y-2 ml-10">
              {[1, 2].map((e) => (
                <div key={e} className="bg-card border rounded-lg p-3 flex items-center gap-3">
                  <div className="w-1 h-10 rounded-full bg-muted shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 w-3/4 bg-muted rounded" />
                    <div className="h-3 w-1/2 bg-muted rounded" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
    </div>
  );
}

// Compute event position in time grid (timezone-aware)
function getEventPosition(event: any, hourStart: number, tz?: string) {
  const s = getLocalHourMinute(event.start_at, tz || getDeviceTimezone());
  const e = getLocalHourMinute(event.end_at, tz || getDeviceTimezone());
  const startMinutes = s.hour * 60 + s.minute;
  const endMinutes = e.hour * 60 + e.minute;
  const gridStart = hourStart * 60;
  const top = ((startMinutes - gridStart) / 60) * 56;
  const height = Math.max(((endMinutes - startMinutes) / 60) * 56, 20);
  return { top, height };
}

function getBusyBlocksForDay(busyBlocks: any[], day: Date, hourStart: number, tz?: string) {
  const timezone = tz || getDeviceTimezone();
  const dayKey = day.toISOString();
  return busyBlocks
    .filter((b: any) => isSameDayInTz(b.start, dayKey, timezone))
    .map((b: any) => {
      const s = getLocalHourMinute(b.start, timezone);
      const e = getLocalHourMinute(b.end, timezone);
      const startMins = s.hour * 60 + s.minute;
      const endMins = e.hour * 60 + e.minute;
      const gridStart = hourStart * 60;
      return {
        top: ((startMins - gridStart) / 60) * 56,
        height: Math.max(((endMins - startMins) / 60) * 56, 4),
        label: b.label,
        type: b.type,
        id: b.id,
      };
    });
}

function ProviderBadge({ provider }: { provider?: string }) {
  if (!provider || provider === "manual") return null;
  const label = provider === "google" ? "G" : provider === "ics" ? "ICS" : provider === "caldav" ? "DAV" : provider.charAt(0).toUpperCase();
  const style = getProviderStyle(provider);
  return (
    <span className={`inline-flex items-center justify-center w-4 h-4 rounded text-[8px] font-bold text-white shrink-0 ${style.badge}`}>
      {label}
    </span>
  );
}

// Map date-fns getDay (0=Sun) to dow strings used by availability rules
const DAY_INDEX_TO_DOW = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function getFocusBlocksForDay(focusBlocks: any[], day: Date, hourStart: number): { top: number; height: number; label: string }[] {
  const dow = DAY_INDEX_TO_DOW[getDay(day)];
  return focusBlocks
    .filter((fb: any) => fb.dow === dow)
    .map((fb: any) => {
      const [startH, startM] = fb.start.split(":").map(Number);
      const [endH, endM] = fb.end.split(":").map(Number);
      const startMins = startH * 60 + startM;
      const endMins = endH * 60 + endM;
      const gridStart = hourStart * 60;
      return {
        top: ((startMins - gridStart) / 60) * 56,
        height: Math.max(((endMins - startMins) / 60) * 56, 20),
        label: fb.label || "Focus",
      };
    });
}

function getMealBlocksForDay(mealBlocks: any[], day: Date, hourStart: number): { top: number; height: number; label: string }[] {
  const dow = DAY_INDEX_TO_DOW[getDay(day)];
  return mealBlocks
    .filter((mb: any) => mb.dow === dow)
    .map((mb: any) => {
      const [startH, startM] = mb.start.split(":").map(Number);
      const [endH, endM] = mb.end.split(":").map(Number);
      const startMins = startH * 60 + startM;
      const endMins = endH * 60 + endM;
      const gridStart = hourStart * 60;
      return {
        top: ((startMins - gridStart) / 60) * 56,
        height: Math.max(((endMins - startMins) / 60) * 56, 20),
        label: mb.label || "Meal",
      };
    });
}

const HOUR_HEIGHT = 56;
const SCROLL_TO_HOUR = 9; // 9 AM anchor

// ── Inline weather badge for calendar headers ──
function DayWeatherBadge({ day, weather }: { day: Date; weather: CalendarWeatherData | null }) {
  if (!weather) return null;
  const dateKey = format(day, "yyyy-MM-dd");
  const d = weather.daily[dateKey];
  if (!d) return null;
  const wi = getWeatherInfo(d.code);
  return (
    <div className="flex items-center justify-center gap-0.5 mt-0.5" title={`${wi.label} — H:${d.high}° L:${d.low}°`}>
      <wi.Icon className="w-3 h-3 text-muted-foreground" />
      <span className="text-[8px] sm:text-[9px] font-medium text-muted-foreground">{d.high}°</span>
    </div>
  );
}

// ── Weather badge for agenda event cards (shows temp at event start hour) ──
function EventWeatherBadge({ event, dayKey, weather, tz }: { event: any; dayKey: string; weather: CalendarWeatherData | null; tz: string }) {
  if (!weather) return null;
  const hourlyForDay = weather.hourly[dayKey];
  if (!hourlyForDay) return null;
  const { hour } = getLocalHourMinute(event.start_at, tz);
  const entry = hourlyForDay.find((h) => h.hour === hour);
  if (!entry) return null;
  const wi = getWeatherInfo(entry.code);
  return (
    <span className="inline-flex items-center gap-0.5 text-muted-foreground shrink-0" title={`${wi.label} ${entry.temp}°`}>
      <wi.Icon className="w-3 h-3" />
      <span className="text-[10px] font-medium">{entry.temp}°</span>
    </span>
  );
}

// ── Current Time Indicator for Grids ──
function CurrentTimeLine({ tz, hourStart }: { tz: string; hourStart: number }) {
  const [now, setNow] = useState(new Date());
  
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const { hour, minute } = getLocalHourMinute(now.toISOString(), tz);
  const startMins = hour * 60 + minute;
  const gridStart = hourStart * 60;
  
  if (startMins < gridStart) return null;

  const top = ((startMins - gridStart) / 60) * 56;

  return (
    <div 
      className="absolute z-20 pointer-events-none left-0 right-0"
      style={{ top: `${top}px` }}
    >
      <div className="absolute -top-[4px] -left-[5px] w-2.5 h-2.5 rounded-full bg-red-500 shadow-sm" />
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-red-500/80 shadow-sm" />
    </div>
  );
}

function WeekView({ weekDays, events, hours, onEdit, onSelect, onDelete, showFreeBusy, busyBlocks, tz, focusBlocks, mealBlocks, weather }: any) {
  const hourStart = hours[0];
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      const offset = (SCROLL_TO_HOUR - hourStart) * HOUR_HEIGHT;
      scrollRef.current.scrollTop = Math.max(0, offset);
    }
  }, [hourStart]);

  return (
    <div className="glass rounded-2xl md:flex md:flex-col md:flex-1 md:min-h-0 overflow-hidden">
      {/* Day headers */}
      <div className="grid grid-cols-[44px_repeat(7,1fr)] sm:grid-cols-[52px_repeat(7,1fr)] border-b shrink-0" style={{ borderColor: "var(--border-subtle)" }}>
        <div className="p-1 sm:p-2" />
        {weekDays.map((day: Date, dayIdx: number) => {
          const isToday = isSameDay(day, new Date());
          return (
            <div key={day.toISOString()} className={`p-1 sm:p-2 text-center ${isToday ? "bg-primary/5" : dayIdx % 2 === 1 ? "bg-muted/30" : ""}`}>
              <p className="text-[9px] sm:text-[10px] text-muted-foreground uppercase tracking-wider">{format(day, "EEE")}</p>
              <p className={`text-xs sm:text-sm font-medium mt-0.5 ${isToday ? "bg-primary text-primary-foreground w-6 h-6 sm:w-7 sm:h-7 rounded-full mx-auto flex items-center justify-center" : ""}`}>
                {format(day, "d")}
              </p>
              <DayWeatherBadge day={day} weather={weather} />
            </div>
          );
        })}
      </div>
      {/* All-day events row */}
      {(() => {
        const hasAny = weekDays.some((day: Date) =>
          events.some((e: any) => e.is_all_day && isSameDayInTz(e.start_at, day.toISOString(), tz))
        );
        if (!hasAny) return null;
        return (
          <div className="grid grid-cols-[44px_repeat(7,1fr)] sm:grid-cols-[52px_repeat(7,1fr)] border-b shrink-0" style={{ borderColor: "var(--border-subtle)" }}>
            <div className="text-[8px] text-muted-foreground p-1 text-right flex items-center justify-end pr-1">all-day</div>
            {weekDays.map((day: Date) => {
              const allDayEvs = events.filter((e: any) => e.is_all_day && isSameDayInTz(e.start_at, day.toISOString(), tz));
              return (
                <div key={`ad-${day.toISOString()}`} className="border-l border-dashed px-0.5 py-0.5 min-h-[24px] flex flex-col gap-0.5" style={{ borderColor: "var(--border-subtle)" }}>
                  {allDayEvs.map((ev: any) => {
                    const style = getProviderStyle(ev.provider);
                    return (
                      <button
                        key={ev.id}
                        onClick={() => onSelect(ev.id)}
                        className={`${style.bg} ${style.text} rounded px-1 py-0.5 text-[8px] sm:text-[9px] font-medium truncate text-left cursor-pointer hover:opacity-80 transition`}
                        title={showFreeBusy ? "Busy" : ev.title}
                      >
                        <div className="flex items-center gap-0.5 min-w-0">
                          {!showFreeBusy && <ProviderBadge provider={ev.provider} />}
                          <span className="truncate">{showFreeBusy ? "Busy" : ev.title}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        );
      })()}
      {/* Overlay legend */}
      {(showFreeBusy || mealBlocks.length > 0) && (
        <div className="flex items-center gap-3 px-3 py-1.5 border-b text-[10px] text-muted-foreground shrink-0" style={{ borderColor: "var(--border-subtle)" }}>
          {showFreeBusy && <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-400/25 border border-red-400/40" /> Busy</span>}
          {showFreeBusy && <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-400/20 border border-emerald-400/40" /> Free</span>}
          {mealBlocks.length > 0 && <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-amber-400/25 border border-amber-500/40" /> <UtensilsCrossed className="w-2.5 h-2.5" /> Meal</span>}
        </div>
      )}
      {/* Time grid */}
      <div ref={scrollRef} className="max-h-[540px] md:max-h-none md:flex-1 overflow-auto">
        <div className="grid grid-cols-[44px_repeat(7,1fr)] sm:grid-cols-[52px_repeat(7,1fr)] relative">
          {hours.flatMap((hour: number) => [
            <div key={`label-${hour}`} className="text-[9px] sm:text-[10px] text-muted-foreground p-0.5 sm:p-1 text-right pr-1 sm:pr-2 h-[56px] flex items-start pt-0">
              <span className="w-full -mt-1.5">{format(setHours(new Date(), hour), "h a")}</span>
            </div>,
            ...weekDays.map((day: Date, dayIdx: number) => (
              <div key={`${day.toISOString()}-${hour}`} className={`border-l border-t border-dashed h-[56px] ${dayIdx % 2 === 1 ? "bg-muted/20" : ""}`} style={{ borderColor: "var(--border-subtle)" }} />
            )),
          ])}
          {/* Free/Busy: full-column green tint for free time when active */}
          {showFreeBusy && weekDays.map((_day: Date, dayIdx: number) => (
            <div
              key={`free-col-${dayIdx}`}
              className="absolute pointer-events-none bg-emerald-400/[0.06]"
              style={{
                left: `calc(44px + (100% - 44px) / 7 * ${dayIdx})`,
                width: `calc((100% - 44px) / 7)`,
                top: 0,
                bottom: 0,
              }}
            />
          ))}
          {weekDays.map((day: Date, dayIdx: number) => {
            const dayEvents = events.filter((e: any) => !e.is_all_day && isSameDayInTz(e.start_at, day.toISOString(), tz));
            const dayBusy = showFreeBusy ? getBusyBlocksForDay(busyBlocks, day, hourStart, tz) : [];
            const dayFocus = getFocusBlocksForDay(focusBlocks, day, hourStart);
            const dayMeals = getMealBlocksForDay(mealBlocks, day, hourStart);

            return (
              <div
                key={`overlay-${day.toISOString()}`}
                className="absolute"
                style={{
                  left: `calc(44px + (100% - 44px) / 7 * ${dayIdx})`,
                  width: `calc((100% - 44px) / 7)`,
                  top: 0,
                  bottom: 0,
                }}
              >
                {dayBusy.map((b: any, i: number) => (
                  <div
                    key={`busy-${i}`}
                    className="absolute left-0 right-0 bg-red-400/15 border-l-2 border-red-400/50 z-[5]"
                    style={{ top: `${b.top}px`, height: `${b.height}px` }}
                  >
                    {b.height > 16 && (
                      <span className="text-[8px] text-red-500/70 font-medium px-1 truncate block">Busy</span>
                    )}
                  </div>
                ))}

                {dayFocus.map((fb: any, i: number) => (
                  <div
                    key={`focus-${i}`}
                    className="absolute left-0 right-0 bg-emerald-400/15 border-l-2 border-emerald-400/50 z-[5]"
                    style={{ top: `${fb.top}px`, height: `${fb.height}px` }}
                  >
                    {fb.height > 16 && (
                      <span className="text-[8px] text-emerald-500/70 font-medium px-1 truncate block">{fb.label}</span>
                    )}
                  </div>
                ))}

                {dayMeals.map((mb: any, i: number) => (
                  <div
                    key={`meal-${i}`}
                    className="absolute left-0 right-0 bg-amber-400/15 border-l-2 border-amber-500/50 z-[5]"
                    style={{ top: `${mb.top}px`, height: `${mb.height}px` }}
                  >
                    {mb.height > 16 && (
                      <span className="text-[8px] text-amber-600/70 font-medium px-1 truncate block flex items-center gap-0.5">
                        <UtensilsCrossed className="w-2.5 h-2.5 inline shrink-0" />{mb.label}
                      </span>
                    )}
                  </div>
                ))}

                {isSameDayInTz(day.toISOString(), new Date().toISOString(), tz) && (
                  <CurrentTimeLine tz={tz} hourStart={hourStart} />
                )}

                {/* WeekView: always show events, even when Free/Busy overlay is active */}
                {dayEvents.map((ev: any) => {
                  const pos = getEventPosition(ev, hourStart, tz);
                  const style = getProviderStyle(ev.provider);
                  return (
                    <button
                      key={ev.id}
                      onClick={() => onSelect(ev.id)}
                      className={`absolute left-0.5 right-0.5 ${style.bg} ${style.text} ${style.border} rounded px-1 py-0.5 text-[9px] sm:text-[10px] border-l-2 cursor-pointer hover:opacity-80 transition z-10 overflow-hidden text-left`}
                      style={{ top: `${pos.top}px`, height: `${pos.height}px` }}
                      title={showFreeBusy ? "Busy" : `${ev.title}\n${formatTimeInTz(ev.start_at, tz)} – ${formatTimeInTz(ev.end_at, tz)}`}
                    >
                      {showFreeBusy ? (
                        <span className="truncate font-medium">Busy</span>
                      ) : (
                        <>
                          <div className="flex items-center gap-0.5 min-w-0">
                            <ProviderBadge provider={ev.provider} />
                            {ev.recurrence_rule && <Repeat className="w-2.5 h-2.5 opacity-50 shrink-0" />}
                            <span className="truncate font-medium">{ev.title}</span>
                          </div>
                          {pos.height > 28 && (
                            <p className="text-[8px] sm:text-[9px] opacity-70 mt-0.5">
                              {formatTimeInTz(ev.start_at, tz)}
                            </p>
                          )}
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ThreeDayView({ days, events, hours, onEdit, onSelect, onDelete, showFreeBusy, busyBlocks, tz, focusBlocks, mealBlocks, weather }: any) {
  const hourStart = hours[0];
  const scrollRef = useRef<HTMLDivElement>(null);
  const colCount = days.length;

  useEffect(() => {
    if (scrollRef.current) {
      const offset = (SCROLL_TO_HOUR - hourStart) * HOUR_HEIGHT;
      scrollRef.current.scrollTop = Math.max(0, offset);
    }
  }, [hourStart]);

  return (
    <div className="glass rounded-2xl md:flex md:flex-col md:flex-1 md:min-h-0 overflow-hidden">
      {/* Day headers */}
      <div className="grid border-b shrink-0" style={{ gridTemplateColumns: `52px repeat(${colCount}, 1fr)`, borderColor: "var(--border-subtle)" }}>
        <div className="p-2" />
        {days.map((day: Date, dayIdx: number) => {
          const isToday = isSameDay(day, new Date());
          return (
            <div key={day.toISOString()} className={`p-2 text-center ${isToday ? "bg-primary/5" : dayIdx % 2 === 1 ? "bg-muted/30" : ""}`}>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{format(day, "EEE")}</p>
              <p className={`text-sm font-medium mt-0.5 ${isToday ? "bg-primary text-primary-foreground w-7 h-7 rounded-full mx-auto flex items-center justify-center" : ""}`}>
                {format(day, "d")}
              </p>
              <DayWeatherBadge day={day} weather={weather} />
            </div>
          );
        })}
      </div>
      {/* All-day events row */}
      {(() => {
        const hasAny = days.some((day: Date) =>
          events.some((e: any) => e.is_all_day && isSameDayInTz(e.start_at, day.toISOString(), tz))
        );
        if (!hasAny) return null;
        return (
          <div className="grid border-b shrink-0" style={{ gridTemplateColumns: `52px repeat(${colCount}, 1fr)`, borderColor: "var(--border-subtle)" }}>
            <div className="text-[8px] text-muted-foreground p-1 text-right flex items-center justify-end pr-1">all-day</div>
            {days.map((day: Date) => {
              const allDayEvs = events.filter((e: any) => e.is_all_day && isSameDayInTz(e.start_at, day.toISOString(), tz));
              return (
                <div key={`ad-${day.toISOString()}`} className="border-l border-dashed px-0.5 py-0.5 min-h-[24px] flex flex-col gap-0.5" style={{ borderColor: "var(--border-subtle)" }}>
                  {allDayEvs.map((ev: any) => {
                    const style = getProviderStyle(ev.provider);
                    return (
                      <button
                        key={ev.id}
                        onClick={() => onSelect(ev.id)}
                        className={`${style.bg} ${style.text} rounded px-1 py-0.5 text-[9px] font-medium truncate text-left cursor-pointer hover:opacity-80 transition`}
                        title={showFreeBusy ? "Busy" : ev.title}
                      >
                        <div className="flex items-center gap-0.5 min-w-0">
                          {!showFreeBusy && <ProviderBadge provider={ev.provider} />}
                          <span className="truncate">{showFreeBusy ? "Busy" : ev.title}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        );
      })()}
      {(showFreeBusy || mealBlocks.length > 0) && (
        <div className="flex items-center gap-3 px-3 py-1.5 border-b text-[10px] text-muted-foreground shrink-0" style={{ borderColor: "var(--border-subtle)" }}>
          {showFreeBusy && <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-400/25 border border-red-400/40" /> Busy</span>}
          {showFreeBusy && <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-400/20 border border-emerald-400/40" /> Free</span>}
          {mealBlocks.length > 0 && <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-amber-400/25 border border-amber-500/40" /> <UtensilsCrossed className="w-2.5 h-2.5" /> Meal</span>}
        </div>
      )}
      {/* Time grid */}
      <div ref={scrollRef} className="max-h-[600px] md:max-h-none md:flex-1 overflow-auto">
        <div className="relative" style={{ display: "grid", gridTemplateColumns: `52px repeat(${colCount}, 1fr)` }}>
          {hours.flatMap((hour: number) => [
            <div key={`label-${hour}`} className="text-[10px] text-muted-foreground p-1 text-right pr-2 h-[56px] flex items-start pt-0">
              <span className="w-full -mt-1.5">{format(setHours(new Date(), hour), "h a")}</span>
            </div>,
            ...days.map((day: Date, dayIdx: number) => (
              <div key={`${day.toISOString()}-${hour}`} className={`border-l border-t border-dashed h-[56px] ${dayIdx % 2 === 1 ? "bg-muted/20" : ""}`} style={{ borderColor: "var(--border-subtle)" }} />
            )),
          ])}
          {showFreeBusy && days.map((_day: Date, dayIdx: number) => (
            <div
              key={`free-col-${dayIdx}`}
              className="absolute pointer-events-none bg-emerald-400/[0.06]"
              style={{
                left: `calc(52px + (100% - 52px) / ${colCount} * ${dayIdx})`,
                width: `calc((100% - 52px) / ${colCount})`,
                top: 0,
                bottom: 0,
              }}
            />
          ))}
          {days.map((day: Date, dayIdx: number) => {
            const dayEvents = events.filter((e: any) => !e.is_all_day && isSameDayInTz(e.start_at, day.toISOString(), tz));
            const dayBusy = showFreeBusy ? getBusyBlocksForDay(busyBlocks, day, hourStart, tz) : [];
            const dayFocus = getFocusBlocksForDay(focusBlocks, day, hourStart);
            const dayMeals = getMealBlocksForDay(mealBlocks, day, hourStart);

            return (
              <div
                key={`overlay-${day.toISOString()}`}
                className="absolute"
                style={{
                  left: `calc(52px + (100% - 52px) / ${colCount} * ${dayIdx})`,
                  width: `calc((100% - 52px) / ${colCount})`,
                  top: 0,
                  bottom: 0,
                }}
              >
                {dayBusy.map((b: any, i: number) => (
                  <div
                    key={`busy-${i}`}
                    className="absolute left-0 right-0 bg-red-400/15 border-l-2 border-red-400/50 z-[5]"
                    style={{ top: `${b.top}px`, height: `${b.height}px` }}
                  >
                    {b.height > 16 && (
                      <span className="text-[8px] text-red-500/70 font-medium px-1 truncate block">Busy</span>
                    )}
                  </div>
                ))}

                {dayFocus.map((fb: any, i: number) => (
                  <div
                    key={`focus-${i}`}
                    className="absolute left-0 right-0 bg-emerald-400/15 border-l-2 border-emerald-400/50 z-[5]"
                    style={{ top: `${fb.top}px`, height: `${fb.height}px` }}
                  >
                    {fb.height > 16 && (
                      <span className="text-[8px] text-emerald-500/70 font-medium px-1 truncate block">{fb.label}</span>
                    )}
                  </div>
                ))}

                {dayMeals.map((mb: any, i: number) => (
                  <div
                    key={`meal-${i}`}
                    className="absolute left-0 right-0 bg-amber-400/15 border-l-2 border-amber-500/50 z-[5]"
                    style={{ top: `${mb.top}px`, height: `${mb.height}px` }}
                  >
                    {mb.height > 16 && (
                      <span className="text-[8px] text-amber-600/70 font-medium px-1 truncate block flex items-center gap-0.5">
                        <UtensilsCrossed className="w-2.5 h-2.5 inline shrink-0" />{mb.label}
                      </span>
                    )}
                  </div>
                ))}

                {isSameDayInTz(day.toISOString(), new Date().toISOString(), tz) && (
                  <CurrentTimeLine tz={tz} hourStart={hourStart} />
                )}

                {/* ThreeDayView: always show events */}
                {dayEvents.map((ev: any) => {
                  const pos = getEventPosition(ev, hourStart, tz);
                  const evStyle = getProviderStyle(ev.provider);
                  return (
                    <button
                      key={ev.id}
                      onClick={() => onSelect(ev.id)}
                      className={`absolute left-0.5 right-0.5 ${evStyle.bg} ${evStyle.text} ${evStyle.border} rounded px-1 py-0.5 text-[10px] border-l-2 cursor-pointer hover:opacity-80 transition z-10 overflow-hidden text-left`}
                      style={{ top: `${pos.top}px`, height: `${pos.height}px` }}
                      title={showFreeBusy ? "Busy" : `${ev.title}\n${formatTimeInTz(ev.start_at, tz)} – ${formatTimeInTz(ev.end_at, tz)}`}
                    >
                      {showFreeBusy ? (
                        <span className="truncate font-medium">Busy</span>
                      ) : (
                        <>
                          <div className="flex items-center gap-0.5 min-w-0">
                            <ProviderBadge provider={ev.provider} />
                            {ev.recurrence_rule && <Repeat className="w-2.5 h-2.5 opacity-50 shrink-0" />}
                            <span className="truncate font-medium">{ev.title}</span>
                          </div>
                          {pos.height > 28 && (
                            <p className="text-[8px] sm:text-[9px] opacity-70 mt-0.5">
                              {formatTimeInTz(ev.start_at, tz)}
                            </p>
                          )}
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DayView({ day, events, hours, onEdit, onSelect, onDelete, showFreeBusy, busyBlocks, tz, focusBlocks, mealBlocks, weather }: any) {
  const hourStart = hours[0];
  const timezone = tz || getDeviceTimezone();
  const dayBusy = showFreeBusy ? getBusyBlocksForDay(busyBlocks, day, hourStart, timezone) : [];
  const dayFocus = getFocusBlocksForDay(focusBlocks, day, hourStart);
  const dayMeals = getMealBlocksForDay(mealBlocks, day, hourStart);
  const scrollRef = useRef<HTMLDivElement>(null);
  const allDayEvents = events.filter((e: any) => e.is_all_day);
  const timedEvents = events.filter((e: any) => !e.is_all_day);

  // Daily weather for this day
  const dateKey = format(day, "yyyy-MM-dd");
  const dailyW = weather?.daily?.[dateKey];
  const dailyInfo = dailyW ? getWeatherInfo(dailyW.code) : null;

  useEffect(() => {
    if (scrollRef.current) {
      const offset = (SCROLL_TO_HOUR - hourStart) * HOUR_HEIGHT;
      scrollRef.current.scrollTop = Math.max(0, offset);
    }
  }, [hourStart]);

  return (
    <div className="glass rounded-2xl md:flex md:flex-col md:flex-1 md:min-h-0 overflow-hidden">
      {/* Weather banner */}
      {dailyW && dailyInfo && (
        <div className="flex items-center gap-2 px-4 py-1.5 border-b text-xs text-muted-foreground shrink-0" style={{ borderColor: "var(--border-subtle)" }}>
          <dailyInfo.Icon className="w-3.5 h-3.5" />
          <span className="font-medium">{dailyInfo.label}</span>
          <span className="text-[10px]">H:{dailyW.high}° L:{dailyW.low}°</span>
        </div>
      )}
      {/* All-day events row */}
      {allDayEvents.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-1.5 border-b shrink-0" style={{ borderColor: "var(--border-subtle)" }}>
          <span className="text-[8px] text-muted-foreground uppercase tracking-wider shrink-0">all-day</span>
          <div className="flex flex-wrap gap-1 flex-1">
            {allDayEvents.map((ev: any) => {
              const evStyle = getProviderStyle(ev.provider);
              return (
                <button
                  key={ev.id}
                  onClick={() => onSelect(ev.id)}
                  className={`${evStyle.bg} ${evStyle.text} rounded px-2 py-0.5 text-[9px] font-medium truncate cursor-pointer hover:opacity-80 transition`}
                  title={showFreeBusy ? "Busy" : ev.title}
                >
                  <div className="flex items-center gap-0.5 min-w-0">
                    {!showFreeBusy && <ProviderBadge provider={ev.provider} />}
                    <span className="truncate">{showFreeBusy ? "Busy" : ev.title}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
      {/* Overlay legend */}
      {(showFreeBusy || mealBlocks.length > 0) && (
        <div className="flex items-center gap-3 px-3 py-1.5 border-b text-[10px] text-muted-foreground shrink-0" style={{ borderColor: "var(--border-subtle)" }}>
          {showFreeBusy && <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-400/25 border border-red-400/40" /> Busy</span>}
          {showFreeBusy && <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-400/20 border border-emerald-400/40" /> Free</span>}
          {mealBlocks.length > 0 && <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-amber-400/25 border border-amber-500/40" /> <UtensilsCrossed className="w-2.5 h-2.5" /> Meal</span>}
        </div>
      )}
      <div ref={scrollRef} className="max-h-[600px] md:max-h-none md:flex-1 overflow-auto">
        <div className="relative">
          {/* Green free-time background when Free/Busy active */}
          {showFreeBusy && (
            <div className="absolute inset-0 pointer-events-none bg-emerald-400/[0.06]" style={{ left: "56px" }} />
          )}
          {hours.map((hour: number) => (
            <div key={hour} className="flex border-b border-dashed h-[56px]" style={{ borderColor: "var(--border-subtle)" }}>
              <div className="w-14 sm:w-16 text-xs text-muted-foreground p-2 text-right shrink-0 flex items-start -mt-1">
                {format(setHours(new Date(), hour), "h a")}
              </div>
              <div className="flex-1 relative" />
            </div>
          ))}

          {dayBusy.map((b: any, i: number) => (
            <div
              key={`busy-${i}`}
              className="absolute bg-red-400/15 border-l-2 border-red-400/50 z-[5]"
              style={{ top: `${b.top}px`, height: `${b.height}px`, left: "56px", right: "0px" }}
            >
              {b.height > 20 && (
                <span className="text-[10px] text-red-500/70 font-medium px-2 block mt-0.5">Busy</span>
              )}
            </div>
          ))}

          {dayFocus.map((fb: any, i: number) => (
            <div
              key={`focus-${i}`}
              className="absolute bg-emerald-400/15 border-l-2 border-emerald-400/50 z-[5]"
              style={{ top: `${fb.top}px`, height: `${fb.height}px`, left: "56px", right: "0px" }}
            >
              {fb.height > 20 && (
                <span className="text-[10px] text-emerald-500/70 font-medium px-2 block mt-0.5">{fb.label}</span>
              )}
            </div>
          ))}

          {dayMeals.map((mb: any, i: number) => (
            <div
              key={`meal-${i}`}
              className="absolute bg-amber-400/15 border-l-2 border-amber-500/50 z-[5]"
              style={{ top: `${mb.top}px`, height: `${mb.height}px`, left: "56px", right: "0px" }}
            >
              {mb.height > 20 && (
                <span className="text-[10px] text-amber-600/70 font-medium px-2 block mt-0.5 flex items-center gap-1">
                  <UtensilsCrossed className="w-3 h-3 inline shrink-0" />{mb.label}
                </span>
              )}
            </div>
          ))}

          {isSameDayInTz(day.toISOString(), new Date().toISOString(), timezone) && (
            <div className="absolute left-[56px] right-0 top-0 bottom-0 pointer-events-none z-20">
              <CurrentTimeLine tz={timezone} hourStart={hourStart} />
            </div>
          )}

          {/* DayView: always show events (timed only) */}
          {timedEvents.map((ev: any) => {
            const pos = getEventPosition(ev, hourStart, timezone);
            const style = getProviderStyle(ev.provider);
            const isReadOnly = ev.provider === "ics" || ev.provider === "caldav";
            return (
              <div
                key={ev.id}
                className={`absolute ${style.bg} ${style.text} ${style.border} rounded-lg px-2.5 sm:px-3 py-2 text-sm border-l-2 cursor-pointer hover:opacity-80 transition z-10 flex items-start justify-between gap-2`}
                style={{ top: `${pos.top}px`, height: `${Math.max(pos.height, 32)}px`, left: "60px", right: "8px" }}
                onClick={() => onSelect(ev.id)}
              >
                <div className="min-w-0 flex-1">
                  {showFreeBusy ? (
                    <p className="font-medium text-sm truncate">Busy</p>
                  ) : (
                    <>
                      <div className="flex items-center gap-1.5 min-w-0">
                        <ProviderBadge provider={ev.provider} />
                        {ev.recurrence_rule && <Repeat className="w-3 h-3 opacity-50 shrink-0" />}
                        <p className="font-medium text-sm truncate">{ev.title}</p>
                        {isReadOnly && (
                          <span className="text-[9px] px-1 py-0.5 bg-muted rounded text-muted-foreground shrink-0">read-only</span>
                        )}
                      </div>
                      {pos.height > 32 && (
                        <p className="text-xs opacity-70 mt-0.5">
                          {formatTimeInTz(ev.start_at, timezone)} – {formatTimeInTz(ev.end_at, timezone)}
                        </p>
                      )}
                    </>
                  )}
                </div>
                {!isReadOnly && !showFreeBusy && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onDelete(ev.id); }}
                    className="p-1 rounded hover:bg-destructive/10 shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function AgendaNowIndicator() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex items-center gap-2 py-1 -ml-3 mr-2 my-1">
      <div className="relative w-4 h-4 flex items-center justify-center shrink-0 z-10">
        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
        <div className="absolute w-3.5 h-3.5 rounded-full bg-red-500/20 animate-ping" />
      </div>
      <div className="flex items-center gap-1.5 flex-1">
        <div className="h-px flex-1 bg-red-500/30" />
        <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-red-500">NOW</span>
        <span className="text-[9px] text-red-500/60 tabular-nums">
          {now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
        </span>
        <div className="h-px flex-1 bg-red-500/30" />
      </div>
    </div>
  );
}

function AgendaView({ events, onEdit, onSelect, onDelete, showFreeBusy, tz, weather }: any) {
  const timezone = tz || getDeviceTimezone();

  if (events.length === 0) {
    return (
      <div className="text-center py-16">
        <CalendarIcon className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">No events in this period</p>
        <p className="text-xs text-muted-foreground/60 mt-1">Tap + to create one</p>
      </div>
    );
  }

  // Group by day
  const groups: Record<string, any[]> = {};
  events.forEach((ev: any) => {
    const dayKey = getDateKeyInTz(ev.start_at, timezone);
    if (!groups[dayKey]) groups[dayKey] = [];
    groups[dayKey].push(ev);
  });

  return (
    <div className="space-y-5">
      {Object.entries(groups).map(([dayKey, dayEvents]) => (
        <div key={dayKey}>
          {/* Day header */}
          <div className="flex items-center gap-2.5 mb-2.5 sticky top-0 bg-background/95 backdrop-blur-sm py-1 -mx-1 px-1 z-10">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
              isTodayInTz(dayKey + "T00:00:00Z", timezone) ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}>
              {new Date(dayKey + "T12:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", day: "numeric" })}
            </div>
            <div className="min-w-0">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {isTodayInTz(dayKey + "T00:00:00Z", timezone) ? "Today" : new Date(dayKey + "T12:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long" })}, {new Date(dayKey + "T12:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" })}
              </h3>
            </div>
          </div>
          {/* Events */}
          <div className="space-y-2 ml-[46px]">
            {(() => {
              const isToday = isTodayInTz(dayKey + "T00:00:00Z", timezone);
              let nowInsertIndex = -1;
              if (isToday) {
                const now = new Date();
                for (let i = 0; i < dayEvents.length; i++) {
                  const ev = dayEvents[i];
                  const end = new Date(ev.end_at);
                  if (!isBefore(end, now)) {
                    nowInsertIndex = i;
                    break;
                  }
                }
                if (nowInsertIndex === -1) {
                  nowInsertIndex = dayEvents.length;
                }
              }

              return (
                <>
                  {dayEvents.map((ev: any, ei: number) => {
                    const style = getProviderStyle(ev.provider);
                    const isReadOnly = ev.provider === "ics" || ev.provider === "caldav";
                    const duration = differenceInMinutes(parseISO(ev.end_at), parseISO(ev.start_at));
                    return (
                      <div className="contents" key={ev.id}>
                        {isToday && ei === nowInsertIndex && <AgendaNowIndicator />}
                        <div
                          className={`glass rounded-xl p-3 flex items-center justify-between gap-2 hover:shadow-sm transition cursor-pointer`}
                          onClick={() => onSelect(ev.id)}
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className={`w-1 self-stretch rounded-full ${style.badge} shrink-0`} />
                            <div className="min-w-0 flex-1">
                              {showFreeBusy ? (
                                <p className="text-sm font-medium">Busy</p>
                              ) : (
                                <>
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <ProviderBadge provider={ev.provider} />
                                    {ev.recurrence_rule && <Repeat className="w-3 h-3 opacity-50 shrink-0" />}
                                    <p className="text-sm font-medium line-clamp-2 break-words">{ev.title}</p>
                                    {isReadOnly && (
                                      <span className="text-[9px] px-1 py-0.5 bg-muted rounded text-muted-foreground shrink-0 whitespace-nowrap">read-only</span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                    <p className="text-xs text-muted-foreground">
                                      {ev.is_all_day ? "All day" : `${formatTimeInTz(ev.start_at, timezone)} – ${formatTimeInTz(ev.end_at, timezone)}`}
                                    </p>
                                    {!ev.is_all_day && <span className="text-[10px] text-muted-foreground/60">{formatDuration(duration)}</span>}
                                    <EventWeatherBadge event={ev} dayKey={dayKey} weather={weather} tz={timezone} />
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                          {!isReadOnly && !showFreeBusy && (
                            <button
                              onClick={(e) => { e.stopPropagation(); onDelete(ev.id); }}
                              className="p-2 rounded-lg hover:bg-destructive/10 shrink-0 min-w-[2.75rem] min-h-[2.75rem] flex items-center justify-center"
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {isToday && nowInsertIndex === dayEvents.length && <AgendaNowIndicator />}
                </>
              );
            })()}
          </div>
        </div>
      ))}
    </div>
  );
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}min`;
  const hrs = minutes / 60;
  // Round to max 2 decimals, drop trailing zeros
  const rounded = Math.round(hrs * 100) / 100;
  const display = Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(2).replace(/0+$/, "");
  return `${display}h`;
}