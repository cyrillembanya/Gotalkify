import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin } from "./lib";

const locale = v.union(v.literal("en"), v.literal("fr"));

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const byDateDesc = (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);

/** Public: published posts (without content) for the blog index. */
export const listForSite = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("blogPosts").collect();
    return rows
      .filter((p) => p.published)
      .sort(byDateDesc)
      .map(({ slug, title, description, date, locale }) => ({
        slug,
        title,
        description,
        date,
        locale,
      }));
  },
});

/** Public: a published post by slug, or null. */
export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const post = await ctx.db
      .query("blogPosts")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    if (!post || !post.published) return null;
    const { slug, title, description, date, locale, content } = post;
    return { slug, title, description, date, locale, content };
  },
});

/** Admin: all posts, drafts included, newest first. */
export const adminList = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db.query("blogPosts").collect();
    return rows.sort(byDateDesc);
  },
});

/** Admin: create or update a post. */
export const savePost = mutation({
  args: {
    id: v.optional(v.id("blogPosts")),
    slug: v.string(),
    locale,
    title: v.string(),
    description: v.string(),
    content: v.string(),
    date: v.string(),
    published: v.boolean(),
  },
  handler: async (ctx, { id, ...fields }) => {
    await requireAdmin(ctx);
    fields.slug = fields.slug.trim();
    fields.title = fields.title.trim();
    fields.description = fields.description.trim();
    if (!fields.title) throw new Error("Title is required");
    // Content may be HTML — an empty editor still produces tags like <p></p>.
    const contentText = fields.content
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .trim();
    if (!contentText && !/<(img|iframe|video)\b/i.test(fields.content)) {
      throw new Error("Content is required");
    }
    if (!SLUG_RE.test(fields.slug)) {
      throw new Error(
        "Slug must be lowercase letters, numbers and hyphens (e.g. my-first-post)"
      );
    }
    if (!DATE_RE.test(fields.date)) {
      throw new Error("Date must be in YYYY-MM-DD format");
    }
    const existing = await ctx.db
      .query("blogPosts")
      .withIndex("by_slug", (q) => q.eq("slug", fields.slug))
      .first();
    if (existing && existing._id !== id) {
      throw new Error("Another post already uses this slug");
    }
    const doc = { ...fields, updatedAt: Date.now() };
    if (id) {
      await ctx.db.patch(id, doc);
      return id;
    }
    return await ctx.db.insert("blogPosts", doc);
  },
});

export const deletePost = mutation({
  args: { id: v.id("blogPosts") },
  handler: async (ctx, { id }) => {
    await requireAdmin(ctx);
    await ctx.db.delete(id);
  },
});

/** Admin: public URL for an uploaded image, for embedding in post markdown. */
export const imageUrl = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => {
    await requireAdmin(ctx);
    const url = await ctx.storage.getUrl(storageId);
    if (!url) throw new Error("Upload not found");
    return url;
  },
});
