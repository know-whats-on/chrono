/**
 * ICS (iCalendar) file generator — RFC 5545 compliant.
 *
 * Generates .ics content for Events and Reminders and triggers
 * a browser download. Works client-side with no server round-trip.
 *
 * Timezone: Uses the user's IANA timezone for DTSTART/DTEND with TZID.
 * DTSTAMP is always UTC.
 */

// ── RFC 5545 text escaping ─────────────────────────────────────

function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

// ── Line folding (75-octet limit) ──────────────────────────────

function foldLine(line: string): string {
  // RFC 5545 §3.1: lines SHOULD be no longer than 75 octets (bytes).
  // Continuation lines start with a single space.
  const encoder = new TextEncoder();
  const bytes = encoder.encode(line);
  if (bytes.length <= 75) return line;

  const parts: string[] = [];
  let start = 0;

  while (start < line.length) {
    // First line gets 75 bytes; continuation lines get 74 (75 minus the leading space)
    const maxBytes = start === 0 ? 75 : 74;
    let end = start;
    let byteCount = 0;

    while (end < line.length) {
      const charBytes = encoder.encode(line[end]).length;
      if (byteCount + charBytes > maxBytes) break;
      byteCount += charBytes;
      end++;
    }

    if (end === start) {
      // Single char wider than limit (shouldn't happen with UTF-8, but safety)
      end = start + 1;
    }

    parts.push((start > 0 ? " " : "") + line.slice(start, end));
    start = end;
  }

  return parts.join("\r\n");
}

function icsLines(lines: string[]): string {
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

// ── Date formatting ────────────────────────────────────────────

/** Format a Date-like ISO string to ICS local datetime: YYYYMMDDTHHmmss */
function toIcsLocalDateTime(isoStr: string, timezone: string): string {
  const d = new Date(isoStr);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);

  const get = (type: string) => parts.find((p) => p.type === type)?.value || "00";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}${get("month")}${get("day")}T${hour}${get("minute")}${get("second")}`;
}

/** Format current UTC time as DTSTAMP: YYYYMMDDTHHmmssZ */
function nowUtcStamp(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

/** Format a date-only string (YYYY-MM-DD) for all-day events: YYYYMMDD */
function toIcsDate(isoStr: string): string {
  // Handle both "2026-03-15" and "2026-03-15T00:00:00Z"
  const dateStr = isoStr.slice(0, 10).replace(/-/g, "");
  return dateStr;
}

/** Get the next day in YYYYMMDD for all-day DTEND (RFC 5545 requires exclusive end) */
function nextDay(isoStr: string): string {
  const d = new Date(isoStr.slice(0, 10) + "T12:00:00Z"); // noon to avoid DST edge
  d.setUTCDate(d.getUTCDate() + 1);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
}

// ── Filename helpers ───────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "event";
}

function makeFilename(title: string | undefined, isoDate: string, fallback: string): string {
  const slug = title ? slugify(title) : fallback;
  const dateStr = isoDate.slice(0, 10).replace(/-/g, "");
  return `${slug}-${dateStr}.ics`;
}

// ── Download trigger ───────────────────────────────────────────

export function downloadIcsFile(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  // iOS Safari: try share sheet first if available
  if (
    typeof navigator !== "undefined" &&
    navigator.share &&
    /iPhone|iPad|iPod/i.test(navigator.userAgent)
  ) {
    const file = new File([blob], filename, { type: "text/calendar" });
    navigator
      .share({ files: [file] })
      .catch(() => {
        // Fallback to standard download if share fails
        triggerDownload(url, filename);
      });
    return;
  }

  triggerDownload(url, filename);
}

function triggerDownload(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();

  // Cleanup
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

// ── Event → ICS ────────────────────────────────────────────────

export interface IcsEventInput {
  id: string;
  title: string;
  startAt: string;   // ISO
  endAt: string;     // ISO
  allDay?: boolean;
  status?: string;    // "confirmed" | "cancelled"
  isBusy?: boolean;
  location?: string | null;
  description?: string | null;
}

export function generateEventIcs(event: IcsEventInput, timezone: string): string {
  const uid = `${event.id}@tracktion.app`;
  const stamp = nowUtcStamp();

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Tracktion//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
  ];

  // Date/time
  if (event.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${toIcsDate(event.startAt)}`);
    lines.push(`DTEND;VALUE=DATE:${nextDay(event.endAt)}`);
  } else {
    lines.push(`DTSTART;TZID=${timezone}:${toIcsLocalDateTime(event.startAt, timezone)}`);
    lines.push(`DTEND;TZID=${timezone}:${toIcsLocalDateTime(event.endAt, timezone)}`);
  }

  // Summary (title)
  lines.push(`SUMMARY:${escapeIcsText(event.title)}`);

  // Description
  if (event.description) {
    lines.push(`DESCRIPTION:${escapeIcsText(event.description)}`);
  }

  // Location
  if (event.location) {
    lines.push(`LOCATION:${escapeIcsText(event.location)}`);
  }

  // Status
  if (event.status === "cancelled") {
    lines.push("STATUS:CANCELLED");
  } else {
    lines.push("STATUS:CONFIRMED");
  }

  // Transparency
  lines.push(event.isBusy !== false ? "TRANSP:OPAQUE" : "TRANSP:TRANSPARENT");

  lines.push("END:VEVENT");
  lines.push("END:VCALENDAR");

  return icsLines(lines);
}

export function downloadEventIcs(event: IcsEventInput, timezone: string) {
  const content = generateEventIcs(event, timezone);
  const filename = makeFilename(event.title, event.startAt, "tracktion-event");
  downloadIcsFile(content, filename);
}

// ── Reminder → ICS ─────────────────────────────────────────────

export interface IcsReminderInput {
  id: string;
  title: string;
  due_at: string;           // ISO
  notes?: string | null;
  durationMinutes?: number; // default 15
}

export function generateReminderIcs(reminder: IcsReminderInput, timezone: string): string {
  const uid = `${reminder.id}@tracktion.app`;
  const stamp = nowUtcStamp();
  const duration = reminder.durationMinutes || 15;

  const startIso = reminder.due_at;
  const endDate = new Date(new Date(startIso).getTime() + duration * 60 * 1000);
  const endIso = endDate.toISOString();

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Tracktion//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART;TZID=${timezone}:${toIcsLocalDateTime(startIso, timezone)}`,
    `DTEND;TZID=${timezone}:${toIcsLocalDateTime(endIso, timezone)}`,
    `SUMMARY:${escapeIcsText(reminder.title)}`,
  ];

  if (reminder.notes) {
    lines.push(`DESCRIPTION:${escapeIcsText(reminder.notes)}`);
  }

  // Reminders don't block time
  lines.push("TRANSP:TRANSPARENT");
  lines.push("STATUS:CONFIRMED");

  // Add an alarm/notification at the event time
  lines.push("BEGIN:VALARM");
  lines.push("TRIGGER:PT0M");
  lines.push("ACTION:DISPLAY");
  lines.push(`DESCRIPTION:${escapeIcsText(reminder.title)}`);
  lines.push("END:VALARM");

  lines.push("END:VEVENT");
  lines.push("END:VCALENDAR");

  return icsLines(lines);
}

export function downloadReminderIcs(reminder: IcsReminderInput, timezone: string) {
  const content = generateReminderIcs(reminder, timezone);
  const filename = makeFilename(reminder.title, reminder.due_at, "tracktion-reminder");
  downloadIcsFile(content, filename);
}
