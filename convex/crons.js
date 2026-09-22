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

// Give lessons booked before the built-in classroom existed a room token.
crons.interval(
  "backfill classroom links",
  { minutes: 30 },
  internal.video.backfillRoomIdsTick
);

// Drop undelivered WebRTC signalling and long-dead room presence rows.
crons.interval("sweep classroom signalling", { minutes: 5 }, internal.video.sweepTick);

// Write the built-in chat-safety keyword list on a fresh deployment. No-ops
// once seeded, so admin edits to the list are never undone.
crons.interval("seed chat safety keywords", { hours: 6 }, internal.moderation.seedTick);

// Sign-ups that never entered their email code free the address up again.
crons.interval("sweep unverified sign-ups", { hours: 6 }, internal.signup.sweepUnverifiedTick);

export default crons;
