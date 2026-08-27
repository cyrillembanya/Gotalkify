/**
 * GoTalkify Classroom — the built-in video conferencing backend.
 *
 * There is no media server: the tutor and the student connect to each other
 * directly over WebRTC. Convex is used purely as the *signalling* channel —
 * offers, answers and ICE candidates are rows in `videoSignals` that the
 * addressee receives through a reactive query, and presence is a heartbeat
 * on `videoParticipants`. Because nothing is centralised, an unlimited
 * number of classes can run at the same time.
 *
 * Access control: the room is addressed by an unguessable 128-bit token
 * (`lessons.roomId`) *and* the caller must be signed in as the lesson's
 * student, its tutor, or an admin. Knowing the link alone is never enough.
 */

import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { currentUser, requireUser, newRoomId } from "./lib";

/* ---------------------------------- policy ---------------------------------- */

/** The room opens this long before the lesson starts… */
export const JOIN_OPENS_BEFORE_MS = 15 * 60 * 1000;
/** …and closes this long after it ends. */
export const JOIN_CLOSES_AFTER_MS = 60 * 60 * 1000;

/** A peer that has not sent a heartbeat within this window is treated as gone. */
export const PEER_TTL_MS = 30 * 1000;

/** Statuses whose lesson still has a usable room (a lesson auto-flips to
 *  "completed" ten minutes after it ends, often while people are still talking). */
const JOINABLE_STATUSES = ["scheduled", "completed", "confirmed"];

const MAX_PEERS_PER_ROOM = 8; // mesh topology — plenty for 1:1 plus reconnects
const MAX_PAYLOAD_CHARS = 128 * 1024; // an SDP is a few KB; candidates are tiny
const MAX_CHAT_CHARS = 2000;
const SIGNAL_TTL_MS = 3 * 60 * 1000;
const PARTICIPANT_KEEP_MS = 6 * 60 * 60 * 1000;
const CHAT_KEEP_MS = 7 * 24 * 60 * 60 * 1000;
const SWEEP_BATCH = 400;

/* --------------------------------- helpers ---------------------------------- */

function roleFor(user, lesson) {
  if (lesson.tutorId === user._id) return "tutor";
  if (lesson.studentId === user._id) return "student";
  if (user.role === "admin") return "admin";
  return null;
}

function windowFor(lesson) {
  return {
    opensAt: lesson.startUTC - JOIN_OPENS_BEFORE_MS,
    closesAt: lesson.endUTC + JOIN_CLOSES_AFTER_MS,
  };
}

/**
 * Resolve `roomId` to { lesson, user, role } or a reason string.
 * Admins may enter outside the scheduled window (support / dispute review).
 */
async function resolveRoom(ctx, roomId) {
  const user = await currentUser(ctx);
  if (!user) return { error: "unauthenticated" };
  if (user.status === "suspended") return { error: "forbidden" };

  const lesson = await ctx.db
    .query("lessons")
    .withIndex("by_roomId", (q) => q.eq("roomId", roomId))
    .first();
  if (!lesson) return { error: "notfound" };

  const role = roleFor(user, lesson);
  if (!role) return { error: "forbidden" };

  const { opensAt, closesAt } = windowFor(lesson);
  const base = { lesson, user, role, opensAt, closesAt };

  if (!JOINABLE_STATUSES.includes(lesson.status)) {
    return { ...base, error: "cancelled" };
  }
  const now = Date.now();
  if (role !== "admin" && now < opensAt) return { ...base, error: "early" };
  if (role !== "admin" && now > closesAt) return { ...base, error: "ended" };
  return base;
}

/** Same as `resolveRoom` but throws — for mutations, which must not no-op silently. */
async function requireRoom(ctx, roomId) {
  const resolved = await resolveRoom(ctx, roomId);
  if (resolved.error) {
    const messages = {
      unauthenticated: "Please sign in to join the class",
      notfound: "This class link is not valid",
      forbidden: "You are not a participant of this class",
      cancelled: "This lesson is no longer scheduled",
      early: "The classroom is not open yet",
      ended: "This class has ended",
    };
    throw new Error(messages[resolved.error] ?? "Cannot join this class");
  }
  return resolved;
}

/** Give a lesson a room token if it does not have one yet. Returns the token. */
export async function ensureRoomId(ctx, lesson) {
  if (lesson.roomId) return lesson.roomId;
  const roomId = newRoomId();
  await ctx.db.patch(lesson._id, { roomId });
  return roomId;
}

/* ---------------------------------- queries --------------------------------- */

/**
 * Everything the classroom page needs before any media is touched: whether
 * the caller may be here, who the other party is, and when the room opens.
 */
export const room = query({
  args: { roomId: v.string() },
  handler: async (ctx, { roomId }) => {
    const resolved = await resolveRoom(ctx, roomId);
    if (resolved.error && !resolved.lesson) {
      return { status: resolved.error };
    }
    const { lesson, user, role, opensAt, closesAt, error } = resolved;
    const student = await ctx.db.get(lesson.studentId);
    const tutor = await ctx.db.get(lesson.tutorId);
    return {
      status: error ?? "ok",
      opensAt,
      closesAt,
      lesson: {
        _id: lesson._id,
        startUTC: lesson.startUTC,
        endUTC: lesson.endUTC,
        type: lesson.type,
        status: lesson.status,
      },
      me: {
        userId: user._id,
        name: user.name ?? (role === "tutor" ? "Tutor" : "Student"),
        role,
        timezone: user.timezone ?? "UTC",
      },
      tutorName: tutor?.name ?? "Tutor",
      studentName: student?.name ?? "Student",
    };
  },
});

/**
 * Live roster. Callers filter on `lastSeenAt` with their own clock so that a
 * peer that vanished without saying goodbye disappears on the next heartbeat
 * of anybody else in the room.
 */
export const peers = query({
  args: { roomId: v.string() },
  handler: async (ctx, { roomId }) => {
    const resolved = await resolveRoom(ctx, roomId);
    if (resolved.error) return [];
    const rows = await ctx.db
      .query("videoParticipants")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .collect();
    return rows
      .filter((r) => !r.left)
      .map((r) => ({
        peerId: r.peerId,
        userId: r.userId,
        name: r.name,
        role: r.role,
        micOn: r.micOn,
        camOn: r.camOn,
        sharing: r.sharing,
        joinedAt: r.joinedAt,
        lastSeenAt: r.lastSeenAt,
      }));
  },
});

/** Signalling inbox for one peer, oldest first. */
export const inbox = query({
  args: { roomId: v.string(), peerId: v.string() },
  handler: async (ctx, { roomId, peerId }) => {
    const resolved = await resolveRoom(ctx, roomId);
    if (resolved.error) return [];
    const rows = await ctx.db
      .query("videoSignals")
      .withIndex("by_room_target", (q) =>
        q.eq("roomId", roomId).eq("toPeer", peerId)
      )
      .order("asc")
      .take(80);
    return rows.map((r) => ({
      _id: r._id,
      fromPeer: r.fromPeer,
      kind: r.kind,
      payload: r.payload,
    }));
  },
});

export const chat = query({
  args: { roomId: v.string() },
  handler: async (ctx, { roomId }) => {
    const resolved = await resolveRoom(ctx, roomId);
    if (resolved.error) return [];
    const rows = await ctx.db
      .query("videoChat")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .order("desc")
      .take(200);
    return rows.reverse().map((r) => ({
      _id: r._id,
      userId: r.userId,
      name: r.name,
      text: r.text,
      sentAt: r.sentAt,
    }));
  },
});

/* --------------------------------- mutations -------------------------------- */

/**
 * Called from the dashboard when an older lesson predates the classroom
 * feature and has no token yet. Only the lesson's own participants can do it.
 */
export const ensureRoomForLesson = mutation({
  args: { lessonId: v.id("lessons") },
  handler: async (ctx, { lessonId }) => {
    const user = await requireUser(ctx);
    const lesson = await ctx.db.get(lessonId);
    if (!lesson) throw new Error("Lesson not found");
    if (!roleFor(user, lesson)) throw new Error("Not authorized");
    return { roomId: await ensureRoomId(ctx, lesson) };
  },
});

/** Enter the room (idempotent per browser tab). */
export const join = mutation({
  args: {
    roomId: v.string(),
    peerId: v.string(),
    micOn: v.boolean(),
    camOn: v.boolean(),
  },
  handler: async (ctx, { roomId, peerId, micOn, camOn }) => {
    const { lesson, user, role } = await requireRoom(ctx, roomId);
    const now = Date.now();

    const existing = await ctx.db
      .query("videoParticipants")
      .withIndex("by_room_peer", (q) => q.eq("roomId", roomId).eq("peerId", peerId))
      .first();
    if (existing) {
      if (existing.userId !== user._id) throw new Error("Peer id already in use");
      await ctx.db.patch(existing._id, {
        lastSeenAt: now,
        left: false,
        micOn,
        camOn,
        name: user.name ?? existing.name,
      });
      return { ok: true };
    }

    const live = (
      await ctx.db
        .query("videoParticipants")
        .withIndex("by_room", (q) => q.eq("roomId", roomId))
        .collect()
    ).filter((r) => !r.left && now - r.lastSeenAt < PEER_TTL_MS);
    if (live.length >= MAX_PEERS_PER_ROOM) {
      throw new Error("This classroom is full");
    }

    await ctx.db.insert("videoParticipants", {
      roomId,
      lessonId: lesson._id,
      userId: user._id,
      peerId,
      name: user.name ?? (role === "tutor" ? "Tutor" : "Student"),
      role,
      joinedAt: now,
      lastSeenAt: now,
      micOn,
      camOn,
      sharing: false,
      left: false,
    });
    return { ok: true };
  },
});

/** Presence heartbeat, also carries the mic/camera/share indicators. */
export const heartbeat = mutation({
  args: {
    roomId: v.string(),
    peerId: v.string(),
    micOn: v.boolean(),
    camOn: v.boolean(),
    sharing: v.boolean(),
  },
  handler: async (ctx, { roomId, peerId, micOn, camOn, sharing }) => {
    const user = await currentUser(ctx);
    if (!user) return { ok: false };
    const row = await ctx.db
      .query("videoParticipants")
      .withIndex("by_room_peer", (q) => q.eq("roomId", roomId).eq("peerId", peerId))
      .first();
    if (!row || row.userId !== user._id) return { ok: false };
    await ctx.db.patch(row._id, {
      lastSeenAt: Date.now(),
      micOn,
      camOn,
      sharing,
      left: false,
    });
    return { ok: true };
  },
});

/** Leave the room and drop any signalling still addressed to this peer. */
export const leave = mutation({
  args: { roomId: v.string(), peerId: v.string() },
  handler: async (ctx, { roomId, peerId }) => {
    const user = await currentUser(ctx);
    if (!user) return { ok: false };
    const row = await ctx.db
      .query("videoParticipants")
      .withIndex("by_room_peer", (q) => q.eq("roomId", roomId).eq("peerId", peerId))
      .first();
    if (!row || row.userId !== user._id) return { ok: false };
    await ctx.db.patch(row._id, { left: true, lastSeenAt: Date.now() });

    const stale = await ctx.db
      .query("videoSignals")
      .withIndex("by_room_target", (q) => q.eq("roomId", roomId).eq("toPeer", peerId))
      .take(200);
    for (const s of stale) await ctx.db.delete(s._id);
    return { ok: true };
  },
});

/** Post one signalling message (offer / answer / ICE candidate / bye). */
export const signal = mutation({
  args: {
    roomId: v.string(),
    fromPeer: v.string(),
    toPeer: v.string(),
    kind: v.union(
      v.literal("offer"),
      v.literal("answer"),
      v.literal("candidate"),
      v.literal("bye")
    ),
    payload: v.string(),
  },
  handler: async (ctx, { roomId, fromPeer, toPeer, kind, payload }) => {
    const { user } = await requireRoom(ctx, roomId);
    if (payload.length > MAX_PAYLOAD_CHARS) throw new Error("Signal too large");

    // The sender must own `fromPeer`, and `toPeer` must be in this room.
    const mine = await ctx.db
      .query("videoParticipants")
      .withIndex("by_room_peer", (q) => q.eq("roomId", roomId).eq("peerId", fromPeer))
      .first();
    if (!mine || mine.userId !== user._id) throw new Error("Unknown sender peer");
    const target = await ctx.db
      .query("videoParticipants")
      .withIndex("by_room_peer", (q) => q.eq("roomId", roomId).eq("peerId", toPeer))
      .first();
    if (!target) return { ok: false }; // peer already gone — nothing to deliver

    await ctx.db.insert("videoSignals", {
      roomId,
      fromPeer,
      toPeer,
      kind,
      payload,
      createdAt: Date.now(),
    });
    return { ok: true };
  },
});

/** Delete signals once they have been applied. */
export const ack = mutation({
  args: { roomId: v.string(), ids: v.array(v.id("videoSignals")) },
  handler: async (ctx, { roomId, ids }) => {
    const user = await currentUser(ctx);
    if (!user) return { ok: false };
    for (const id of ids.slice(0, 100)) {
      const row = await ctx.db.get(id);
      if (!row || row.roomId !== roomId) continue;
      const target = await ctx.db
        .query("videoParticipants")
        .withIndex("by_room_peer", (q) =>
          q.eq("roomId", roomId).eq("peerId", row.toPeer)
        )
        .first();
      if (target?.userId !== user._id) continue; // only the addressee may ack
      await ctx.db.delete(id);
    }
    return { ok: true };
  },
});

export const sendChat = mutation({
  args: { roomId: v.string(), text: v.string() },
  handler: async (ctx, { roomId, text }) => {
    const { user, role } = await requireRoom(ctx, roomId);
    const body = text.trim().slice(0, MAX_CHAT_CHARS);
    if (!body) return { ok: false };
    await ctx.db.insert("videoChat", {
      roomId,
      userId: user._id,
      name: user.name ?? (role === "tutor" ? "Tutor" : "Student"),
      text: body,
      sentAt: Date.now(),
    });
    return { ok: true };
  },
});

/* ----------------------------------- crons ---------------------------------- */

/**
 * Assign room tokens to lessons booked before the classroom existed, so their
 * "Join the class" button works without anyone having to click anything first.
 */
export const backfillRoomIdsTick = internalMutation({
  args: {},
  handler: async (ctx) => {
    const upcoming = await ctx.db
      .query("lessons")
      .withIndex("by_status_start", (q) =>
        q.eq("status", "scheduled").gt("startUTC", Date.now() - 24 * 60 * 60 * 1000)
      )
      .take(500);
    for (const lesson of upcoming) {
      if (!lesson.roomId) await ctx.db.patch(lesson._id, { roomId: newRoomId() });
    }
  },
});

/** Housekeeping: undelivered signals, long-gone participants, stale chat. */
export const sweepTick = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    const signals = await ctx.db
      .query("videoSignals")
      .withIndex("by_createdAt", (q) => q.lt("createdAt", now - SIGNAL_TTL_MS))
      .take(SWEEP_BATCH);
    for (const row of signals) await ctx.db.delete(row._id);

    const participants = await ctx.db
      .query("videoParticipants")
      .withIndex("by_lastSeenAt", (q) => q.lt("lastSeenAt", now - PARTICIPANT_KEEP_MS))
      .take(SWEEP_BATCH);
    for (const row of participants) await ctx.db.delete(row._id);

    const chats = await ctx.db
      .query("videoChat")
      .withIndex("by_sentAt", (q) => q.lt("sentAt", now - CHAT_KEEP_MS))
      .take(SWEEP_BATCH);
    for (const row of chats) await ctx.db.delete(row._id);
  },
});
