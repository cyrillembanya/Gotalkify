import { mutation } from "./_generated/server";

/**
 * Upload URL for avatars, tutor photos and intro videos.
 * Public because the tutor application form is open to visitors.
 */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});
