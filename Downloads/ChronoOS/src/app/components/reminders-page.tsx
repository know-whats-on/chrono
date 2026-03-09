import React, { useState, useEffect, useCallback } from "react";
import {
  getReminders, createReminder, updateReminder, snoozeReminder,
  disableReminder, deleteReminder
} from "../lib/api";
import { useAuth } from "../lib/auth-context";
import {
  Plus, X, Bell, BellOff, Clock, Trash2, Loader2, AlarmClock, Download
} from "lucide-react";
import { format, parseISO, isPast, addMinutes, addHours, addDays } from "date-fns";
import { formatTimeInTz, formatDateInTz, getDeviceTimezone } from "../lib/timezone-utils";
import { downloadReminderIcs } from "../lib/ics-export";

export function RemindersPage({ isEmbedded, onRegisterCreate }: { isEmbedded?: boolean; onRegisterCreate?: (fn: () => void) => void }) {
  const { profile } = useAuth();
  const [reminders, setReminders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editReminder, setEditReminder] = useState<any>(null);

  // Form
  const [title, setTitle] = useState("");
  const [scheduleType, setScheduleType] = useState<"one_off" | "recurring">("one_off");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [rrule, setRrule] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await getReminders();
      setReminders(r);
    } catch (e) {
      console.error("Failed to load reminders:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const resetForm = () => {
    setTitle(""); setScheduleType("one_off"); setDueDate(""); setDueTime("");
    setRrule(""); setEditReminder(null);
  };

  const openCreate = () => {
    resetForm();
    setShowCreate(true);
  };

  useEffect(() => {
    if (onRegisterCreate) {
      onRegisterCreate(openCreate);
      return () => onRegisterCreate(() => {});
    }
  }, [onRegisterCreate]);

  const openEdit = (rem: any) => {
    setEditReminder(rem);
    setTitle(rem.title);
    setScheduleType(rem.schedule_type);
    setDueDate(rem.due_at ? format(parseISO(rem.due_at), "yyyy-MM-dd") : "");
    setDueTime(rem.due_at ? format(parseISO(rem.due_at), "HH:mm") : "");
    setRrule(rem.rrule || "");
    setShowCreate(true);
  };

  const handleSave = async () => {
    const due_at = dueDate
      ? new Date(`${dueDate}T${dueTime || "09:00"}:00`).toISOString()
      : null;
    const data: any = {
      title,
      schedule_type: scheduleType,
      due_at,
      timezone: profile?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
    if (scheduleType === "recurring") data.rrule = rrule;
    if (editReminder) {
      await updateReminder(editReminder.id, data);
    } else {
      await createReminder(data);
    }
    setShowCreate(false);
    resetForm();
    load();
  };

  const handleSnooze = async (id: string, preset: "10m" | "1h" | "tomorrow") => {
    const now = new Date();
    let until: Date;
    if (preset === "10m") until = addMinutes(now, 10);
    else if (preset === "1h") until = addHours(now, 1);
    else {
      until = addDays(now, 1);
      until.setHours(9, 0, 0, 0);
    }
    await snoozeReminder(id, until.toISOString());
    load();
  };

  const handleDisable = async (id: string) => {
    await disableReminder(id);
    load();
  };

  const handleDelete = async (id: string) => {
    await deleteReminder(id);
    load();
  };

  const upcoming = reminders.filter((r) => r.is_enabled);
  const past = reminders.filter((r) => !r.is_enabled);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className={isEmbedded ? "px-3 sm:px-4 py-4" : "max-w-lg mx-auto px-3 sm:px-4 py-4"}>
      {!isEmbedded && (
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold">Reminders</h1>
          <button onClick={openCreate} className="flex items-center gap-1.5 px-3 py-1.5 glass-btn-primary rounded-xl text-sm font-medium min-h-[2.75rem]">
            <Plus className="w-4 h-4" /> New
          </button>
        </div>
      )}

      {reminders.length === 0 ? (
        <div className="text-center py-16">
          <Bell className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">No reminders yet</p>
          <button onClick={openCreate} className="text-primary text-sm font-medium mt-2 hover:underline">
            Create a reminder
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {upcoming.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                Active ({upcoming.length})
              </h3>
              <div className="space-y-2">
                {upcoming.map((rem) => (
                  <ReminderItem
                    key={rem.id}
                    reminder={rem}
                    tz={profile?.timezone || getDeviceTimezone()}
                    onEdit={() => openEdit(rem)}
                    onSnooze={(preset: any) => handleSnooze(rem.id, preset)}
                    onDisable={() => handleDisable(rem.id)}
                    onDelete={() => handleDelete(rem.id)}
                  />
                ))}
              </div>
            </div>
          )}
          {past.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                Disabled ({past.length})
              </h3>
              <div className="space-y-2">
                {past.map((rem) => (
                  <ReminderItem
                    key={rem.id}
                    reminder={rem}
                    tz={profile?.timezone || getDeviceTimezone()}
                    onEdit={() => openEdit(rem)}
                    onSnooze={(preset: any) => handleSnooze(rem.id, preset)}
                    onDisable={() => handleDisable(rem.id)}
                    onDelete={() => handleDelete(rem.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create/Edit Sheet */}
      {showCreate && (
        <div className="modal-overlay" onClick={() => { setShowCreate(false); resetForm(); }}>
          <div className="modal-sheet p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">{editReminder ? "Edit Reminder" : "New Reminder"}</h3>
              <button onClick={() => { setShowCreate(false); resetForm(); }} className="p-1 rounded hover:bg-muted">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Title *</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Remind me to..."
                  className="w-full px-3 py-2.5 rounded-lg border bg-input-background text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Type</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setScheduleType("one_off")}
                    className={`flex-1 py-2 rounded-lg text-xs font-medium border transition ${
                      scheduleType === "one_off" ? "bg-primary/10 border-primary text-primary" : "bg-muted/30 border-transparent text-muted-foreground"
                    }`}
                  >
                    One-off
                  </button>
                  <button
                    onClick={() => setScheduleType("recurring")}
                    className={`flex-1 py-2 rounded-lg text-xs font-medium border transition ${
                      scheduleType === "recurring" ? "bg-primary/10 border-primary text-primary" : "bg-muted/30 border-transparent text-muted-foreground"
                    }`}
                  >
                    Recurring
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Date</label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg border bg-input-background text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Time</label>
                  <input
                    type="time"
                    value={dueTime}
                    onChange={(e) => setDueTime(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg border bg-input-background text-sm"
                  />
                </div>
              </div>
              {scheduleType === "recurring" && (
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Recurrence (RRULE)</label>
                  <input
                    value={rrule}
                    onChange={(e) => setRrule(e.target.value)}
                    placeholder="FREQ=DAILY;INTERVAL=1"
                    className="w-full px-3 py-2.5 rounded-lg border bg-input-background text-sm"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">RFC 5545 format, e.g. FREQ=WEEKLY;BYDAY=MO,WE,FR</p>
                </div>
              )}
              <button
                onClick={handleSave}
                disabled={!title.trim()}
                className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {editReminder ? "Save changes" : "Create reminder"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ReminderItem({ reminder, tz, onEdit, onSnooze, onDisable, onDelete }: any) {
  const [showSnooze, setShowSnooze] = useState(false);

  return (
    <div className={`glass rounded-xl p-3 ${!reminder.is_enabled ? "opacity-60" : ""}`}>
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
          reminder.is_enabled ? "bg-primary/10" : "bg-muted"
        }`}>
          {reminder.is_enabled ? <Bell className="w-4 h-4 text-primary" /> : <BellOff className="w-4 h-4 text-muted-foreground" />}
        </div>
        <div className="flex-1 min-w-0" onClick={onEdit}>
          <p className="text-sm font-medium">{reminder.title}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {reminder.due_at && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" /> {formatDateInTz(reminder.due_at, tz, { includeTime: true })}
              </span>
            )}
            {reminder.snoozed_until && (
              <span className="text-xs text-amber-600 flex items-center gap-1">
                <AlarmClock className="w-3 h-3" /> Snoozed until {formatTimeInTz(reminder.snoozed_until, tz)}
              </span>
            )}
            <span className="text-[10px] px-1.5 py-0.5 bg-muted rounded-full text-muted-foreground capitalize">
              {reminder.schedule_type}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {reminder.due_at && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                downloadReminderIcs(
                  { id: reminder.id, title: reminder.title, due_at: reminder.due_at },
                  tz
                );
              }}
              className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition"
              title="Download .ics"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          )}
          {reminder.is_enabled && (
            <button
              onClick={() => setShowSnooze(!showSnooze)}
              className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition"
              title="Snooze"
            >
              <AlarmClock className="w-3.5 h-3.5" />
            </button>
          )}
          <button onClick={onDisable} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition" title={reminder.is_enabled ? "Disable" : "Enable"}>
            {reminder.is_enabled ? <BellOff className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
          </button>
          <button onClick={onDelete} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      {showSnooze && (
        <div className="mt-2 pt-2 border-t flex gap-2">
          {(["10m", "1h", "tomorrow"] as const).map((preset) => (
            <button
              key={preset}
              onClick={() => { onSnooze(preset); setShowSnooze(false); }}
              className="flex-1 py-1.5 text-xs font-medium bg-muted rounded-lg hover:bg-muted-foreground/10 transition"
            >
              {preset === "10m" ? "10 min" : preset === "1h" ? "1 hour" : "Tomorrow 9am"}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}