import React, { useEffect, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { X, CalendarDays, Clock, MapPin, AlignLeft, CheckCircle, Ban, Globe, ChevronDown, ChevronUp, Download, Repeat, Pencil, Trash2, ExternalLink, Video } from "lucide-react";
import { getEventDetails } from "../lib/api";
import { formatTimeInTz, formatDateInTz, getDeviceTimezone } from "../lib/timezone-utils";
import { formatEventDescription } from "../lib/event-description-formatter";
import { downloadEventIcs } from "../lib/ics-export";

interface EventDetailsModalProps {
  eventId: string | null;
  onClose: () => void;
  userTimezone?: string;
  onEdit?: (event: any) => void;
  onDelete?: (eventId: string, mode: "single" | "all" | "normal") => void;
  /** Outlook email addresses saved in Settings → Outlook Quick-Switch */
  outlookAccounts?: string[];
  /** Gmail / Google Workspace addresses saved in Settings → Gmail Quick-Switch */
  gmailAccounts?: string[];
}

interface EventDetails {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  status: string;
  isBusy: boolean;
  provider: string;
  calendarName: string;
  location: string | null;
  description: string | null;
}

export function EventDetailsModal({ eventId, onClose, userTimezone, onEdit, onDelete, outlookAccounts = [], gmailAccounts = [] }: EventDetailsModalProps) {
  const [event, setEvent] = useState<EventDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<"idle" | "confirm" | "recurring">("idle");

  const tz = userTimezone || getDeviceTimezone();

  // Parse description when event changes
  const { text: formattedDesc, meta: descMeta } = useMemo(() => event?.description
    ? formatEventDescription(event.description)
    : { text: "", meta: {} as Record<string, string> }, [event?.description]);

  // Extract meeting join link from raw description + location
  const meetingJoinUrl = useMemo(
    () => extractMeetingLink(event?.description ?? null, event?.location ?? null),
    [event?.description, event?.location]
  );

  useEffect(() => {
    if (eventId) {
      setDescriptionExpanded(false);
      setDeleteConfirm("idle");
      setLoading(true);
      setError(null);
      getEventDetails(eventId)
        .then((data) => {
          setEvent(data);
          setLoading(false);
        })
        .catch((err) => {
          console.error("Failed to load event details:", err);
          setError("Failed to load event details");
          setLoading(false);
        });
    } else {
      setEvent(null);
    }
  }, [eventId]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Description content
  // Split logic: 
  // 1. If meta exists, it's rendered separately.
  // 2. If text exists, render it.
  const metaEntries = Object.entries(descMeta);
  const hasMeta = metaEntries.length > 0;
  const hasDesc = !!formattedDesc;
  const shouldTruncate = hasDesc && (formattedDesc.length > 300 || formattedDesc.split("\n").length > 8);
  const showFullDesc = descriptionExpanded || !shouldTruncate;

  // Simple linkifier with safety
  function linkify(text: string) {
    if (!text) return "";
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.replace(urlRegex, (url) => {
      const cleanUrl = url.replace(/[.,;:]$/, "");
      return `<a href="${cleanUrl}" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">${cleanUrl}</a>`;
    });
  }

  // Extract a video conferencing join link from description + location text
  function extractMeetingLink(description: string | null, location: string | null): string | null {
    const text = `${description || ""} ${location || ""}`;
    const patterns = [
      /https:\/\/teams\.microsoft\.com\/l\/meetup-join\/[^\s<>"]+/,
      /https:\/\/teams\.microsoft\.com\/meet\/[^\s<>"]+/,
      /https:\/\/[a-z0-9-]+\.zoom\.us\/j\/[^\s<>"]+/,
      /https:\/\/meet\.google\.com\/[a-z0-9-]+/,
      /https:\/\/[a-z0-9-]+\.webex\.com\/meet\/[^\s<>"]+/,
      /https:\/\/whereby\.com\/[^\s<>"]+/,
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return match[0].replace(/[.,;>)]$/, "");
    }
    return null;
  }

  function meetingLinkLabel(url: string): { label: string; color: string } {
    if (url.includes("teams.microsoft.com")) return { label: "Join Teams Meeting", color: "#6264A7" };
    if (url.includes("zoom.us")) return { label: "Join Zoom Meeting", color: "#2D8CFF" };
    if (url.includes("meet.google.com")) return { label: "Join Google Meet", color: "#00897B" };
    if (url.includes("webex.com")) return { label: "Join Webex", color: "#00A0D1" };
    return { label: "Join Meeting", color: "#6264A7" };
  }

  return createPortal(
    <AnimatePresence>
      {eventId && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 z-[60] backdrop-blur-sm"
          />
          
          {/* Modal / Bottom Sheet */}
          <motion.div
            key="modal"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed inset-x-0 bottom-0 z-[70] bg-background border-t border-border rounded-t-3xl shadow-2xl max-h-[85vh] flex flex-col md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-md md:rounded-2xl md:border md:h-auto"
            style={{ 
              // Reset transform for desktop centering which conflicts with motion
              // We'll handle desktop centering via classNames and let motion handle 'y' for mobile slide up
              // actually for desktop we might want a fade/scale? 
              // simpler to keep slide up for now as "mobile first"
            }}
          >
            {/* Handle for mobile swipe (visual only for now) */}
            <div className="w-full flex justify-center pt-3 pb-1 md:hidden" onClick={onClose}>
              <div className="w-12 h-1.5 bg-muted rounded-full" />
            </div>

            {/* Header */}
            <div className="px-5 py-3 flex items-start justify-between border-b border-border/40 md:border-b-0 md:pt-5">
              <div className="flex-1 pr-4">
                 {/* Title placeholder while loading */}
                 {loading ? (
                   <div className="h-6 w-3/4 bg-muted animate-pulse rounded" />
                 ) : (
                   <h2 className="text-xl font-semibold leading-tight text-foreground">
                     {event?.title || "Event Details"}
                   </h2>
                 )}
              </div>
              <button
                onClick={onClose}
                className="p-2 -mr-2 text-muted-foreground hover:bg-muted rounded-full transition"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-5 pb-8 space-y-6">
              {loading ? (
                <div className="space-y-4 py-4">
                  <div className="h-4 w-1/2 bg-muted animate-pulse rounded" />
                  <div className="h-20 w-full bg-muted animate-pulse rounded-xl" />
                  <div className="h-4 w-1/3 bg-muted animate-pulse rounded" />
                </div>
              ) : error ? (
                <div className="py-8 text-center text-muted-foreground">
                  <p>{error}</p>
                </div>
              ) : event ? (
                <>
                  {/* Status Badge */}
                  {event.status === "cancelled" && (
                     <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-destructive/10 text-destructive text-xs font-medium">
                       <Ban className="w-3.5 h-3.5" /> Cancelled
                     </div>
                  )}

                  {/* Date & Time */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-foreground font-medium">
                      <Clock className="w-4 h-4 text-primary" />
                      {event.allDay ? (
                        <span>
                          {formatDateInTz(event.startAt, tz, { includeWeekday: true, includeYear: true })}
                          <span className="text-muted-foreground font-normal ml-2">All-day</span>
                        </span>
                      ) : (
                        <span>
                          {formatDateInTz(event.startAt, tz, { includeWeekday: true })}
                          <span className="mx-1.5 text-muted-foreground">•</span>
                          {formatTimeInTz(event.startAt, tz)} – {formatTimeInTz(event.endAt, tz)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground pl-6">
                      <Globe className="w-3 h-3" />
                      Timezone: {tz}
                    </div>
                    {(event as any).recurrence_rule && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground pl-6">
                        <Repeat className="w-3 h-3" />
                        Repeats {(event as any).recurrence_rule.frequency}
                        {(event as any).recurrence_rule.end_date && ` until ${formatDateInTz((event as any).recurrence_rule.end_date + "T00:00:00Z", tz)}`}
                      </div>
                    )}
                  </div>

                  {/* Metadata Grid */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-muted/30 rounded-xl border border-border/50">
                      <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1.5">
                        <CalendarDays className="w-3.5 h-3.5" /> Source
                      </div>
                      <div className="text-sm font-medium truncate" title={event.calendarName}>
                        {event.calendarName}
                      </div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">
                        {event.provider}
                      </div>
                    </div>

                    <div className="p-3 bg-muted/30 rounded-xl border border-border/50">
                      <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1.5">
                        <CheckCircle className="w-3.5 h-3.5" /> Availability
                      </div>
                      <div className="text-sm font-medium">
                        {event.isBusy ? "Busy" : "Free"}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {event.isBusy ? "Blocks time" : "Doesn't block"}
                      </div>
                    </div>
                  </div>

                  {/* Location */}
                  {event.location && (
                    <div className="flex gap-3">
                      <MapPin className="w-5 h-5 text-muted-foreground shrink-0" />
                      <div>
                        <h3 className="text-sm font-medium text-foreground">Location</h3>
                        <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">
                          {event.location}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Description & Meta */}
                  {(hasDesc || hasMeta) && (
                    <div className="flex gap-3">
                      <AlignLeft className="w-5 h-5 text-muted-foreground shrink-0" />
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-medium text-foreground">Description</h3>
                        
                        {hasMeta && (
                          <div className="bg-muted/30 rounded-lg p-2.5 mb-2 space-y-1.5 text-sm border border-border/50">
                            {metaEntries
                              .filter(([key]) => {
                                // Don't show "Where" in meta if we already show Location separately
                                if (key.toLowerCase() === "where" && event?.location) return false;
                                return true;
                              })
                              .map(([key, val]) => (
                              <div key={key} className="flex gap-2">
                                <span className="text-muted-foreground font-medium shrink-0 w-16 text-xs uppercase tracking-wider mt-0.5">{key}:</span>
                                <span className="text-foreground break-words min-w-0 flex-1 text-[13px]">
                                  {(key.toLowerCase() === "to" || key.toLowerCase() === "cc" || key.toLowerCase() === "from")
                                    ? val.split(/;\s*/).map((name, i, arr) => (
                                        <span key={i}>
                                          {name.trim()}{i < arr.length - 1 ? "; " : ""}
                                        </span>
                                      ))
                                    : val
                                  }
                                </span>
                              </div>
                            ))}
                          </div>
                        )}

                        {hasDesc && (
                          <div className="mt-1">
                            <div 
                              className={`text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap break-words transition-all duration-300 ${!showFullDesc ? "max-h-[160px] overflow-hidden [mask-image:linear-gradient(to_bottom,black_60%,transparent)]" : ""}`}
                              dangerouslySetInnerHTML={{ __html: linkify(formattedDesc) }}
                            />
                            {shouldTruncate && (
                              <button 
                                onClick={() => setDescriptionExpanded(!descriptionExpanded)}
                                className="text-xs text-primary font-medium hover:underline mt-2 flex items-center gap-1"
                              >
                                {descriptionExpanded ? (
                                  <>Show less <ChevronUp className="w-3 h-3" /></>
                                ) : (
                                  <>Show more <ChevronDown className="w-3 h-3" /></>
                                )}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Download ICS */}
                  <div className="flex gap-3">
                    <Download className="w-5 h-5 text-muted-foreground shrink-0" />
                    <div>
                      <h3 className="text-sm font-medium text-foreground">Export</h3>
                      <button
                        onClick={() => downloadEventIcs(event, tz)}
                        className="mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted/50 border border-border/50 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download .ics
                      </button>
                    </div>
                  </div>

                  {/* Open in Outlook Web + Join Meeting */}
                  <div className="flex gap-3">
                    <ExternalLink className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
                    <div>
                      <h3 className="text-sm font-medium text-foreground">Open externally</h3>
                      <div className="flex flex-wrap gap-2 mt-1.5">

                        {/* No accounts configured → single generic button */}
                        {outlookAccounts.length === 0 && (
                          <a
                            href={`https://outlook.office.com/calendar/view/day/${event.startAt.slice(0, 10)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition hover:opacity-80"
                            style={{ background: "rgba(0,120,212,0.08)", border: "1px solid rgba(0,120,212,0.25)", color: "#0078D4" }}
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            Open in Outlook Web
                          </a>
                        )}

                        {/* One button per saved Outlook account, with login_hint */}
                        {outlookAccounts.map((email) => (
                          <a
                            key={email}
                            href={`https://outlook.office.com/calendar/view/day/${event.startAt.slice(0, 10)}?login_hint=${encodeURIComponent(email)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={`Open Outlook Web as ${email}`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition hover:opacity-80 max-w-[220px]"
                            style={{ background: "rgba(0,120,212,0.08)", border: "1px solid rgba(0,120,212,0.25)", color: "#0078D4" }}
                          >
                            <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">{email}</span>
                          </a>
                        ))}

                        {/* No Gmail accounts configured → single generic button */}
                        {gmailAccounts.length === 0 && (() => {
                          const d = new Date(event.startAt);
                          return (
                            <a
                              href={`https://calendar.google.com/calendar/r/day/${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition hover:opacity-80"
                              style={{ background: "rgba(234,67,53,0.08)", border: "1px solid rgba(234,67,53,0.25)", color: "#EA4335" }}
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              Open in Google Calendar
                            </a>
                          );
                        })()}

                        {/* One button per saved Gmail account, with authuser */}
                        {gmailAccounts.map((email) => {
                          const d = new Date(event.startAt);
                          return (
                            <a
                              key={email}
                              href={`https://calendar.google.com/calendar/r/day/${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}?authuser=${encodeURIComponent(email)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={`Open Google Calendar as ${email}`}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition hover:opacity-80 max-w-[220px]"
                              style={{ background: "rgba(234,67,53,0.08)", border: "1px solid rgba(234,67,53,0.25)", color: "#EA4335" }}
                            >
                              <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate">{email}</span>
                            </a>
                          );
                        })}

                        {/* Join meeting button — shown only when a video link is detected */}
                        {meetingJoinUrl && (() => {
                          const { label, color } = meetingLinkLabel(meetingJoinUrl);
                          return (
                            <a
                              href={meetingJoinUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition hover:opacity-80"
                              style={{ background: `${color}14`, border: `1px solid ${color}40`, color }}
                            >
                              <Video className="w-3.5 h-3.5" />
                              {label}
                            </a>
                          );
                        })()}
                      </div>

                      {/* Contextual hint */}
                      {(outlookAccounts.length > 0 || gmailAccounts.length > 0) ? (
                        <p className="text-[11px] text-muted-foreground mt-1.5 leading-snug">
                          Each button opens the calendar as that account on this event's day — find it there to accept or decline.
                        </p>
                      ) : (
                        <div className="mt-1.5 space-y-0.5">
                          <p className="text-[11px] text-muted-foreground leading-snug">
                            Opens the web calendar on this event's day — find it there to accept or decline.
                          </p>
                          <p className="text-[11px] leading-snug" style={{ color: "#6b7280" }}>
                            Tip: add your email accounts in Settings → Calendar Connections for per-account quick-switch buttons.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Edit Button */}
                  {onEdit && event.provider !== "ics" && event.provider !== "caldav" && (
                    <div className="flex gap-3">
                      <Pencil className="w-5 h-5 text-muted-foreground shrink-0" />
                      <div>
                        <h3 className="text-sm font-medium text-foreground">Edit</h3>
                        <button
                          onClick={() => onEdit(event)}
                          className="mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted/50 border border-border/50 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          Edit Event
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Delete Button */}
                  {onDelete && event.provider !== "ics" && event.provider !== "caldav" && (() => {
                    const isRecurring = !!(
                      (event as any).recurrence_rule || (event as any).recurring_event_id
                    );

                    return (
                      <div className="flex gap-3">
                        <Trash2 className="w-5 h-5 text-muted-foreground shrink-0" />
                        <div className="flex-1">
                          <h3 className="text-sm font-medium text-foreground">Delete</h3>

                          {deleteConfirm === "idle" && (
                            <button
                              onClick={() => {
                                if (isRecurring) {
                                  setDeleteConfirm("recurring");
                                } else {
                                  setDeleteConfirm("confirm");
                                }
                              }}
                              className="mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted/50 border border-border/50 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Delete Event
                            </button>
                          )}

                          {/* Simple confirm for non-recurring */}
                          {deleteConfirm === "confirm" && (
                            <div className="mt-2 p-3 rounded-xl bg-destructive/5 border border-destructive/20 space-y-2.5">
                              <p className="text-sm text-muted-foreground">
                                Are you sure you want to delete <span className="font-medium text-foreground">{event.title}</span>?
                              </p>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => setDeleteConfirm("idle")}
                                  className="flex-1 py-2 rounded-lg bg-muted hover:bg-muted/80 text-sm font-medium transition"
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={() => {
                                    onDelete(event.id, "normal");
                                    onClose();
                                  }}
                                  className="flex-1 py-2 rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 text-sm font-medium transition"
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Recurring event choices */}
                          {deleteConfirm === "recurring" && (
                            <div className="mt-2 p-3 rounded-xl bg-destructive/5 border border-destructive/20 space-y-2.5">
                              <p className="text-sm text-muted-foreground">
                                <span className="font-medium text-foreground">{event.title}</span> is part of a recurring series. What would you like to delete?
                              </p>
                              <div className="space-y-2">
                                <button
                                  onClick={() => {
                                    onDelete(event.id, "single");
                                    onClose();
                                  }}
                                  className="w-full py-2.5 rounded-lg bg-muted hover:bg-muted/80 text-sm font-medium transition text-left px-3"
                                >
                                  This event only
                                </button>
                                <button
                                  onClick={() => {
                                    onDelete(event.id, "all");
                                    onClose();
                                  }}
                                  className="w-full py-2.5 rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 text-sm font-medium transition text-left px-3"
                                >
                                  All events in series
                                </button>
                                <button
                                  onClick={() => setDeleteConfirm("idle")}
                                  className="w-full py-2 text-sm text-muted-foreground hover:text-foreground transition text-center"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </>
              ) : null}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}