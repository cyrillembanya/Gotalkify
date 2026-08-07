import { query, mutation, action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

async function verifyTurnstile(token) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true; // not configured — allow (dev)
  const res = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, response: token ?? "" }),
    }
  );
  const outcome = await res.json();
  return !!outcome.success;
}

/** Contact form → stored + admin email + auto-reply. */
export const submitInquiry = action({
  args: {
    name: v.string(),
    email: v.string(),
    message: v.string(),
    program: v.optional(v.string()),
    turnstileToken: v.optional(v.string()),
  },
  handler: async (ctx, { name, email, message, program, turnstileToken }) => {
    if (!(await verifyTurnstile(turnstileToken))) {
      throw new Error("CAPTCHA verification failed");
    }
    if (!name.trim() || !email.includes("@") || !message.trim()) {
      throw new Error("Please fill in all fields");
    }
    await ctx.runMutation(internal.marketing.insertInquiry, {
      name: name.trim(),
      email: email.trim(),
      message: message.trim().slice(0, 5000),
      program,
    });
    const adminEmail = process.env.ADMIN_EMAIL;
    if (adminEmail) {
      await ctx.runAction(internal.emails.sendTemplate, {
        to: [adminEmail],
        template: "inquiryAdminAlert",
        params: { name, email, program, message },
      });
    }
    await ctx.runAction(internal.emails.sendTemplate, {
      to: [email.trim()],
      template: "inquiryAutoReply",
      params: { name: name.trim() },
    });
    return { ok: true };
  },
});

export const insertInquiry = internalMutation({
  args: {
    name: v.string(),
    email: v.string(),
    message: v.string(),
    program: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("inquiries", {
      ...args,
      status: "new",
      createdAt: Date.now(),
    });
  },
});

export const subscribeNewsletter = mutation({
  args: { email: v.string(), locale: v.optional(v.string()) },
  handler: async (ctx, { email, locale }) => {
    const normalized = email.trim().toLowerCase();
    if (!normalized.includes("@") || normalized.length < 5) {
      throw new Error("Invalid email address");
    }
    const existing = await ctx.db
      .query("newsletterSubscribers")
      .withIndex("by_email", (q) => q.eq("email", normalized))
      .first();
    if (existing) return { ok: true, already: true };
    await ctx.db.insert("newsletterSubscribers", {
      email: normalized,
      locale: locale ?? "en",
      createdAt: Date.now(),
    });
    return { ok: true };
  },
});

/** Published testimonials for the marketing site. */
export const testimonials = query({
  args: {},
  handler: async (ctx) => {
    const items = await ctx.db
      .query("testimonials")
      .withIndex("by_published", (q) => q.eq("published", true))
      .collect();
    items.sort((a, b) => a.order - b.order);
    const result = [];
    for (const item of items) {
      result.push({
        _id: item._id,
        name: item.name,
        text: item.text,
        photoUrl: item.photoStorageId
          ? await ctx.storage.getUrl(item.photoStorageId)
          : null,
      });
    }
    return result;
  },
});
