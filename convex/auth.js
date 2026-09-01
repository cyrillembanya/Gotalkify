import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";
import Google from "@auth/core/providers/google";
import { internal } from "./_generated/api";
import { ResendOTP } from "./ResendOTP";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password({ verify: ResendOTP }), Google],
  callbacks: {
    async afterUserCreatedOrUpdated(ctx, { userId, existingUserId }) {
      const user = await ctx.db.get(userId);
      if (!user) return;

      const patch = {};
      if (!user.status) patch.status = "active";
      if (!user.locale) patch.locale = "en";
      // No timezone default: leaving it unset lets the first browser session
      // detect the real one (users.setTimezone with auto: true). Falling back
      // to a hard-coded "UTC" here is what made everyone see UTC times.

      if (!user.role) {
        // Bootstrap admins from a comma-separated env var on the deployment.
        const adminEmails = (process.env.ADMIN_EMAILS ?? "")
          .split(",")
          .map((e) => e.trim().toLowerCase())
          .filter(Boolean);
        patch.role =
          user.email && adminEmails.includes(user.email.toLowerCase())
            ? "admin"
            : "student";
      }

      // Link an approved tutor application submitted with this email.
      if (user.email) {
        const profile = await ctx.db
          .query("tutorProfiles")
          .withIndex("by_email", (q) => q.eq("email", user.email.toLowerCase()))
          .first();
        if (profile && !profile.userId) {
          await ctx.db.patch(profile._id, { userId });
          if (profile.approvalStatus === "approved") patch.role = "tutor";
          else if (patch.role === "student" || user.role === "student")
            patch.role = "tutor_applicant";
        }
      }

      if (Object.keys(patch).length > 0) await ctx.db.patch(userId, patch);

      // Welcome email on first registration.
      if (!existingUserId && user.email) {
        await ctx.scheduler.runAfter(0, internal.emails.sendTemplate, {
          to: [user.email],
          template: "studentWelcome",
          params: { name: user.name ?? "" },
        });
      }
    },
  },
});
