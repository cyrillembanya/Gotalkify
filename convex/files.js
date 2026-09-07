import { mutation } from "./_generated/server";
import { requireUser } from "./lib";

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

/** Upload URL for chat attachments — signed-in users only. */
export const generateChatUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});
