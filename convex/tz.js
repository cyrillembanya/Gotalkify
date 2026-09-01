/**
 * Timezone core — shared by the Convex backend and the Next.js client
 * (`lib/tz.js` re-exports this module).
 *
 * Everything the app stores is an absolute instant (UTC ms). These helpers
 * convert between an instant and the wall-clock time of an IANA zone, and they
 * always resolve the offset *at the instant in question* — never from "now" —
 * so results stay correct across DST changes.
 */

export const UTC = "UTC";

const FORMAT_CACHE = new Map();

function partsFormatter(timeZone) {
  let formatter = FORMAT_CACHE.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    FORMAT_CACHE.set(timeZone, formatter);
  }
  return formatter;
}

/** True when the runtime knows this IANA zone (guards user-supplied values). */
export function isValidTimeZone(timeZone) {
  if (!timeZone || typeof timeZone !== "string") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(0);
    return true;
  } catch {
    return false;
  }
}

/** Falls back to UTC for missing or unknown zones, so callers never throw. */
export function safeZone(timeZone) {
  return isValidTimeZone(timeZone) ? timeZone : UTC;
}

/**
 * Wall-clock breakdown of an instant in `timeZone`.
 * Returns { year, month (1-12), day, hour, minute, second, weekday (0=Sun),
 * minutesOfDay, dateString "YYYY-MM-DD" }.
 */
export function zonedParts(utcMs, timeZone) {
  const zone = safeZone(timeZone);
  let parts;
  try {
    parts = Object.fromEntries(
      partsFormatter(zone)
        .formatToParts(new Date(utcMs))
        .map((part) => [part.type, part.value])
    );
  } catch {
    const d = new Date(utcMs);
    parts = {
      year: String(d.getUTCFullYear()),
      month: String(d.getUTCMonth() + 1),
      day: String(d.getUTCDate()),
      hour: String(d.getUTCHours()),
      minute: String(d.getUTCMinutes()),
      second: String(d.getUTCSeconds()),
    };
  }
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  // Some runtimes report midnight as hour 24 with hourCycle h23 edge cases.
  const hour = Number(parts.hour) % 24;
  const minute = Number(parts.minute);
  const second = Number(parts.second ?? 0);
  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
    minutesOfDay: hour * 60 + minute,
    dateString: `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
  };
}

/** Offset of `timeZone` from UTC at a given instant, in minutes (east = +). */
export function tzOffsetMinutes(timeZone, atMs = Date.now()) {
  const parts = zonedParts(atMs, timeZone);
  const asUTC = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );
  // Compare whole seconds: formatToParts has no sub-second resolution.
  return Math.round((asUTC - Math.floor(atMs / 1000) * 1000) / 60000);
}

/**
 * Wall-clock time in `timeZone` → the instant it refers to (UTC ms).
 *
 * The offset is resolved twice: the first pass guesses with the offset at the
 * naive instant, the second corrects it when that guess landed on the other
 * side of a DST transition. A wall time inside a spring-forward gap never
 * happens locally; like Luxon and date-fns-tz, it is shifted forward by the
 * length of the gap (02:30 on a "lose an hour" night means 03:30).
 */
export function utcFromZoned(
  { year, month, day, minutesOfDay = 0, second = 0 },
  timeZone
) {
  const naive =
    Date.UTC(year, month - 1, day, 0, 0, second) + minutesOfDay * 60000;
  const firstGuess = naive - tzOffsetMinutes(timeZone, naive) * 60000;
  const refined = naive - tzOffsetMinutes(timeZone, firstGuess) * 60000;
  return refined;
}

/** "YYYY-MM-DD" → the instant that local day starts in `timeZone`. */
export function startOfZonedDay(dateString, timeZone) {
  const [year, month, day] = String(dateString).split("-").map(Number);
  return utcFromZoned({ year, month, day, minutesOfDay: 0 }, timeZone);
}

/** Local calendar date ("YYYY-MM-DD") of an instant in `timeZone`. */
export function zonedDateString(utcMs, timeZone) {
  return zonedParts(utcMs, timeZone).dateString;
}

/** Weekday (0=Sun) of a "YYYY-MM-DD" date string. */
export function weekdayOfDate(dateString) {
  const { year, month, day } = splitDate(dateString);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** Shift a "YYYY-MM-DD" date string by whole days (calendar arithmetic). */
export function addDays(dateString, days) {
  const [year, month, day] = String(dateString).split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

/**
 * Same wall-clock time, `weeks` weeks later in `timeZone`.
 * Recurring lessons keep their local hour across a DST change instead of
 * silently moving by an hour, which is what both sides expect from
 * "every Tuesday at 18:00".
 */
export function sameLocalTimeWeeksLater(utcMs, timeZone, weeks) {
  const parts = zonedParts(utcMs, timeZone);
  return utcFromZoned(
    {
      ...parts,
      ...splitDate(addDays(parts.dateString, weeks * 7)),
      minutesOfDay: parts.minutesOfDay,
      second: 0,
    },
    timeZone
  );
}

function splitDate(dateString) {
  const [year, month, day] = String(dateString).split("-").map(Number);
  return { year, month, day };
}

/** Short zone name at an instant — "CEST", "GMT+5:30". */
export function zoneAbbreviation(timeZone, atMs = Date.now()) {
  const zone = safeZone(timeZone);
  try {
    const part = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      timeZoneName: "short",
    })
      .formatToParts(new Date(atMs))
      .find((p) => p.type === "timeZoneName");
    if (part?.value) return part.value;
  } catch {
    /* fall through */
  }
  return offsetLabel(zone, atMs);
}

/** "UTC+2", "UTC−5:30", "UTC" — always available, even without ICU data. */
export function offsetLabel(timeZone, atMs = Date.now()) {
  const offset = tzOffsetMinutes(timeZone, atMs);
  if (offset === 0) return "UTC";
  const sign = offset > 0 ? "+" : "−";
  const abs = Math.abs(offset);
  const hours = Math.floor(abs / 60);
  const minutes = abs % 60;
  return `UTC${sign}${hours}${minutes ? `:${String(minutes).padStart(2, "0")}` : ""}`;
}

/** "Europe/Paris" → "Europe/Paris (CEST, UTC+2)" for headers and captions. */
export function zoneLabel(timeZone, atMs = Date.now()) {
  const zone = safeZone(timeZone);
  const name = zone.replace(/_/g, " ");
  const abbr = zoneAbbreviation(zone, atMs);
  const offset = offsetLabel(zone, atMs);
  return abbr && abbr !== offset ? `${name} (${abbr}, ${offset})` : `${name} (${offset})`;
}

/**
 * Minute-of-day → instant mapper for one local day in `timeZone`.
 *
 * Resolving every slot separately through Intl is correct but costs two
 * formatted lookups each, which adds up over a 6-month booking horizon. On the
 * ~363 days a year without a DST transition the day is a straight offset from
 * its own midnight, so the two boundary conversions here cover the whole day;
 * transition days fall back to exact per-time conversion.
 */
export function zonedDayMapper(dateString, timeZone) {
  const date = splitDate(dateString);
  const start = utcFromZoned({ ...date, minutesOfDay: 0 }, timeZone);
  const end = utcFromZoned({ ...date, minutesOfDay: 1440 }, timeZone);
  if (end - start === 1440 * 60000) return (minutes) => start + minutes * 60000;
  return (minutes) => utcFromZoned({ ...date, minutesOfDay: minutes }, timeZone);
}

/* ------------------------------------------------------------------ *
 * Legacy conversion (pre-local-storage availability rows)
 *
 * Rules used to be stored as UTC weekday + minutes, converted with the zone's
 * offset at save time. Reading them back needs the same approximation; new
 * rows are stored in the tutor's local wall time and don't go through this.
 * ------------------------------------------------------------------ */

const WEEK_MINUTES = 7 * 1440;

function splitAbsolute(startAbs, endAbs) {
  let a = ((startAbs % WEEK_MINUTES) + WEEK_MINUTES) % WEEK_MINUTES;
  const chunks = [];
  let remaining = endAbs - startAbs;
  while (remaining > 0) {
    const weekday = Math.floor(a / 1440);
    const startMinute = a % 1440;
    const chunk = Math.min(remaining, 1440 - startMinute);
    chunks.push({ weekday, startMinute, endMinute: startMinute + chunk });
    a = (a + chunk) % WEEK_MINUTES;
    remaining -= chunk;
  }
  return chunks;
}

/** Legacy UTC weekly rules → local weekly windows (current-offset approximation). */
export function utcWeeklyToLocal(rules, timeZone) {
  const offset = tzOffsetMinutes(timeZone);
  const windows = [];
  for (const rule of rules) {
    const startAbs = rule.weekday * 1440 + rule.startMinuteUTC + offset;
    const endAbs = rule.weekday * 1440 + rule.endMinuteUTC + offset;
    for (const chunk of splitAbsolute(startAbs, endAbs)) windows.push(chunk);
  }
  windows.sort((a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute);
  const merged = [];
  for (const w of windows) {
    const prev = merged[merged.length - 1];
    if (prev && prev.weekday === w.weekday && prev.endMinute === w.startMinute) {
      prev.endMinute = w.endMinute;
    } else {
      merged.push({ ...w });
    }
  }
  return merged;
}

/** Local weekly windows → legacy UTC rules. Kept for the data migration only. */
export function localWeeklyToUTC(windows, timeZone) {
  const offset = tzOffsetMinutes(timeZone);
  const rules = [];
  for (const w of windows) {
    const startAbs = w.weekday * 1440 + w.startMinute - offset;
    const endAbs = w.weekday * 1440 + w.endMinute - offset;
    for (const chunk of splitAbsolute(startAbs, endAbs)) {
      rules.push({
        weekday: chunk.weekday,
        startMinuteUTC: chunk.startMinute,
        endMinuteUTC: chunk.endMinute,
      });
    }
  }
  return rules;
}
