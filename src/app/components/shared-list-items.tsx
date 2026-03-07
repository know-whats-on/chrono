import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  Check, Trash2, Plus, Link2, ExternalLink, ShoppingCart,
  MapPin, Calendar, Hash, StickyNote, Loader2, Globe,
  ImageIcon, Clock, Package, Pencil, X, Save, Briefcase,
} from "lucide-react";
import { fetchLinkPreview } from "../lib/api";
import { ImageWithFallback } from "./figma/ImageWithFallback";

/* ═══════════════════════════════════════════════════════════════════
   Type definitions
   ══════════════════════════════════════════════════════════════════ */
  export type ListType = "todo" | "grocery" | "trip" | "project";

export const LIST_TYPE_META: Record<ListType, {
  label: string;
  icon: React.ReactNode;
  description: string;
  color: string;
  gradient: string;
}> = {
  todo: {
    label: "To-Do",
    icon: <Check className="w-4 h-4" />,
    description: "Tasks with optional due dates",
    color: "#5c3a20",
    gradient: "linear-gradient(135deg, rgba(92,58,32,0.15), rgba(122,82,52,0.1))",
  },
  grocery: {
    label: "Groceries",
    icon: <ShoppingCart className="w-4 h-4" />,
    description: "Items with links, quantity & notes",
    color: "#16a34a",
    gradient: "linear-gradient(135deg, rgba(22,163,74,0.12), rgba(74,222,128,0.08))",
  },
  trip: {
    label: "Trip Plan",
    icon: <MapPin className="w-4 h-4" />,
    description: "Places with links, dates & day numbers",
    color: "#7c3aed",
    gradient: "linear-gradient(135deg, rgba(124,58,237,0.12), rgba(167,139,250,0.08))",
  },
  project: {
    label: "Client Project",
    icon: <Briefcase className="w-4 h-4" />,
    description: "Tasks with allocated hours, create invoices",
    color: "#0ea5e9",
    gradient: "linear-gradient(135deg, rgba(14,165,233,0.12), rgba(56,189,248,0.08))",
  },
};

/* ═══════════════════════════════════════════════════════════════════
   Helper: compute anchor date from existing trip items
   Given items with day_number + date, find the "Day 1" start date.
   ═══════════════════════════════════════════════════════════════════ */
/** Format a local Date as YYYY-MM-DD without UTC shift */
function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getTripAnchorDate(items: any[]): string | null {
  for (const item of items) {
    if (item.day_number && item.date) {
      // Derive Day 1 date from this item's day_number and date
      const d = new Date(item.date + "T12:00:00"); // noon to avoid DST edge cases
      if (!isNaN(d.getTime())) {
        d.setDate(d.getDate() - (item.day_number - 1));
        return formatLocalDate(d);
      }
    }
  }
  return null;
}

function addDaysToDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00"); // noon to avoid DST edge cases
  d.setDate(d.getDate() + days);
  return formatLocalDate(d);
}

/* ═══════════════════════════════════════════════════════════════════
   Link Preview Card — fetches OG metadata and renders a rich card
   ═══════════════════════════════════════════════════════════════════ */
export function LinkPreviewCard({
  url,
  meta,
  compact,
}: {
  url: string;
  meta?: { title?: string; image?: string; domain?: string; description?: string; price?: string; currency?: string } | null;
  compact?: boolean;
}) {
  const domain = meta?.domain || (() => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } })();

  if (compact) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1.5 text-[11px] text-primary hover:underline truncate"
        onClick={(e) => e.stopPropagation()}
      >
        <Globe className="w-3 h-3 shrink-0" />
        <span className="truncate">{meta?.title || domain}</span>
        <ExternalLink className="w-2.5 h-2.5 shrink-0 opacity-50" />
      </a>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded-lg border border-border/50 overflow-hidden hover:border-border transition group mt-1.5"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex">
        {meta?.image && (
          <div className="w-20 h-20 shrink-0 bg-muted overflow-hidden">
            <ImageWithFallback
              src={meta.image}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </div>
        )}
        <div className="flex-1 min-w-0 p-2">
          <p className="text-xs font-medium truncate group-hover:text-primary transition">
            {meta?.title || domain}
          </p>
          {meta?.description && (
            <p className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5 leading-relaxed">
              {meta.description}
            </p>
          )}
          <div className="flex items-center gap-1.5 mt-1">
            <Globe className="w-2.5 h-2.5 text-muted-foreground" />
            <span className="text-[9px] text-muted-foreground truncate">{domain}</span>
            {meta?.price && (
              <span className="text-[10px] font-semibold text-emerald-600 ml-auto">
                {meta.currency === "AUD" ? "A$" : meta.currency ? `${meta.currency} ` : "$"}{meta.price}
              </span>
            )}
          </div>
        </div>
      </div>
    </a>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   useLinkPreview — hook for fetching link metadata with debounce
   ═══════════════════════════════════════════════════════════════════ */
export function useLinkPreview() {
  const [loading, setLoading] = useState(false);
  const [meta, setMeta] = useState<any>(null);
  const [url, setUrl] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<any>(null);

  const fetchPreview = useCallback((inputUrl: string) => {
    setUrl(inputUrl);
    setMeta(null);

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (abortRef.current) abortRef.current.abort();

    if (!inputUrl || !inputUrl.match(/^https?:\/\//)) {
      setLoading(false);
      return;
    }

    setLoading(true);
    timeoutRef.current = setTimeout(async () => {
      try {
        const data = await fetchLinkPreview(inputUrl);
        setMeta(data);
      } catch (e) {
        console.error("Link preview failed:", e);
        setMeta(null);
      } finally {
        setLoading(false);
      }
    }, 600);
  }, []);

  const clear = useCallback(() => {
    setUrl("");
    setMeta(null);
    setLoading(false);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  return { url, meta, loading, fetchPreview, clear };
}

/* ═══════════════════════════════════════════════════════════════════
   Type-aware Add Item Form
   ═══════════════════════════════════════════════════════════════════ */
export function AddItemForm({
  listType,
  listId,
  onAdd,
  existingItems,
}: {
  listType: ListType;
  listId: string;
  onAdd: (listId: string, data: any) => Promise<void>;
  existingItems?: any[];
}) {
  const [text, setText] = useState("");
  const [link, setLink] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");
  const [notes, setNotes] = useState("");
  const [dayNumber, setDayNumber] = useState("");
  const [date, setDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [allocatedHours, setAllocatedHours] = useState("");
  const [isMilestone, setIsMilestone] = useState(false);
  const [milestoneId, setMilestoneId] = useState("");
  const [showExtra, setShowExtra] = useState(false);
  const [adding, setAdding] = useState(false);
  const { meta, loading: previewLoading, fetchPreview, clear: clearPreview } = useLinkPreview();
  const textInputRef = useRef<HTMLInputElement>(null);

  // Trip auto-fill: compute anchor from existing items
  const anchorDate = listType === "trip" ? getTripAnchorDate(existingItems || []) : null;

  // Project milestones
  const milestones = listType === "project" ? (existingItems || []).filter((i: any) => i.is_milestone) : [];

  // Auto-fill: when day number changes, compute date from anchor
  const handleDayNumberChange = (val: string) => {
    setDayNumber(val);
    const dayNum = parseInt(val);
    if (listType === "trip" && anchorDate && dayNum > 0) {
      setDate(addDaysToDate(anchorDate, dayNum - 1));
    }
  };

  // Auto-fill: when date changes and day number is set (or derive day number)
  const handleDateChange = (val: string) => {
    setDate(val);
    if (listType === "trip" && val) {
      if (anchorDate) {
        // Derive day number from anchor
        const d1 = new Date(anchorDate + "T00:00:00");
        const d2 = new Date(val + "T00:00:00");
        const diff = Math.round((d2.getTime() - d1.getTime()) / 86400000) + 1;
        if (diff > 0) setDayNumber(String(diff));
      } else if (dayNumber) {
        // No anchor yet — this is essentially setting Day 1's date
        // Do nothing, but after add the anchor will be derived
      } else {
        // No anchor, no day number — default to Day 1
        setDayNumber("1");
      }
    }
  };

  // Next-day auto-suggest: when form is opened for trip, suggest next day
  useEffect(() => {
    if (listType === "trip" && showExtra && existingItems?.length) {
      const maxDay = Math.max(0, ...existingItems.map((i: any) => i.day_number || 0));
      if (maxDay > 0 && !dayNumber) {
        const nextDay = maxDay + 1;
        setDayNumber(String(nextDay));
        if (anchorDate) {
          setDate(addDaysToDate(anchorDate, nextDay - 1));
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showExtra]);

  // Commented out to enforce mandatory selection
  // useEffect(() => {
  //   if (listType === "project" && !isMilestone && !milestoneId && milestones.length > 0) {
  //     setMilestoneId(milestones[milestones.length - 1].id);
  //   }
  // }, [listType, isMilestone, milestoneId, milestones]);

  const handleLinkChange = (val: string) => {
    setLink(val);
    fetchPreview(val);
  };

  const handleAdd = async () => {
    const trimText = text.trim();
    const trimLink = link.trim();
    if (!trimText && !trimLink) return;

    const itemData: any = {
      text: trimText || meta?.title || (() => { try { return new URL(trimLink).hostname; } catch { return trimLink; } })(),
    };

    if (trimLink) {
      itemData.link = trimLink;
      if (meta) itemData.link_meta = meta;
    }

    if (listType === "grocery") {
      if (quantity) itemData.quantity = parseInt(quantity) || quantity;
      if (unit) itemData.unit = unit;
      if (notes.trim()) itemData.notes = notes.trim();
    }

    if (listType === "trip") {
      if (dayNumber) itemData.day_number = parseInt(dayNumber);
      if (date) itemData.date = date;
      if (notes.trim()) itemData.notes = notes.trim();
    }

    if (listType === "todo") {
      if (dueDate) itemData.due_date = dueDate;
      if (dueTime) itemData.due_time = dueTime;
    }

    if (listType === "project") {
      if (allocatedHours) itemData.allocated_hours = parseFloat(allocatedHours) || 0;
      if (dueDate) itemData.due_date = dueDate;
      if (notes.trim()) itemData.notes = notes.trim();
      itemData.is_milestone = isMilestone;
      if (milestoneId) itemData.milestone_id = milestoneId;
    }

    setAdding(true);
    try {
      await onAdd(listId, itemData);
      // Reset text + link but keep trip day/date context for rapid sequential adds
      setText(""); setLink(""); setQuantity(""); setUnit("");
      setNotes("");
      clearPreview();
      if (listType === "trip") {
        // Auto-increment day number for next add
        const nextDayNum = dayNumber ? parseInt(dayNumber) + 1 : "";
        setDayNumber(nextDayNum ? String(nextDayNum) : "");
        if (nextDayNum && anchorDate) {
          setDate(addDaysToDate(anchorDate, nextDayNum - 1));
        } else if (nextDayNum && date) {
          // Use current date as reference to compute next
          setDate(addDaysToDate(date, 1));
        } else {
          setDate("");
        }
      } else {
        setDayNumber(""); setDate("");
        setDueDate(""); setDueTime("");
        setAllocatedHours("");
        setIsMilestone(false);
        setMilestoneId("");
        setShowExtra(false);
      }
      // Refocus the text input for rapid entry
      textInputRef.current?.focus();
    } finally {
      setAdding(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (canAdd) handleAdd();
    }
  };

  const hasContent = !!(text.trim() || link.trim());
  let canAdd = false;
  if (hasContent) {
    if (listType === "project" && !isMilestone) {
      canAdd = !!milestoneId;
    } else {
      canAdd = true;
    }
  }

  return (
    <div className="mt-3 mb-2 space-y-2">
      {/* Project Task vs Milestone toggle */}
      {listType === "project" && (
        <div className="flex bg-muted/30 p-1 rounded-lg">
          <button
            onClick={() => { setIsMilestone(false); setShowExtra(true); }}
            className={`flex-1 text-xs font-medium py-1.5 rounded-md transition ${!isMilestone ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Add Task
          </button>
          <button
            onClick={() => { setIsMilestone(true); setShowExtra(true); setMilestoneId(""); }}
            className={`flex-1 text-xs font-medium py-1.5 rounded-md transition ${isMilestone ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Add Milestone
          </button>
        </div>
      )}

      {/* Primary input row */}
      <div className="flex gap-2">
        <input
          ref={textInputRef}
          type="text"
          placeholder={
            listType === "grocery" ? "Item name (e.g. Avocados)" :
            listType === "trip" ? "Place name (e.g. Bondi Beach)" :
            listType === "project" ? (isMilestone ? "Milestone name..." : "Task name...") :
            "Add a task..."
          }
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 px-3 py-2 rounded-lg border bg-input-background text-sm"
        />
        <button
          onClick={handleAdd}
          disabled={!canAdd || adding}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition disabled:opacity-40"
          style={{
            background: canAdd && !adding
              ? "linear-gradient(135deg, #5c3a20, #7a5234)"
              : "#d1ccc5",
            color: canAdd && !adding ? "#fff" : "#8a8478",
          }}
        >
          {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          Add
        </button>
      </div>

      {/* Mandatory Milestone Selection for Project Tasks */}
      {listType === "project" && !isMilestone && (
        <div className="pt-1">
          {milestones.length > 0 ? (
            <select
              value={milestoneId}
              onChange={(e) => setMilestoneId(e.target.value)}
              className="w-full py-1.5 px-2 rounded-lg border bg-input-background text-xs text-foreground focus:ring-1 focus:ring-primary/30 outline-none"
            >
              <option value="" disabled>Select Milestone (Required)</option>
              {milestones.map((m: any) => (
                <option key={m.id} value={m.id}>{m.text}</option>
              ))}
            </select>
          ) : (
            <div className="text-xs text-destructive p-2 bg-destructive/10 rounded-lg">
              Please create a milestone first to add tasks.
            </div>
          )}
        </div>
      )}

      {/* Link input — always visible as a small row */}
      <div className="relative">
        <Link2 className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input
          type="url"
          placeholder="Paste a link (optional)"
          value={link}
          onChange={(e) => handleLinkChange(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full pl-8 pr-3 py-1.5 rounded-lg border bg-input-background text-xs text-muted-foreground focus:text-foreground transition"
        />
        {previewLoading && (
          <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 animate-spin text-muted-foreground" />
        )}
      </div>

      {/* Link preview */}
      {meta && link && (
        <LinkPreviewCard url={link} meta={meta} />
      )}

      {/* Toggle extra fields */}
      {!showExtra ? (
        <button
          onClick={() => setShowExtra(true)}
          className="text-[10px] text-muted-foreground hover:text-foreground transition flex items-center gap-1"
        >
          <Plus className="w-2.5 h-2.5" />
          {listType === "todo" ? "Add due date/time" :
           listType === "grocery" ? "Add quantity/notes" :
           listType === "project" ? (isMilestone ? "Add due date/notes" : "Add hours/due date/notes/milestone") :
           "Add day/date/notes"}
        </button>
      ) : (
        <div className="space-y-2 pl-1">
          {/* To-Do extras */}
          {listType === "todo" && (
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="w-full pl-7 pr-2 py-1.5 rounded-lg border bg-input-background text-xs"
                />
              </div>
              <div className="relative flex-1">
                <Clock className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                <input
                  type="time"
                  value={dueTime}
                  onChange={(e) => setDueTime(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="w-full pl-7 pr-2 py-1.5 rounded-lg border bg-input-background text-xs"
                />
              </div>
            </div>
          )}

          {/* Grocery extras */}
          {listType === "grocery" && (
            <>
              <div className="flex gap-2">
                <div className="relative w-20">
                  <Hash className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                  <input
                    type="number"
                    placeholder="Qty"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    onKeyDown={handleKeyDown}
                    min={1}
                    className="w-full pl-7 pr-2 py-1.5 rounded-lg border bg-input-background text-xs"
                  />
                </div>
                <div className="relative flex-1">
                  <Package className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                  <select
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    className="w-full pl-7 pr-2 py-1.5 rounded-lg border bg-input-background text-xs appearance-none"
                  >
                    <option value="">Unit</option>
                    <option value="pcs">pcs</option>
                    <option value="kg">kg</option>
                    <option value="g">g</option>
                    <option value="L">L</option>
                    <option value="mL">mL</option>
                    <option value="pack">pack</option>
                    <option value="dozen">dozen</option>
                    <option value="bunch">bunch</option>
                    <option value="bottle">bottle</option>
                    <option value="can">can</option>
                    <option value="box">box</option>
                    <option value="bag">bag</option>
                    <option value="loaf">loaf</option>
                  </select>
                </div>
              </div>
              <div className="relative">
                <StickyNote className="absolute left-2 top-2 w-3 h-3 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Notes (e.g. organic, brand preference)"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="w-full pl-7 pr-2 py-1.5 rounded-lg border bg-input-background text-xs"
                />
              </div>
            </>
          )}

          {/* Project extras */}
          {listType === "project" && (
            <div className="space-y-2">
              <div className="flex gap-2">
                {!isMilestone && (
                  <div className="relative w-24">
                    <Clock className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                    <input
                      type="number"
                      placeholder="Hours"
                      value={allocatedHours}
                      onChange={(e) => setAllocatedHours(e.target.value)}
                      onKeyDown={handleKeyDown}
                      step="0.5"
                      min="0"
                      className="w-full pl-7 pr-2 py-1.5 rounded-lg border bg-input-background text-xs"
                    />
                  </div>
                )}
                <div className="relative flex-1">
                  <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="w-full pl-7 pr-2 py-1.5 rounded-lg border bg-input-background text-xs"
                  />
                </div>
              </div>
              <div className="relative">
                <StickyNote className="absolute left-2 top-2 w-3 h-3 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Notes (e.g. description, requirements)"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="w-full pl-7 pr-2 py-1.5 rounded-lg border bg-input-background text-xs"
                />
              </div>
            </div>
          )}

          {/* Trip extras */}
          {listType === "trip" && (
            <>
              <div className="flex gap-2">
                <div className="relative w-20">
                  <Hash className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                  <input
                    type="number"
                    placeholder="Day #"
                    value={dayNumber}
                    onChange={(e) => handleDayNumberChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    min={1}
                    className="w-full pl-7 pr-2 py-1.5 rounded-lg border bg-input-background text-xs"
                  />
                </div>
                <div className="relative flex-1">
                  <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => handleDateChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="w-full pl-7 pr-2 py-1.5 rounded-lg border bg-input-background text-xs"
                  />
                </div>
              </div>
              {anchorDate && (
                <p className="text-[9px] text-muted-foreground pl-1">
                  Trip starts {anchorDate} · Day {dayNumber || "?"} = {date || "..."}
                </p>
              )}
              <div className="relative">
                <StickyNote className="absolute left-2 top-2 w-3 h-3 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Notes (e.g. must-try dish, booking info)"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="w-full pl-7 pr-2 py-1.5 rounded-lg border bg-input-background text-xs"
                />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Type-aware List Item — renders differently per list type
   Now supports inline editing via onEdit callback.
   ═══════════════════════════════════════════════════════════════════ */
export function SharedListItem({
  item,
  listType,
  listId,
  onToggle,
  onDelete,
  onEdit,
  existingItems,
}: {
  item: any;
  listType: ListType;
  listId: string;
  onToggle: () => void;
  onDelete: () => void;
  onEdit?: (data: any) => Promise<void>;
  existingItems?: any[];
}) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [editLink, setEditLink] = useState("");
  const [editQuantity, setEditQuantity] = useState("");
  const [editUnit, setEditUnit] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editDayNumber, setEditDayNumber] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editDueTime, setEditDueTime] = useState("");
  const [editAllocatedHours, setEditAllocatedHours] = useState("");
  const [editIsMilestone, setEditIsMilestone] = useState(false);
  const [editMilestoneId, setEditMilestoneId] = useState("");
  const [saving, setSaving] = useState(false);

  const startEdit = () => {
    setEditText(item.text || "");
    setEditLink(item.link || "");
    setEditQuantity(item.quantity != null ? String(item.quantity) : "");
    setEditUnit(item.unit || "");
    setEditNotes(item.notes || "");
    setEditDayNumber(item.day_number != null ? String(item.day_number) : "");
    setEditDate(item.date || "");
    setEditDueDate(item.due_date || "");
    setEditDueTime(item.due_time || "");
    setEditAllocatedHours(item.allocated_hours != null ? String(item.allocated_hours) : "");
    setEditIsMilestone(item.is_milestone || false);
    setEditMilestoneId(item.milestone_id || "");
    setEditing(true);
  };

  const cancelEdit = () => setEditing(false);

  let canSave = !!editText.trim();
  if (canSave && listType === "project" && !editIsMilestone) {
    canSave = !!editMilestoneId;
  }

  const saveEdit = async () => {
    if (!onEdit || !canSave) return;
    const data: any = { text: editText.trim() };
    data.link = editLink.trim() || "";
    if (listType === "grocery") {
      data.quantity = editQuantity ? parseInt(editQuantity) || editQuantity : "";
      data.unit = editUnit;
      data.notes = editNotes.trim();
    }
    if (listType === "trip") {
      data.day_number = editDayNumber ? parseInt(editDayNumber) : "";
      data.date = editDate;
      data.notes = editNotes.trim();
    }
    if (listType === "todo") {
      data.due_date = editDueDate;
      data.due_time = editDueTime;
    }
    if (listType === "project") {
      data.allocated_hours = editAllocatedHours ? parseFloat(editAllocatedHours) : 0;
      data.due_date = editDueDate;
      data.notes = editNotes.trim();
      data.is_milestone = editIsMilestone;
      data.milestone_id = editMilestoneId;
    }
    setSaving(true);
    try {
      await onEdit(data);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (canSave) saveEdit(); }
    if (e.key === "Escape") cancelEdit();
  };

  const hasLink = !!item.link;
  const hasMeta = !!item.link_meta;

  // ── Edit mode ──
  if (editing) {
    return (
      <div className="rounded-lg bg-muted/30 p-2.5 space-y-2 border border-primary/20">
        <input
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onKeyDown={handleEditKeyDown}
          autoFocus
          className="w-full px-2.5 py-1.5 rounded-lg border bg-input-background text-sm"
          placeholder="Item name"
        />
        <div className="relative">
          <Link2 className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
          <input
            value={editLink}
            onChange={(e) => setEditLink(e.target.value)}
            onKeyDown={handleEditKeyDown}
            className="w-full pl-7 pr-2 py-1.5 rounded-lg border bg-input-background text-xs"
            placeholder="Link (optional)"
          />
        </div>

        {listType === "todo" && (
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
              <input type="date" value={editDueDate} onChange={(e) => setEditDueDate(e.target.value)} onKeyDown={handleEditKeyDown} className="w-full pl-7 pr-2 py-1.5 rounded-lg border bg-input-background text-xs" />
            </div>
            <div className="relative flex-1">
              <Clock className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
              <input type="time" value={editDueTime} onChange={(e) => setEditDueTime(e.target.value)} onKeyDown={handleEditKeyDown} className="w-full pl-7 pr-2 py-1.5 rounded-lg border bg-input-background text-xs" />
            </div>
          </div>
        )}

        {listType === "grocery" && (
          <div className="flex gap-2">
            <input type="number" value={editQuantity} onChange={(e) => setEditQuantity(e.target.value)} onKeyDown={handleEditKeyDown} placeholder="Qty" min={1} className="w-16 px-2 py-1.5 rounded-lg border bg-input-background text-xs" />
            <select value={editUnit} onChange={(e) => setEditUnit(e.target.value)} className="flex-1 px-2 py-1.5 rounded-lg border bg-input-background text-xs appearance-none">
              <option value="">Unit</option>
              {["pcs","kg","g","L","mL","pack","dozen","bunch","bottle","can","box","bag","loaf"].map(u => <option key={u} value={u}>{u}</option>)}
            </select>
            <input value={editNotes} onChange={(e) => setEditNotes(e.target.value)} onKeyDown={handleEditKeyDown} placeholder="Notes" className="flex-1 px-2 py-1.5 rounded-lg border bg-input-background text-xs" />
          </div>
        )}

        {listType === "trip" && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <input type="number" value={editDayNumber} onChange={(e) => setEditDayNumber(e.target.value)} onKeyDown={handleEditKeyDown} placeholder="Day #" min={1} className="w-16 px-2 py-1.5 rounded-lg border bg-input-background text-xs" />
              <div className="relative flex-1">
                <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                <input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} onKeyDown={handleEditKeyDown} className="w-full pl-7 pr-2 py-1.5 rounded-lg border bg-input-background text-xs" />
              </div>
            </div>
            <input value={editNotes} onChange={(e) => setEditNotes(e.target.value)} onKeyDown={handleEditKeyDown} placeholder="Notes" className="w-full px-2 py-1.5 rounded-lg border bg-input-background text-xs" />
          </div>
        )}

        {listType === "project" && (
          <div className="space-y-2">
            <div className="flex gap-2">
              {!editIsMilestone && (
                <div className="relative w-24">
                  <Clock className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                  <input type="number" value={editAllocatedHours} onChange={(e) => setEditAllocatedHours(e.target.value)} onKeyDown={handleEditKeyDown} placeholder="Hrs" step="0.5" min={0} className="w-full pl-7 pr-2 py-1.5 rounded-lg border bg-input-background text-xs" />
                </div>
              )}
              <div className="relative flex-1">
                <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                <input type="date" value={editDueDate} onChange={(e) => setEditDueDate(e.target.value)} onKeyDown={handleEditKeyDown} className="w-full pl-7 pr-2 py-1.5 rounded-lg border bg-input-background text-xs" />
              </div>
            </div>
            <input value={editNotes} onChange={(e) => setEditNotes(e.target.value)} onKeyDown={handleEditKeyDown} placeholder="Notes" className="w-full px-2 py-1.5 rounded-lg border bg-input-background text-xs" />
            <div className="flex items-center gap-3 px-1 pt-1">
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={editIsMilestone}
                  onChange={(e) => {
                    setEditIsMilestone(e.target.checked);
                    if (e.target.checked) setEditMilestoneId("");
                  }}
                  className="rounded border-input-background"
                />
                Is Milestone
              </label>
              {!editIsMilestone && (
                <div className="flex-1">
                  {(existingItems || []).filter((i: any) => i.is_milestone && i.id !== item.id).length > 0 ? (
                    <select
                      value={editMilestoneId}
                      onChange={(e) => setEditMilestoneId(e.target.value)}
                      className="w-full py-1.5 px-2 rounded-lg border bg-input-background text-xs text-foreground"
                    >
                      <option value="" disabled>Select Milestone (Required)</option>
                      {(existingItems || []).filter((i: any) => i.is_milestone && i.id !== item.id).map((m: any) => (
                        <option key={m.id} value={m.id}>{m.text}</option>
                      ))}
                    </select>
                  ) : (
                    <div className="text-[10px] text-destructive px-2 py-1.5 bg-destructive/10 rounded-lg">
                      Create a milestone first.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}


        <div className="flex justify-end gap-1.5">
          <button onClick={cancelEdit} className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg border text-muted-foreground hover:bg-muted transition">
            <X className="w-3 h-3" /> Cancel
          </button>
          <button
            onClick={saveEdit}
            disabled={saving || !canSave}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg text-white transition disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #5c3a20, #7a5234)" }}
          >
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            Save
          </button>
        </div>
      </div>
    );
  }

  // ── Normal display ──
  return (
    <div
      className={`rounded-lg group transition ${
        item.completed ? "opacity-55" : ""
      } ${hasLink && hasMeta ? "bg-muted/20 p-2" : "py-1.5 px-1"}`}
    >
      <div className="flex items-start gap-2.5">
        {/* Checkbox */}
        <button
          onClick={onToggle}
          className={`mt-0.5 w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition ${
            item.completed
              ? "bg-emerald-500 border-emerald-500 text-white"
              : "border-muted-foreground/30 hover:border-primary"
          }`}
        >
          {item.completed && <Check className="w-3 h-3" />}
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Title row */}
          <div className="flex items-center gap-1.5">
            <p className={`text-sm font-medium ${item.completed ? "line-through text-muted-foreground" : ""}`}>
              {item.text}
            </p>
          </div>

          {/* Type-specific metadata badges */}
          <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
            {/* Grocery: quantity + unit */}
            {listType === "grocery" && item.quantity && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-emerald-500/10 text-emerald-700 text-[9px] font-semibold rounded-full">
                {item.quantity}{item.unit ? ` ${item.unit}` : ""}
              </span>
            )}

            {/* Trip: day number */}
            {listType === "trip" && item.day_number && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-violet-500/10 text-violet-700 text-[9px] font-semibold rounded-full">
                Day {item.day_number}
              </span>
            )}

            {/* Project: milestone and allocated hours */}
            {listType === "project" && (
              <>
                {item.is_milestone && (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-sky-500/10 text-sky-700 text-[9px] font-semibold rounded-full uppercase tracking-wider">
                    <Briefcase className="w-2.5 h-2.5" />
                    Milestone
                  </span>
                )}
                {!item.is_milestone && item.milestone_id && existingItems && (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-muted/50 text-muted-foreground text-[9px] font-semibold rounded-full">
                    {existingItems.find(i => i.id === item.milestone_id)?.text || "Unknown Milestone"}
                  </span>
                )}
                {item.allocated_hours > 0 && (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-sky-500/10 text-sky-700 text-[9px] font-semibold rounded-full">
                    <Clock className="w-2.5 h-2.5" />
                    {item.allocated_hours}h
                  </span>
                )}
              </>
            )}

            {/* Trip / Todo: date */}
            {(item.date || item.due_date) && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-blue-500/10 text-blue-700 text-[9px] font-medium rounded-full">
                <Calendar className="w-2.5 h-2.5" />
                {item.date || item.due_date}
                {item.due_time && ` ${item.due_time}`}
              </span>
            )}

            {/* Creator attribution */}
            <span className="text-[10px] text-muted-foreground">
              {item.created_by}
              {item.completed && item.completed_by && (
                <> · <span className="text-emerald-600">done by {item.completed_by}</span></>
              )}
            </span>
          </div>

          {/* Notes */}
          {item.notes && (
            <p className="text-[10px] text-muted-foreground mt-0.5 italic">
              <StickyNote className="w-2.5 h-2.5 inline mr-0.5 -mt-0.5" />
              {item.notes}
            </p>
          )}

          {/* Link preview card */}
          {hasLink && hasMeta && item.link_meta?.image ? (
            <LinkPreviewCard url={item.link} meta={item.link_meta} />
          ) : hasLink ? (
            <LinkPreviewCard url={item.link} meta={item.link_meta} compact />
          ) : null}
        </div>

        {/* Edit + Delete */}
        <div className="flex items-center gap-0.5 shrink-0 opacity-100 transition">
          {onEdit && !item.completed && (
            <button
              onClick={startEdit}
              className="mt-0.5 p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-primary transition"
              title="Edit item"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={onDelete}
            className="mt-0.5 p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition"
            title="Delete item"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   List Type Selector — used in the create list form
   ═══════════════════════════════════════════════════════════════════ */
export function ListTypeSelector({
  value,
  onChange,
}: {
  value: ListType;
  onChange: (type: ListType) => void;
}) {
  const types: ListType[] = ["todo", "grocery", "trip", "project"];

  return (
    <div>
      <label className="text-xs text-muted-foreground mb-2 block">What type of list?</label>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {types.map((type) => {
          const m = LIST_TYPE_META[type];
          const selected = value === type;
          return (
            <button
              key={type}
              type="button"
              onClick={() => onChange(type)}
              className={`relative w-full flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all cursor-pointer ${
                selected
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "border-border/50 hover:border-border hover:bg-muted/30"
              }`}
            >
              <span
                className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: m.gradient, color: m.color }}
              >
                {m.icon}
              </span>
              <span className={`text-xs font-semibold ${selected ? "text-primary" : "text-foreground"}`}>
                {m.label}
              </span>
              <span className="text-[9px] text-muted-foreground text-center leading-tight">
                {m.description}
              </span>
              {selected && (
                <span
                  className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full flex items-center justify-center"
                  style={{ background: m.color }}
                >
                  <Check className="w-2.5 h-2.5 text-white" />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}