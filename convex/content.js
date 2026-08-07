import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin } from "./lib";

const locale = v.union(v.literal("en"), v.literal("fr"));
const pageSlug = v.union(v.literal("privacy"), v.literal("terms"));

/* ---------------------------------- FAQs --------------------------------- */

/** Public: published FAQs for a locale, in display order. */
export const listFaqs = query({
  args: { locale },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("faqs")
      .withIndex("by_locale", (q) => q.eq("locale", args.locale))
      .collect();
    return rows
      .filter((f) => f.published)
      .sort((a, b) => a.order - b.order)
      .map(({ _id, question, answer }) => ({ _id, question, answer }));
  },
});

/** Admin: all FAQs for a locale (drafts included). */
export const adminListFaqs = query({
  args: { locale },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const rows = await ctx.db
      .query("faqs")
      .withIndex("by_locale", (q) => q.eq("locale", args.locale))
      .collect();
    return rows.sort((a, b) => a.order - b.order);
  },
});

export const saveFaq = mutation({
  args: {
    id: v.optional(v.id("faqs")),
    locale,
    question: v.string(),
    answer: v.string(),
    order: v.number(),
    published: v.boolean(),
  },
  handler: async (ctx, { id, ...fields }) => {
    await requireAdmin(ctx);
    if (!fields.question.trim() || !fields.answer.trim()) {
      throw new Error("Question and answer are required");
    }
    if (id) {
      await ctx.db.patch(id, fields);
      return id;
    }
    return await ctx.db.insert("faqs", fields);
  },
});

export const deleteFaq = mutation({
  args: { id: v.id("faqs") },
  handler: async (ctx, { id }) => {
    await requireAdmin(ctx);
    await ctx.db.delete(id);
  },
});

/* ------------------------- Privacy / Terms pages ------------------------- */

/** Public: an editable page, or null when the admin hasn't customized it yet. */
export const getPage = query({
  args: { slug: pageSlug, locale },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sitePages")
      .withIndex("by_slug_locale", (q) =>
        q.eq("slug", args.slug).eq("locale", args.locale)
      )
      .first();
  },
});

/** Admin: create or update a page (upsert per slug+locale). */
export const savePage = mutation({
  args: {
    slug: pageSlug,
    locale,
    title: v.string(),
    subtitle: v.optional(v.string()),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    if (!args.title.trim() || !args.content.trim()) {
      throw new Error("Title and content are required");
    }
    const existing = await ctx.db
      .query("sitePages")
      .withIndex("by_slug_locale", (q) =>
        q.eq("slug", args.slug).eq("locale", args.locale)
      )
      .first();
    const fields = {
      title: args.title.trim(),
      subtitle: args.subtitle?.trim() || undefined,
      content: args.content,
      updatedAt: Date.now(),
    };
    if (existing) {
      await ctx.db.patch(existing._id, fields);
      return existing._id;
    }
    return await ctx.db.insert("sitePages", {
      slug: args.slug,
      locale: args.locale,
      ...fields,
    });
  },
});
