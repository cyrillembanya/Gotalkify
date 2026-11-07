/**
 * Client-side formatting helpers.
 *
 * Every lesson time is stored as a UTC instant; nothing is ever displayed in
 * UTC by accident. Each of these takes the *viewer's* timezone — pass the one
 * from `useViewerTimezone()` (or `me.timezone`), so the same lesson reads
 * 3:00 PM for a student in the US and 9:00 PM for one in Paris.
 */

import { safeZone, zoneAbbreviation, zoneLabel } from "@/lib/tz";

export function fmtMoney(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

function format(ms, timezone, parts, { locale = "en", withZone = false } = {}) {
  const zone = safeZone(timezone);
  try {
    const text = new Intl.DateTimeFormat(locale, { timeZone: zone, ...parts }).format(
      new Date(ms)
    );
    return withZone ? `${text} ${zoneAbbreviation(zone, ms)}` : text;
  } catch {
    return new Date(ms).toUTCString();
  }
}

/** "Wed, 12 Mar 2026, 09:00" in `timezone`. `withZone` appends "CET". */
export function fmtDateTime(ms, timezone, options) {
  return format(
    ms,
    timezone,
    {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    },
    options
  );
}

export function fmtDate(ms, timezone, options) {
  return format(
    ms,
    timezone,
    { weekday: "short", day: "numeric", month: "short", year: "numeric" },
    options
  );
}

export function fmtTime(ms, timezone, options) {
  return format(ms, timezone, { hour: "2-digit", minute: "2-digit" }, options);
}

/** "Wed 12 Mar" — column headings in the slot picker. */
export function fmtDayLabel(ms, timezone, options) {
  return format(ms, timezone, { weekday: "short", day: "numeric", month: "short" }, options);
}

/** Detected browser timezone, falling back to UTC. */
export function browserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export { zoneAbbreviation, zoneLabel };

/** Common IANA timezones for the dashboard selector. */
export const TIMEZONES = [
  "UTC",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Lisbon",
  "Europe/Athens",
  "Europe/Moscow",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Vancouver",
  "America/Mexico_City",
  "America/Bogota",
  "America/Sao_Paulo",
  "America/Argentina/Buenos_Aires",
  "Africa/Casablanca",
  "Africa/Lagos",
  "Africa/Cairo",
  "Africa/Nairobi",
  "Africa/Johannesburg",
  "Asia/Dubai",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Dhaka",
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Hong_Kong",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Australia/Sydney",
  "Australia/Perth",
  "Pacific/Auckland",
];

/** Weekday names index 0–6 (Sunday first, matches Date.getUTCDay). */
export const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function minutesToHHMM(minutes) {
  const h = String(Math.floor(minutes / 60)).padStart(2, "0");
  const m = String(minutes % 60).padStart(2, "0");
  return `${h}:${m}`;
}
