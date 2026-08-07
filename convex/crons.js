import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// scheduled → completed once end time passes; prompts the student to confirm.
crons.interval(
  "mark completed lessons",
  { minutes: 10 },
  internal.lessons.markCompletedTick
);

// Auto-confirm + release escrow 72h (configurable) after end time.
crons.interval(
  "auto-confirm lessons",
  { minutes: 15 },
  internal.lessons.autoConfirmTick
);

// 24h and 1h lesson reminders.
crons.interval(
  "lesson reminders",
  { minutes: 10 },
  internal.lessons.reminderTick
);

export default crons;
