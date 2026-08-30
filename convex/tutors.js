import {
  query,
  mutation,
  action,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { ConvexError, v } from "convex/values";
import { requireRole } from "./lib";

async function withUrls(ctx, profile) {
  return {
    ...profile,
    photoUrl: profile.photoStorageId
      ? await ctx.storage.getUrl(profile.photoStorageId)
      : null,
    introVideoUrl: profile.introVideoStorageId
      ? await ctx.storage.getUrl(profile.introVideoStorageId)
      : null,
  };
}

/** Public tutor listing with filters. */
export const list = query({
  args: {
    language: v.optional(v.string()), // "en" | "fr"
    maxRateCents: v.optional(v.number()),
    minRateCents: v.optional(v.number()),
    search: v.optional(v.string()),
  },
  handler: async (ctx, { language, maxRateCents, minRateCents, search }) => {
    let profiles = await ctx.db
      .query("tutorProfiles")
      .withIndex("by_approvalStatus", (q) => q.eq("approvalStatus", "approved"))
      .collect();

    // Hide tutors whose linked account is suspended/deleted.
    const results = [];
    for (const profile of profiles) {
      if (profile.userId) {
        const user = await ctx.db.get(profile.userId);
        if (user && user.status && user.status !== "active") continue;
      }
      if (language && !profile.languagesTaught.includes(language)) continue;
      if (maxRateCents !== undefined && profile.hourlyRateCents > maxRateCents) continue;
      if (minRateCents !== undefined && profile.hourlyRateCents < minRateCents) continue;
      if (search) {
        const haystack = `${profile.name} ${profile.headline ?? ""} ${profile.bio} ${profile.specialties.join(" ")}`.toLowerCase();
        if (!haystack.includes(search.toLowerCase())) continue;
      }
      results.push(await withUrls(ctx, profile));
    }
    results.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    return results;
  },
});

/** Public tutor profile page data. */
export const getById = query({
  args: { profileId: v.id("tutorProfiles") },
  handler: async (ctx, { profileId }) => {
    const profile = await ctx.db.get(profileId);
    if (!profile || profile.approvalStatus !== "approved") return null;
    const reviews = await ctx.db
      .query("reviews")
      .withIndex("by_tutor", (q) => q.eq("tutorId", profile.userId ?? profileId))
      .order("desc")
      .take(20);
    const reviewsWithNames = [];
    for (const review of reviews) {
      const student = await ctx.db.get(review.studentId);
      reviewsWithNames.push({
        ...review,
        studentName: student?.name ?? "Student",
      });
    }
    return { ...(await withUrls(ctx, profile)), reviews: reviewsWithNames };
  },
});

/** Public application form → pending profile + notification emails. */
export const submitApplication = action({
  args: {
    name: v.string(),
    email: v.string(),
    bio: v.string(),
    headline: v.optional(v.string()),
    languagesTaught: v.array(v.union(v.literal("en"), v.literal("fr"))),
    nativeLanguages: v.array(v.string()),
    nationality: v.string(), // country of origin — required
    currentLocation: v.string(), // country they currently live in
    specialties: v.array(v.string()),
    hourlyRateCents: v.number(),
    qualifications: v.string(),
    introVideoStorageId: v.optional(v.id("_storage")),
    photoStorageId: v.optional(v.id("_storage")),
    turnstileToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { turnstileToken, ...fields } = args;
    const secret = process.env.TURNSTILE_SECRET_KEY;
    if (secret) {
      const res = await fetch(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ secret, response: turnstileToken ?? "" }),
        }
      );
      const outcome = await res.json();
      if (!outcome.success) throw new ConvexError("CAPTCHA verification failed");
    }
    if (fields.hourlyRateCents < 500 || fields.hourlyRateCents > 50000) {
      throw new ConvexError("Hourly rate must be between $5 and $500");
    }
    if (!fields.nationality.trim()) {
      throw new ConvexError("Country of origin (nationality) is required");
    }
    if (!fields.currentLocation.trim()) {
      throw new ConvexError("Current location is required");
    }
    const { profileId, already } = await ctx.runMutation(
      internal.tutors.insertApplication,
      fields
    );
    // The application is stored — a failed notification email must not make
    // the whole submission look failed (retrying it would be a duplicate).
    if (!already) {
      try {
        await ctx.runAction(internal.emails.sendTemplate, {
          to: [fields.email],
          template: "tutorApplicationReceived",
          params: { name: fields.name },
        });
        const adminEmail = process.env.ADMIN_EMAIL;
        if (adminEmail) {
          await ctx.runAction(internal.emails.sendTemplate, {
            to: [adminEmail],
            template: "tutorApplicationAdminAlert",
            params: {
              profileId,
              name: fields.name,
              email: fields.email,
              headline: fields.headline,
              languagesTaught: fields.languagesTaught,
              nativeLanguages: fields.nativeLanguages,
              nationality: fields.nationality,
              currentLocation: fields.currentLocation,
              specialties: fields.specialties,
              hourlyRateCents: fields.hourlyRateCents,
              bio: fields.bio,
              qualifications: fields.qualifications,
              hasPhoto: Boolean(fields.photoStorageId),
              hasVideo: Boolean(fields.introVideoStorageId),
            },
          });
        }
      } catch (err) {
        console.error("Tutor application notification email failed:", err);
      }
    }
    return { ok: true, already };
  },
});

export const insertApplication = internalMutation({
  args: {
    name: v.string(),
    email: v.string(),
    bio: v.string(),
    headline: v.optional(v.string()),
    languagesTaught: v.array(v.union(v.literal("en"), v.literal("fr"))),
    nativeLanguages: v.array(v.string()),
    nationality: v.string(), // country of origin — required
    currentLocation: v.string(), // country they currently live in
    specialties: v.array(v.string()),
    hourlyRateCents: v.number(),
    qualifications: v.string(),
    introVideoStorageId: v.optional(v.id("_storage")),
    photoStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    // Link immediately if a user with this email already exists (applicants
    // now create their account, with email OTP verification, before this runs).
    const user =
      (await ctx.db
        .query("users")
        .withIndex("email", (q) => q.eq("email", args.email.trim()))
        .first()) ??
      (await ctx.db
        .query("users")
        .withIndex("email", (q) => q.eq("email", email))
        .first());

    const existing = await ctx.db
      .query("tutorProfiles")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    if (existing && existing.approvalStatus !== "rejected") {
      // Idempotent: a retry (email hiccup, double-click, resumed flow) for an
      // email that already has a live application counts as success.
      if (user && !existing.userId) {
        await ctx.db.patch(existing._id, { userId: user._id });
      }
      if (user && (!user.role || user.role === "student")) {
        await ctx.db.patch(user._id, { role: "tutor_applicant" });
      }
      return { profileId: existing._id, already: true };
    }

    const profileId = await ctx.db.insert("tutorProfiles", {
      ...args,
      email,
      userId: user?._id,
      approvalStatus: "pending",
      rating: 0,
      reviewCount: 0,
      cancellationCount: 0,
    });
    // Their dashboard shows "application under review" until the admin approves.
    if (user && (!user.role || user.role === "student")) {
      await ctx.db.patch(user._id, { role: "tutor_applicant" });
    }
    return { profileId, already: false };
  },
});

/** Tutor edits their own live profile. */
export const updateMyProfile = mutation({
  args: {
    bio: v.optional(v.string()),
    headline: v.optional(v.string()),
    specialties: v.optional(v.array(v.string())),
    nativeLanguages: v.optional(v.array(v.string())),
    languagesTaught: v.optional(v.array(v.union(v.literal("en"), v.literal("fr")))),
    nationality: v.optional(v.string()),
    currentLocation: v.optional(v.string()),
    hourlyRateCents: v.optional(v.number()),
    qualifications: v.optional(v.string()),
    introVideoStorageId: v.optional(v.id("_storage")),
    photoStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, "tutor");
    const profile = await ctx.db
      .query("tutorProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .first();
    if (!profile) throw new Error("Tutor profile not found");
    if (
      args.hourlyRateCents !== undefined &&
      (args.hourlyRateCents < 500 || args.hourlyRateCents > 50000)
    ) {
      throw new Error("Hourly rate must be between $5 and $500");
    }
    if (args.nationality !== undefined && !args.nationality.trim()) {
      throw new Error("Country of origin (nationality) is required");
    }
    if (args.currentLocation !== undefined && !args.currentLocation.trim()) {
      throw new Error("Current location is required");
    }
    const patch = {};
    for (const [key, value] of Object.entries(args)) {
      if (value !== undefined) patch[key] = value;
    }
    if (Object.keys(patch).length > 0) await ctx.db.patch(profile._id, patch);
    return { ok: true };
  },
});

/** Tutor dashboard: list of students (from conversations/balances/lessons). */
export const myStudents = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireRole(ctx, "tutor");
    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_tutor", (q) => q.eq("tutorId", user._id))
      .collect();
    const lessons = await ctx.db
      .query("lessons")
      .withIndex("by_tutor_start", (q) => q.eq("tutorId", user._id))
      .collect();
    const balances = await ctx.db
      .query("hourBalances")
      .withIndex("by_tutor", (q) => q.eq("tutorId", user._id))
      .collect();

    const studentIds = new Set([
      ...conversations.map((c) => c.studentId),
      ...lessons.map((l) => l.studentId),
    ]);
    const now = Date.now();
    const result = [];
    for (const studentId of studentIds) {
      const student = await ctx.db.get(studentId);
      if (!student) continue;
      const theirLessons = lessons.filter((l) => l.studentId === studentId);
      const upcoming = theirLessons
        .filter((l) => l.status === "scheduled" && l.startUTC > now)
        .sort((a, b) => a.startUTC - b.startUTC);
      const balance = balances.find((b) => b.studentId === studentId);
      result.push({
        studentId,
        name: student.name ?? student.email ?? "Student",
        lessonsCompleted: theirLessons.filter((l) =>
          ["completed", "confirmed"].includes(l.status)
        ).length,
        nextLessonUTC: upcoming[0]?.startUTC ?? null,
        minutesRemaining: balance?.minutesRemaining ?? 0,
        conversationId:
          conversations.find((c) => c.studentId === studentId)?._id ?? null,
      });
    }
    result.sort((a, b) => (b.nextLessonUTC ?? 0) - (a.nextLessonUTC ?? 0));
    return result;
  },
});

export const profileByUserId = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) =>
    ctx.db
      .query("tutorProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first(),
});

/** Stripe Connect `account.updated` webhook → onboarding status. */
export const updateConnectStatus = internalMutation({
  args: {
    accountId: v.string(),
    payoutsEnabled: v.boolean(),
  },
  handler: async (ctx, { accountId, payoutsEnabled }) => {
    const profile = await ctx.db
      .query("tutorProfiles")
      .withIndex("by_connectAccount", (q) =>
        q.eq("stripeConnectAccountId", accountId)
      )
      .first();
    if (profile) {
      await ctx.db.patch(profile._id, { stripeConnectOnboarded: payoutsEnabled });
    }
  },
});

export const setConnectAccountId = internalMutation({
  args: { profileId: v.id("tutorProfiles"), accountId: v.string() },
  handler: async (ctx, { profileId, accountId }) => {
    await ctx.db.patch(profileId, { stripeConnectAccountId: accountId });
  },
});
