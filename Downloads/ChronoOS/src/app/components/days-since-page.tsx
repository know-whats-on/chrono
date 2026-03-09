import React, { useState, useEffect, useCallback } from "react";
import { getDaysSince, createDaysSince, updateDaysSince, resetDaysSince, deleteDaysSince } from "../lib/api";
import { Plus, X, RotateCcw, Trash2, Timer, Loader2, Edit2, Target, ArrowDown, ArrowUp } from "lucide-react";
import { differenceInDays, parseISO, format, isBefore, startOfDay } from "date-fns";

/** Convert raw day count to a friendlier unit when large enough */
function formatDuration(absDays: number): { value: number; unit: string } {
  const months = Math.round(absDays / 30.44);
  if (months > 12) {
    const years = +(absDays / 365.25).toFixed(1);
    // Drop the decimal if it's .0
    return { value: parseFloat(String(years)), unit: years === 1 ? "Year" : "Years" };
  }
  if (absDays > 31) {
    return { value: months, unit: months === 1 ? "Month" : "Months" };
  }
  return { value: absDays, unit: absDays === 1 ? "Day" : "Days" };
}

type TrackerType = "since" | "to";

export function DaysSincePage({ isEmbedded, onRegisterCreate }: { isEmbedded?: boolean; onRegisterCreate?: (fn: () => void) => void }) {
  const [trackers, setTrackers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editTracker, setEditTracker] = useState<any>(null);
  const [label, setLabel] = useState("");
  const [lastDate, setLastDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [targetDate, setTargetDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [trackerType, setTrackerType] = useState<TrackerType>("since");

  const load = useCallback(async () => {
    try {
      const t = await getDaysSince();
      setTrackers(t);
    } catch (e) {
      console.error("Failed to load trackers:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const resetForm = () => {
    setLabel("");
    setLastDate(format(new Date(), "yyyy-MM-dd"));
    setTargetDate(format(new Date(), "yyyy-MM-dd"));
    setTrackerType("since");
    setEditTracker(null);
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

  const openEdit = (t: any) => {
    setEditTracker(t);
    setLabel(t.label);
    setTrackerType(t.type || "since");
    if (t.type === "to") {
      setTargetDate(t.target_date || format(new Date(), "yyyy-MM-dd"));
    } else {
      setLastDate(t.last_date);
    }
    setShowCreate(true);
  };

  const handleSave = async () => {
    if (editTracker) {
      const data: any = { label, type: trackerType };
      if (trackerType === "to") {
        data.target_date = targetDate;
      } else {
        data.last_date = lastDate;
      }
      await updateDaysSince(editTracker.id, data);
    } else {
      const data: any = { label, type: trackerType };
      if (trackerType === "to") {
        data.target_date = targetDate;
        data.last_date = targetDate; // store as fallback
      } else {
        data.last_date = lastDate;
      }
      await createDaysSince(data);
    }
    setShowCreate(false);
    resetForm();
    load();
  };

  const handleReset = async (id: string) => {
    await resetDaysSince(id);
    load();
  };

  const handleDelete = async (id: string) => {
    await deleteDaysSince(id);
    load();
  };

  const sinceTrackers = trackers
    .filter(t => (t.type || "since") === "since")
    .sort((a, b) => {
      const daysA = differenceInDays(startOfDay(new Date()), startOfDay(parseISO(a.last_date)));
      const daysB = differenceInDays(startOfDay(new Date()), startOfDay(parseISO(b.last_date)));
      return Math.abs(daysB) - Math.abs(daysA); // biggest to lowest
    });
    
  const toTrackers = trackers
    .filter(t => t.type === "to")
    .sort((a, b) => {
      const daysA = differenceInDays(startOfDay(parseISO(a.target_date)), startOfDay(new Date()));
      const daysB = differenceInDays(startOfDay(parseISO(b.target_date)), startOfDay(new Date()));
      return Math.abs(daysA) - Math.abs(daysB); // smallest to biggest
    });

  const allEmpty = sinceTrackers.length === 0 && toTrackers.length === 0;

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
          <h1 className="text-xl font-semibold">Counters</h1>
          <button onClick={openCreate} className="flex items-center gap-1.5 px-3 py-1.5 glass-btn-primary rounded-xl text-sm font-medium min-h-[2.75rem]">
            <Plus className="w-4 h-4" /> New
          </button>
        </div>
      )}

      {allEmpty ? (
        <div className="text-center py-16">
          <Timer className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">No trackers yet</p>
          <button onClick={openCreate} className="text-primary text-sm font-medium mt-2 hover:underline">
            + Create a counter
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Days Since section */}
          {sinceTrackers.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">countdown from</p>
              <div className="grid grid-cols-2 gap-3">
                {sinceTrackers.map((t) => {
                  const days = differenceInDays(startOfDay(new Date()), startOfDay(parseISO(t.last_date)));
                  const { value, unit } = formatDuration(Math.abs(days));
                  return (
                    <div key={t.id} className="glass rounded-2xl p-4 relative group">
                      <div className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <ArrowUp className="w-3.5 h-3.5 text-muted-foreground/50" />
                          <p className="text-4xl font-bold tracking-tight">{value}</p>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 uppercase tracking-wider">{unit} ago</p>
                        <p className="text-sm font-medium mt-2 truncate">{t.label}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {format(parseISO(t.last_date), "MMM d, yyyy")}
                        </p>
                      </div>
                      <div className="flex items-center justify-center gap-1 mt-3">
                        <button onClick={() => handleReset(t.id)} className="p-1.5 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition" title="Reset to today">
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => openEdit(t)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition" title="Edit">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDelete(t.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition" title="Delete">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Days To section */}
          {toTrackers.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Countdown to</p>
              <div className="grid grid-cols-2 gap-3">
                {toTrackers.map((t) => {
                  const days = differenceInDays(startOfDay(parseISO(t.target_date)), startOfDay(new Date()));
                  const isPast = days < 0;
                  const { value, unit } = formatDuration(Math.abs(days));
                  return (
                    <div key={t.id} className={`glass rounded-2xl p-4 relative group ${isPast ? "border border-amber-400/30" : "border border-primary/20"}`}>
                      <div className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <ArrowDown className={`w-3.5 h-3.5 ${isPast ? "text-amber-500/50" : "text-primary/50"}`} />
                          <p className={`text-4xl font-bold tracking-tight ${isPast ? "text-amber-500" : "text-primary"}`}>{value}</p>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 uppercase tracking-wider">
                          {isPast ? `${unit} overdue` : days === 0 ? "today!" : `${unit} until`}
                        </p>
                        <p className="text-sm font-medium mt-2 truncate">{t.label}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {format(parseISO(t.target_date), "MMM d, yyyy")}
                        </p>
                        {/* Progress bar removed */}
                      </div>
                      <div className="flex items-center justify-center gap-1 mt-3">
                        <button onClick={() => openEdit(t)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition" title="Edit">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDelete(t.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition" title="Delete">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
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
              <h3 className="font-semibold">{editTracker ? "Edit Counter" : "New Counter"}</h3>
              <button onClick={() => { setShowCreate(false); resetForm(); }} className="p-1 rounded hover:bg-muted">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              {/* Type toggle */}
              <div className="flex p-1 bg-muted/40 rounded-xl">
                <button
                  onClick={() => setTrackerType("since")}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium rounded-lg transition-all ${
                    trackerType === "since"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground"
                  }`}
                >
                  <Timer className="w-3.5 h-3.5" />
                  Days Since
                </button>
                <button
                  onClick={() => setTrackerType("to")}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium rounded-lg transition-all ${
                    trackerType === "to"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground"
                  }`}
                >
                  <Target className="w-3.5 h-3.5" />
                  Days To
                </button>
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Label *</label>
                <input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder={trackerType === "since" ? "e.g. Last gym session" : "e.g. Summer vacation"}
                  className="w-full px-3 py-2.5 rounded-lg border bg-input-background text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  {trackerType === "since" ? "Last date" : "Target date"}
                </label>
                <input
                  type="date"
                  value={trackerType === "since" ? lastDate : targetDate}
                  onChange={(e) => trackerType === "since" ? setLastDate(e.target.value) : setTargetDate(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border bg-input-background text-sm"
                />
              </div>
              <button
                onClick={handleSave}
                disabled={!label.trim()}
                className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {editTracker ? "Save changes" : trackerType === "since" ? "Create tracker" : "Create countdown"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}