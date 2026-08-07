/**
 * Weekly-availability timezone conversion.
 * Rules are stored in UTC (weekday 0–6 + minutes from midnight); tutors edit
 * them in their own timezone. Conversion uses the zone's *current* offset —
 * an accepted v1 approximation for recurring weekly rules (SPEC §5).
 */

const WEEK_MINUTES = 7 * 1440;

/** Offset of `timeZone` vs UTC right now, in minutes (east = positive). */
export function tzOffsetMinutes(timeZone) {
  try {
    const now = new Date();
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    const parts = Object.fromEntries(
      dtf.formatToParts(now).map((p) => [p.type, p.value])
    );
    const asUTC = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      parts.hour === "24" ? 0 : Number(parts.hour),
      Number(parts.minute)
    );
    return Math.round((asUTC - now.getTime()) / 60000);
  } catch {
    return 0;
  }
}

function splitAbsolute(startAbs, endAbs) {
  // Normalize into [0, WEEK) and split a window into per-weekday chunks.
  let a = ((startAbs % WEEK_MINUTES) + WEEK_MINUTES) % WEEK_MINUTES;
  const length = endAbs - startAbs;
  const chunks = [];
  let remaining = length;
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

/**
 * Local weekly windows → UTC rules (split across UTC midnight as needed).
 * windows: [{ weekday, startMinute, endMinute }] in the tutor's local time.
 */
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

/** UTC rules → local weekly windows for display/editing. */
export function utcWeeklyToLocal(rules, timeZone) {
  const offset = tzOffsetMinutes(timeZone);
  const windows = [];
  for (const rule of rules) {
    const startAbs = rule.weekday * 1440 + rule.startMinuteUTC + offset;
    const endAbs = rule.weekday * 1440 + rule.endMinuteUTC + offset;
    for (const chunk of splitAbsolute(startAbs, endAbs)) {
      windows.push({
        weekday: chunk.weekday,
        startMinute: chunk.startMinute,
        endMinute: chunk.endMinute,
      });
    }
  }
  // Merge windows that were split across midnight and are contiguous locally.
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
