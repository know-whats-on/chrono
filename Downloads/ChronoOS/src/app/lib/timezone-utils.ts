// Device timezone detection and formatting utilities

export function getDeviceTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Format a UTC ISO string in the given IANA timezone.
 * Uses the browser's Intl API for correct DST handling.
 */
export function formatTimeInTz(isoStr: string, timezone: string): string {
  const d = new Date(isoStr);
  return d.toLocaleString("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function formatDateInTz(
  isoStr: string,
  timezone: string,
  opts?: { includeTime?: boolean; includeWeekday?: boolean; includeYear?: boolean }
): string {
  const d = new Date(isoStr);
  const options: Intl.DateTimeFormatOptions = {
    timeZone: timezone,
    month: "short",
    day: "numeric",
  };
  if (opts?.includeWeekday) options.weekday = "short";
  if (opts?.includeYear) options.year = "numeric";
  if (opts?.includeTime) {
    options.hour = "numeric";
    options.minute = "2-digit";
    options.hour12 = true;
  }
  return d.toLocaleString("en-US", options);
}

export function formatRangeInTz(startIso: string, endIso: string, timezone: string): string {
  const s = new Date(startIso);
  const e = new Date(endIso);
  const dateStr = s.toLocaleString("en-US", {
    timeZone: timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const startTime = s.toLocaleString("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const endTime = e.toLocaleString("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${dateStr}, ${startTime} \u2013 ${endTime}`;
}

/**
 * Check if the given ISO date is "today" in the specified timezone.
 */
export function isTodayInTz(isoStr: string, timezone: string): boolean {
  const now = new Date();
  const eventDate = new Date(isoStr);
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-CA", { timeZone: timezone }); // YYYY-MM-DD
  return fmt(now) === fmt(eventDate);
}

export function isTomorrowInTz(isoStr: string, timezone: string): boolean {
  const tomorrow = new Date(Date.now() + 86400000);
  const eventDate = new Date(isoStr);
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-CA", { timeZone: timezone });
  return fmt(tomorrow) === fmt(eventDate);
}

/**
 * Get date components in the specified timezone (for day grouping, etc.)
 */
export function getDateKeyInTz(isoStr: string, timezone: string): string {
  return new Date(isoStr).toLocaleDateString("en-CA", { timeZone: timezone }); // YYYY-MM-DD
}

/**
 * Get the hour + minutes of an ISO datetime in the given timezone (for calendar grid positioning)
 */
export function getLocalHourMinute(isoStr: string, timezone: string): { hour: number; minute: number } {
  const d = new Date(isoStr);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const hour = parseInt(parts.find((p) => p.type === "hour")?.value || "0") % 24;
  const minute = parseInt(parts.find((p) => p.type === "minute")?.value || "0");
  return { hour, minute };
}

/**
 * Get the day of week (0=Sun..6=Sat) of an ISO datetime in the given timezone
 */
export function getDayOfWeekInTz(isoStr: string, timezone: string): number {
  const d = new Date(isoStr);
  const weekday = d.toLocaleString("en-US", { timeZone: timezone, weekday: "short" });
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[weekday] ?? 0;
}

/**
 * Check if two ISO datetimes fall on the same calendar day in the given timezone
 */
export function isSameDayInTz(isoA: string, isoB: string, timezone: string): boolean {
  return getDateKeyInTz(isoA, timezone) === getDateKeyInTz(isoB, timezone);
}
