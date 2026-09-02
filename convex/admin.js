import { query, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import {
  requireAdmin,
  getSettings,
  creditMinutes,
  debitMinutes,
  getBalance,
  LESSON_MINUTES,
} from "./lib";

/* ------------------------------ tutor approvals ------------------------------ */

export const pendingApplications = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const pending = await ctx.db
      .query("tutorProfiles")
      .withIndex("by_approvalStatus", (q) => q.eq("approvalStatus", "pending"))
      .collect();
    const result = [];
    for (const profile of pending) {
      const verification = await ctx.db
        .query("tutorVerifications")
        .withIndex("by_profile", (q) => q.eq("profileId", profile._id))
        .first();
      result.push({
        ...profile,
        photoUrl: profile.photoStorageId
          ? await ctx.storage.getUrl(profile.photoStorageId)
          : null,
        introVideoUrl: profile.introVideoStorageId
          ? await ctx.storage.getUrl(profile.introVideoStorageId)
          : null,
        verification: verification
          ? {
              ...verification,
              idFrontUrl: await ctx.storage.getUrl(verification.idFrontStorageId),
              idBackUrl: verification.idBackStorageId
                ? await ctx.storage.getUrl(verification.idBackStorageId)
                : null,
              faceUrl: await ctx.storage.getUrl(verification.faceStorageId),
            }
          : null,
      });
    }
    // Applications that cleared the identity step are ready to review — first.
    result.sort(
      (a, b) =>
        Number(Boolean(b.verification)) - Number(Boolean(a.verification)) ||
        a._creationTime - b._creationTime
    );
    return result;
  },
});

/** The verification attached to one application (id, face scan, document details). */
async function verificationFor(ctx, profileId) {
  return ctx.db
    .query("tutorVerifications")
    .withIndex("by_profile", (q) => q.eq("profileId", profileId))
    .first();
}

export const approveTutor = mutation({
  args: { profileId: v.id("tutorProfiles") },
  handler: async (ctx, { profileId }) => {
    const admin = await requireAdmin(ctx);
    const profile = await ctx.db.get(profileId);
    if (!profile) throw new Error("Application not found");
    const verification = await verificationFor(ctx, profileId);
    if (!verification) {
      throw new Error(
        "This applicant hasn't completed identity verification yet — they still need to upload their ID and scan their face."
      );
    }
    await ctx.db.patch(verification._id, {
      status: "approved",
      rejectionReason: undefined,
      reviewedAt: Date.now(),
      reviewedBy: admin._id,
    });
    await ctx.db.patch(profileId, {
      approvalStatus: "approved",
      rejectionReason: undefined,
      identityVerified: true,
    });
    if (profile.userId) {
      await ctx.db.patch(profile.userId, { role: "tutor" });
    }
    await ctx.scheduler.runAfter(0, internal.emails.sendTemplate, {
      to: [profile.email],
      template: "tutorApproved",
      params: { name: profile.name },
    });
    return { ok: true };
  },
});

export const rejectTutor = mutation({
  args: { profileId: v.id("tutorProfiles"), reason: v.string() },
  handler: async (ctx, { profileId, reason }) => {
    const admin = await requireAdmin(ctx);
    const profile = await ctx.db.get(profileId);
    if (!profile) throw new Error("Application not found");
    const verification = await verificationFor(ctx, profileId);
    if (verification) {
      await ctx.db.patch(verification._id, {
        status: "rejected",
        rejectionReason: reason,
        reviewedAt: Date.now(),
        reviewedBy: admin._id,
      });
    }
    await ctx.db.patch(profileId, {
      approvalStatus: "rejected",
      rejectionReason: reason,
      identityVerified: false,
    });
    await ctx.scheduler.runAfter(0, internal.emails.sendTemplate, {
      to: [profile.email],
      template: "tutorRejected",
      params: { name: profile.name, reason },
    });
    return { ok: true };
  },
});

/**
 * Bounce just the identity check back to the applicant — the application stays
 * pending so they can re-upload their ID / re-scan their face.
 */
export const requestNewIdentityDocuments = mutation({
  args: { profileId: v.id("tutorProfiles"), reason: v.string() },
  handler: async (ctx, { profileId, reason }) => {
    const admin = await requireAdmin(ctx);
    const profile = await ctx.db.get(profileId);
    if (!profile) throw new Error("Application not found");
    const verification = await verificationFor(ctx, profileId);
    if (!verification) throw new Error("Nothing to review — no documents submitted yet");
    await ctx.db.patch(verification._id, {
      status: "rejected",
      rejectionReason: reason,
      reviewedAt: Date.now(),
      reviewedBy: admin._id,
    });
    await ctx.db.patch(profileId, { identityVerified: false });
    await ctx.scheduler.runAfter(0, internal.emails.sendTemplate, {
      to: [profile.email],
      template: "tutorIdentityRejected",
      params: { name: profile.name, reason },
    });
    return { ok: true };
  },
});

/* ------------------------------ user management ------------------------------ */

export const users = query({
  args: { search: v.optional(v.string()), role: v.optional(v.string()) },
  handler: async (ctx, { search, role }) => {
    await requireAdmin(ctx);
    const all = await ctx.db.query("users").order("desc").take(500);
    return all
      .filter((user) => {
        if (role && (user.role ?? "student") !== role) return false;
        if (search) {
          const haystack = `${user.name ?? ""} ${user.email ?? ""}`.toLowerCase();
          if (!haystack.includes(search.toLowerCase())) return false;
        }
        return true;
      })
      .map((user) => ({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role ?? "student",
        status: user.status ?? "active",
        createdAt: user._creationTime,
      }));
  },
});

/**
 * The role a user falls back to when their admin access is removed: whatever
 * their tutor application says about them, else plain student. Mirrors how
 * `afterUserCreatedOrUpdated` in convex/auth.js seeds the role at signup.
 */
async function nonAdminRoleFor(ctx, user) {
  if (!user.email) return "student";
  const profile = await ctx.db
    .query("tutorProfiles")
    .withIndex("by_email", (q) => q.eq("email", user.email.toLowerCase()))
    .first();
  if (!profile) return "student";
  return profile.approvalStatus === "approved" ? "tutor" : "tutor_applicant";
}

/**
 * Grant or revoke admin access. Admins can't change their own, so the
 * platform can never be left without one.
 */
export const setAdmin = mutation({
  args: { userId: v.id("users"), isAdmin: v.boolean() },
  handler: async (ctx, { userId, isAdmin }) => {
    const admin = await requireAdmin(ctx);
    if (userId === admin._id) {
      throw new Error("You cannot change your own admin access");
    }
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");
    if (user.status === "deleted") {
      throw new Error("This account has been deleted");
    }
    if (isAdmin && user.status === "suspended") {
      throw new Error("Reactivate this account before making it an admin");
    }
    const role = isAdmin ? "admin" : await nonAdminRoleFor(ctx, user);
    await ctx.db.patch(userId, { role });
    return { ok: true, role };
  },
});

export const setUserStatus = mutation({
  args: {
    userId: v.id("users"),
    status: v.union(v.literal("active"), v.literal("suspended"), v.literal("deleted")),
  },
  handler: async (ctx, { userId, status }) => {
    const admin = await requireAdmin(ctx);
    if (userId === admin._id) throw new Error("You cannot change your own status");
    await ctx.db.patch(userId, { status });
    return { ok: true };
  },
});

/* --------------------------------- bookings ---------------------------------- */

export const bookings = query({
  args: { status: v.optional(v.string()) },
  handler: async (ctx, { status }) => {
    await requireAdmin(ctx);
    const lessons = await ctx.db.query("lessons").order("desc").take(300);
    const result = [];
    for (const lesson of lessons) {
      if (status && lesson.status !== status) continue;
      const student = await ctx.db.get(lesson.studentId);
      const tutor = await ctx.db.get(lesson.tutorId);
      result.push({
        ...lesson,
        studentName: student?.name ?? student?.email ?? "Student",
        tutorName: tutor?.name ?? tutor?.email ?? "Tutor",
      });
    }
    return result;
  },
});

/** Admin cancels any scheduled lesson — always refunds the student's hour. */
export const cancelBooking = mutation({
  args: { lessonId: v.id("lessons"), reason: v.optional(v.string()) },
  handler: async (ctx, { lessonId, reason }) => {
    await requireAdmin(ctx);
    const lesson = await ctx.db.get(lessonId);
    if (!lesson || lesson.status !== "scheduled") {
      throw new Error("Lesson is not scheduled");
    }
    if (lesson.type === "regular") {
      await creditMinutes(ctx, {
        studentId: lesson.studentId,
        tutorId: lesson.tutorId,
        minutes: LESSON_MINUTES,
        rateCents: lesson.priceCents,
        reason: "refund",
        lessonId,
        note: reason ? `Admin: ${reason}` : "Admin cancellation",
      });
    }
    await ctx.db.patch(lessonId, {
      status: "cancelled_tutor",
      cancelledAt: Date.now(),
      cancelReason: reason ?? "Cancelled by admin",
    });
    return { ok: true };
  },
});

/* ------------------------- hour transfer (admin-assisted) -------------------- */

/**
 * Transfer hours between tutors at monetary value (§4.2): hours carry the
 * value they were bought at; the student covers any difference off-platform.
 */
export const transferHours = mutation({
  args: {
    studentId: v.id("users"),
    fromTutorId: v.id("users"),
    toTutorId: v.id("users"),
    minutes: v.number(),
  },
  handler: async (ctx, { studentId, fromTutorId, toTutorId, minutes }) => {
    await requireAdmin(ctx);
    if (minutes <= 0) throw new Error("Minutes must be positive");
    const from = await getBalance(ctx, studentId, fromTutorId);
    if (!from || from.minutesRemaining < minutes) {
      throw new Error("Insufficient source balance");
    }
    const toProfile = await ctx.db
      .query("tutorProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", toTutorId))
      .first();
    if (!toProfile) throw new Error("Target tutor not found");

    const valueCents = (minutes / 60) * from.purchaseRateCents;
    const targetMinutes = Math.floor((valueCents / toProfile.hourlyRateCents) * 60);

    await ctx.db.patch(from._id, {
      minutesRemaining: from.minutesRemaining - minutes,
    });
    await ctx.db.insert("balanceEntries", {
      balanceId: from._id,
      deltaMinutes: -minutes,
      reason: "transfer",
      note: `Transfer to tutor ${toTutorId}`,
      createdAt: Date.now(),
    });
    await creditMinutes(ctx, {
      studentId,
      tutorId: toTutorId,
      minutes: targetMinutes,
      rateCents: toProfile.hourlyRateCents,
      reason: "transfer",
      note: `Transfer from tutor ${fromTutorId}`,
    });
    return { targetMinutes };
  },
});

/* ----------------------------- money & reporting ----------------------------- */

export const revenueReport = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const settings = await getSettings(ctx);
    const purchases = await ctx.db.query("purchases").collect();
    const paid = purchases.filter((p) => p.status === "paid" || p.status === "conflict");
    const grossCents = paid.reduce((sum, p) => sum + p.amountCents, 0);
    const trialCents = paid
      .filter((p) => p.kind === "trial")
      .reduce((sum, p) => sum + p.amountCents, 0);

    const lessons = await ctx.db.query("lessons").collect();
    const released = lessons.filter((l) => l.payoutReleased);
    const commissionCents = released.reduce(
      (sum, l) => sum + (l.commissionCents ?? 0),
      0
    );

    const walletEntries = await ctx.db.query("walletEntries").collect();
    const owedCents = walletEntries
      .filter((e) => e.type === "earning" && e.status === "available")
      .reduce((sum, e) => sum + e.amountCents, 0);
    const paidOutCents = walletEntries
      .filter((e) => e.type === "earning" && e.status === "paid")
      .reduce((sum, e) => sum + e.amountCents, 0);

    let escrowCents = 0;
    for (const lesson of lessons) {
      const active =
        !lesson.payoutReleased &&
        lesson.type === "regular" &&
        ["scheduled", "completed", "noshow_student"].includes(lesson.status);
      if (active) {
        escrowCents +=
          lesson.priceCents -
          Math.round((lesson.priceCents * settings.commissionPercent) / 100);
      }
    }

    return {
      grossCents,
      trialCents,
      commissionCents,
      escrowCents,
      owedCents,
      paidOutCents,
      purchaseCount: paid.length,
      lessonCount: lessons.length,
      confirmedLessons: released.length,
    };
  },
});

export const payments = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const purchases = await ctx.db.query("purchases").order("desc").take(200);
    const result = [];
    for (const purchase of purchases) {
      const student = await ctx.db.get(purchase.studentId);
      const tutor = await ctx.db.get(purchase.tutorId);
      result.push({
        ...purchase,
        studentName: student?.name ?? student?.email ?? "Student",
        tutorName: tutor?.name ?? tutor?.email ?? "Tutor",
      });
    }
    return result;
  },
});

export const payoutLog = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const payouts = await ctx.db.query("payouts").order("desc").take(200);
    const result = [];
    for (const payout of payouts) {
      const tutor = await ctx.db.get(payout.tutorId);
      result.push({ ...payout, tutorName: tutor?.name ?? tutor?.email ?? "Tutor" });
    }
    return result;
  },
});

/* --------------------------- inquiries & testimonials ------------------------ */

export const inquiries = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.db.query("inquiries").order("desc").take(200);
  },
});

export const markInquiryHandled = mutation({
  args: { inquiryId: v.id("inquiries") },
  handler: async (ctx, { inquiryId }) => {
    await requireAdmin(ctx);
    await ctx.db.patch(inquiryId, { status: "handled" });
  },
});

export const newsletterSubscribers = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.db.query("newsletterSubscribers").order("desc").take(1000);
  },
});

export const allTestimonials = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const items = await ctx.db.query("testimonials").collect();
    items.sort((a, b) => a.order - b.order);
    return items;
  },
});

export const saveTestimonial = mutation({
  args: {
    testimonialId: v.optional(v.id("testimonials")),
    name: v.string(),
    text: v.string(),
    published: v.boolean(),
    order: v.number(),
  },
  handler: async (ctx, { testimonialId, ...fields }) => {
    await requireAdmin(ctx);
    if (testimonialId) await ctx.db.patch(testimonialId, fields);
    else await ctx.db.insert("testimonials", fields);
    return { ok: true };
  },
});

export const deleteTestimonial = mutation({
  args: { testimonialId: v.id("testimonials") },
  handler: async (ctx, { testimonialId }) => {
    await requireAdmin(ctx);
    await ctx.db.delete(testimonialId);
  },
});
