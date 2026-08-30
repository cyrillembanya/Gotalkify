import { query, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { ConvexError, v } from "convex/values";
import { requireUser } from "./lib";

const DOCUMENT_LABELS = {
  passport: "Passport",
  national_id: "National ID card",
  drivers_license: "Driver's licence",
  residence_permit: "Residence permit",
};

const documentType = v.union(
  v.literal("passport"),
  v.literal("national_id"),
  v.literal("drivers_license"),
  v.literal("residence_permit")
);

/** The tutor application belonging to `user` (linked by id, else by email). */
async function myProfile(ctx, user) {
  const byUser = await ctx.db
    .query("tutorProfiles")
    .withIndex("by_userId", (q) => q.eq("userId", user._id))
    .first();
  if (byUser) return byUser;
  const email = (user.email ?? "").trim().toLowerCase();
  if (!email) return null;
  return ctx.db
    .query("tutorProfiles")
    .withIndex("by_email", (q) => q.eq("email", email))
    .first();
}

async function withUrls(ctx, verification) {
  if (!verification) return null;
  return {
    ...verification,
    idFrontUrl: await ctx.storage.getUrl(verification.idFrontStorageId),
    idBackUrl: verification.idBackStorageId
      ? await ctx.storage.getUrl(verification.idBackStorageId)
      : null,
    faceUrl: await ctx.storage.getUrl(verification.faceStorageId),
  };
}

/** Upload URL for ID scans and the face capture — applicants only. */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * State for the verification step of the application flow: whether an
 * application exists at all, and what the identity check looks like so far.
 */
export const myStatus = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const profile = await myProfile(ctx, user);
    if (!profile) return { application: null, verification: null };
    const verification = await ctx.db
      .query("tutorVerifications")
      .withIndex("by_profile", (q) => q.eq("profileId", profile._id))
      .first();
    return {
      application: {
        _id: profile._id,
        name: profile.name,
        email: profile.email,
        approvalStatus: profile.approvalStatus,
        rejectionReason: profile.rejectionReason ?? null,
        identityVerified: profile.identityVerified ?? false,
      },
      verification: await withUrls(ctx, verification),
    };
  },
});

/**
 * Step 2 of becoming a tutor: submit the ID document and the face scan.
 * Re-submitting after a rejection replaces the previous files.
 */
export const submit = mutation({
  args: {
    documentType,
    documentCountry: v.string(),
    documentNumber: v.string(),
    documentExpiry: v.optional(v.string()),
    fullNameOnDocument: v.string(),
    dateOfBirth: v.optional(v.string()),
    idFrontStorageId: v.id("_storage"),
    idBackStorageId: v.optional(v.id("_storage")),
    faceStorageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const profile = await myProfile(ctx, user);
    if (!profile) {
      throw new ConvexError(
        "We couldn't find a tutor application for this account. Please submit the application form first."
      );
    }
    const country = args.documentCountry.trim();
    const number = args.documentNumber.trim();
    const fullName = args.fullNameOnDocument.trim();
    if (!country) throw new ConvexError("Issuing country is required");
    if (number.length < 4) throw new ConvexError("Enter the document number as printed on your ID");
    if (fullName.length < 2) throw new ConvexError("Enter the full name exactly as printed on your ID");

    const existing = await ctx.db
      .query("tutorVerifications")
      .withIndex("by_profile", (q) => q.eq("profileId", profile._id))
      .first();
    if (existing?.status === "approved") {
      throw new ConvexError("Your identity is already verified.");
    }

    const fields = {
      profileId: profile._id,
      userId: user._id,
      email: profile.email,
      documentType: args.documentType,
      documentCountry: country,
      documentNumber: number,
      documentExpiry: args.documentExpiry || undefined,
      fullNameOnDocument: fullName,
      dateOfBirth: args.dateOfBirth || undefined,
      idFrontStorageId: args.idFrontStorageId,
      idBackStorageId: args.idBackStorageId,
      faceStorageId: args.faceStorageId,
      status: "pending",
      rejectionReason: undefined,
      submittedAt: Date.now(),
      reviewedAt: undefined,
      reviewedBy: undefined,
    };

    if (existing) {
      await ctx.db.patch(existing._id, fields);
      // Drop the superseded scans so rejected uploads don't linger in storage.
      const kept = new Set(
        [args.idFrontStorageId, args.idBackStorageId, args.faceStorageId].filter(Boolean)
      );
      for (const old of [
        existing.idFrontStorageId,
        existing.idBackStorageId,
        existing.faceStorageId,
      ]) {
        if (old && !kept.has(old)) {
          try {
            await ctx.storage.delete(old);
          } catch {
            // Already gone — nothing to clean up.
          }
        }
      }
    } else {
      await ctx.db.insert("tutorVerifications", fields);
    }

    const profilePatch = { identityVerified: false };
    if (!profile.userId) profilePatch.userId = user._id;
    await ctx.db.patch(profile._id, profilePatch);

    await ctx.scheduler.runAfter(0, internal.emails.sendTemplate, {
      to: [profile.email],
      template: "tutorIdentityReceived",
      params: { name: profile.name },
    });
    const adminEmail = process.env.ADMIN_EMAIL;
    if (adminEmail) {
      await ctx.scheduler.runAfter(0, internal.emails.sendTemplate, {
        to: [adminEmail],
        template: "tutorIdentityAdminAlert",
        params: {
          profileId: profile._id,
          name: profile.name,
          email: profile.email,
          fullNameOnDocument: fullName,
          documentLabel: DOCUMENT_LABELS[args.documentType] ?? args.documentType,
          documentCountry: country,
          documentNumber: number,
        },
      });
    }
    return { ok: true };
  },
});
