/**
 * Client-side timezone helpers.
 *
 * The implementation lives in `convex/tz.js` so the backend (slot generation,
 * emails) and the browser share exactly one set of conversion rules — a slot
 * must mean the same instant on both sides.
 */

export {
  UTC,
  isValidTimeZone,
  safeZone,
  zonedParts,
  tzOffsetMinutes,
  utcFromZoned,
  startOfZonedDay,
  zonedDateString,
  addDays,
  weekdayOfDate,
  sameLocalTimeWeeksLater,
  zoneAbbreviation,
  offsetLabel,
  zoneLabel,
  zonedDayMapper,
} from "@/convex/tz";
