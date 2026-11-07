/**
 * Admin screen for the transactional emails: list every template, edit the
 * copy, preview exactly what will be sent, and reset back to the built-in.
 */

import { query, mutation } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { requireAdmin } from "./lib";
import { TEMPLATE_META, TEMPLATE_KEYS } from "./emailMeta";
import { renderTemplate } from "./emails";

const draftFields = {
  subject: v.string(),
  heading: v.string(),
  body: v.string(),
  buttonLabel: v.optional(v.string()),
  buttonUrl: v.optional(v.string()),
};

function metaFor(key) {
  const meta = TEMPLATE_META[key];
  if (!meta) throw new ConvexError(`Unknown email template: ${key}`);
  return meta;
}

/** Placeholder names an admin may use in this template. */
function placeholders(meta) {
  return ["siteUrl", ...Object.keys(meta.params ?? {})];
}

/** Every template, with its saved override (if any) and its default copy. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const saved = await ctx.db.query("emailTemplates").collect();
    const byKey = new Map(saved.map((row) => [row.key, row]));

    const result = [];
    for (const key of TEMPLATE_KEYS) {
      const meta = TEMPLATE_META[key];
      const override = byKey.get(key) ?? null;
      let updatedByName = null;
      if (override?.updatedBy) {
        const admin = await ctx.db.get(override.updatedBy);
        updatedByName = admin?.name ?? admin?.email ?? null;
      }
      result.push({
        key,
        label: meta.label,
        description: meta.description,
        audience: meta.audience,
        placeholders: placeholders(meta),
        defaults: meta.editable,
        customised: Boolean(override),
        enabled: override ? override.enabled : false,
        updatedAt: override?.updatedAt ?? null,
        updatedByName,
        current: override
          ? {
              subject: override.subject,
              heading: override.heading,
              body: override.body,
              buttonLabel: override.buttonLabel ?? "",
              buttonUrl: override.buttonUrl ?? "",
            }
          : {
              subject: meta.editable.subject,
              heading: meta.editable.heading,
              body: meta.editable.body,
              buttonLabel: meta.editable.buttonLabel ?? "",
              buttonUrl: meta.editable.buttonUrl ?? "",
            },
      });
    }
    return result;
  },
});

/**
 * Render a draft with the template's sample values. Passing no draft previews
 * what is actually being sent today (override if enabled, else built-in).
 */
export const preview = query({
  args: {
    key: v.string(),
    draft: v.optional(v.object(draftFields)),
  },
  handler: async (ctx, { key, draft }) => {
    await requireAdmin(ctx);
    const meta = metaFor(key);
    const params = meta.params ?? {};
    if (draft) {
      return { ...renderTemplate(key, params, draft), source: "draft" };
    }
    const override = await ctx.db
      .query("emailTemplates")
      .withIndex("by_key", (q) => q.eq("key", key))
      .first();
    const active = override && override.enabled ? override : null;
    return {
      ...renderTemplate(key, params, active),
      source: active ? "custom" : "default",
    };
  },
});

/** Save (or update) the admin's version of one template. */
export const save = mutation({
  args: { key: v.string(), ...draftFields, enabled: v.optional(v.boolean()) },
  handler: async (ctx, { key, enabled, ...draft }) => {
    const admin = await requireAdmin(ctx);
    metaFor(key);
    if (!draft.subject.trim()) throw new ConvexError("Subject can't be empty");
    if (!draft.body.trim()) throw new ConvexError("Email body can't be empty");
    if (draft.buttonLabel?.trim() && !draft.buttonUrl?.trim()) {
      throw new ConvexError("Give the button a link, or clear the button label");
    }

    const existing = await ctx.db
      .query("emailTemplates")
      .withIndex("by_key", (q) => q.eq("key", key))
      .first();
    const fields = {
      key,
      subject: draft.subject.trim(),
      heading: draft.heading.trim(),
      body: draft.body,
      buttonLabel: draft.buttonLabel?.trim() || undefined,
      buttonUrl: draft.buttonUrl?.trim() || undefined,
      enabled: enabled ?? existing?.enabled ?? true,
      updatedAt: Date.now(),
      updatedBy: admin._id,
    };
    if (existing) await ctx.db.patch(existing._id, fields);
    else await ctx.db.insert("emailTemplates", fields);
    return { ok: true };
  },
});

/** Turn a saved override on or off without losing the edited copy. */
export const setEnabled = mutation({
  args: { key: v.string(), enabled: v.boolean() },
  handler: async (ctx, { key, enabled }) => {
    const admin = await requireAdmin(ctx);
    const existing = await ctx.db
      .query("emailTemplates")
      .withIndex("by_key", (q) => q.eq("key", key))
      .first();
    if (!existing) throw new ConvexError("This template hasn't been customised yet");
    await ctx.db.patch(existing._id, {
      enabled,
      updatedAt: Date.now(),
      updatedBy: admin._id,
    });
    return { ok: true };
  },
});

/** Discard the override entirely — the built-in copy takes over again. */
export const resetToDefault = mutation({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    await requireAdmin(ctx);
    const existing = await ctx.db
      .query("emailTemplates")
      .withIndex("by_key", (q) => q.eq("key", key))
      .first();
    if (existing) await ctx.db.delete(existing._id);
    return { ok: true };
  },
});
