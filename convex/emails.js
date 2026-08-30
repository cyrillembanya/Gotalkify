import { internalAction, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { TEMPLATE_META } from "./emailMeta";

const BRAND = "GoTalkify";
const SITE = () => process.env.SITE_URL ?? "https://gotalkify.com";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "Mon 5 Jan 2026, 14:00 UTC" — deterministic, no ICU needed. */
export function fmtUTC(ms) {
  const d = new Date(ms);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${hh}:${mm} UTC`;
}

function money(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

function shell(title, bodyHtml) {
  return `<!doctype html><html><body style="margin:0;background:#F7F5F0;font-family:Arial,Helvetica,sans-serif;color:#14263F">
  <div style="max-width:560px;margin:0 auto;padding:24px">
    <div style="background:#16304F;border-radius:12px 12px 0 0;padding:20px 28px">
      <span style="color:#fff;font-size:20px;font-weight:bold">${BRAND}</span>
    </div>
    <div style="background:#ffffff;border-radius:0 0 12px 12px;padding:28px">
      <h2 style="margin:0 0 16px;font-size:18px;color:#0f172a">${title}</h2>
      ${bodyHtml}
      <p style="margin:24px 0 0;font-size:12px;color:#64748b">— The ${BRAND} team · <a href="${SITE()}" style="color:#3B8FC4">gotalkify.com</a></p>
    </div>
  </div></body></html>`;
}

const p = (text) => `<p style="margin:0 0 12px;font-size:14px;line-height:1.6">${text}</p>`;
const btn = (href, label) =>
  `<p style="margin:20px 0"><a href="${href}" style="background:#16304F;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:bold">${label}</a></p>`;

/** User-supplied text goes into these emails — escape it. */
const esc = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const multiline = (text) => esc(text).replace(/\r?\n/g, "<br/>");

/** Two-column label/value table; rows with an empty value are dropped. */
const details = (rows) =>
  `<table style="width:100%;border-collapse:collapse;margin:0 0 16px;font-size:14px">${rows
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 14px 6px 0;color:#64748b;vertical-align:top;white-space:nowrap">${esc(
          label
        )}</td><td style="padding:6px 0;color:#0f172a">${esc(value)}</td></tr>`
    )
    .join("")}</table>`;

/** A titled free-text block (bio, qualifications, rejection reasons…). */
const block = (title, text) =>
  text
    ? `<p style="margin:16px 0 4px;font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:.04em;color:#64748b">${esc(
        title
      )}</p>` + p(multiline(text))
    : "";

const LANGUAGE_LABELS = { en: "English", fr: "French" };
const listOf = (items, labels) =>
  (items ?? []).map((item) => labels?.[item] ?? item).join(", ");

/** Deep link that opens one application in the admin queue. */
const applicationUrl = (profileId) =>
  profileId
    ? `${SITE()}/dashboard/admin/applications?id=${encodeURIComponent(profileId)}`
    : `${SITE()}/dashboard/admin/applications`;

/**
 * Substitute {{placeholders}} from `params`. Numbers ending in "Cents" are
 * rendered as money and those ending in "UTC" as a UTC timestamp, so an
 * admin never has to think about raw values. `{{siteUrl}}` is always available.
 */
export function interpolate(text, params) {
  return String(text ?? "").replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key) => {
    if (key === "siteUrl") return SITE();
    const value = params?.[key];
    if (value === undefined || value === null || value === "") return "";
    if (Array.isArray(value)) return value.join(", ");
    if (typeof value === "boolean") return value ? "yes" : "no";
    if (typeof value === "number") {
      if (/Cents$/.test(key)) return money(value);
      if (/UTC$/.test(key)) return fmtUTC(value);
      return String(value);
    }
    return String(value);
  });
}

/** Admin-authored bodies are plain text: **bold** and blank-line paragraphs. */
function richText(text) {
  return esc(text)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\r?\n/g, "<br/>");
}

/** Render an admin-customised template. */
export function renderCustom(template, params) {
  const subject = interpolate(template.subject, params).trim();
  const heading = interpolate(template.heading, params);
  const paragraphs = interpolate(template.body, params)
    .split(/\r?\n\s*\r?\n/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => p(richText(part)))
    .join("");
  const label = interpolate(template.buttonLabel ?? "", params).trim();
  const href = interpolate(template.buttonUrl ?? "", params).trim();
  const button = label && href ? btn(esc(href), esc(label)) : "";
  return { subject, html: shell(esc(heading), paragraphs + button) };
}

/**
 * Build one email: an admin override wins, otherwise the built-in below.
 * Exported so the admin screen can preview exactly what will be sent.
 */
export function renderTemplate(key, params, override) {
  if (override) return renderCustom(override, params);
  const build = TEMPLATES[key];
  if (!build) throw new Error(`Unknown email template: ${key}`);
  return build(params ?? {});
}

/**
 * Template registry. Each returns { subject, html }.
 * All times in params are ms epoch and rendered in UTC (dashboards show local time).
 */
const TEMPLATES = {
  studentWelcome: ({ name }) => ({
    subject: `Welcome to ${BRAND}!`,
    html: shell(
      `Welcome, ${name || "there"}!`,
      p("Your student account is ready. Browse our native English and French tutors, watch their intro videos and book a trial lesson to get started.") +
        btn(`${SITE()}/tutors`, "Find your tutor")
    ),
  }),
  tutorApplicationReceived: ({ name }) => ({
    subject: "We received your tutor application",
    html: shell(
      `Thanks for applying, ${name}!`,
      p("Our team will review your application and get back to you shortly. You will receive an email once it has been approved or if we need more information.")
    ),
  }),
  tutorApplicationAdminAlert: ({
    profileId,
    name,
    email,
    headline,
    languagesTaught,
    nativeLanguages,
    nationality,
    currentLocation,
    specialties,
    hourlyRateCents,
    bio,
    qualifications,
    hasPhoto,
    hasVideo,
  }) => ({
    subject: `New tutor application: ${name}`,
    html: shell(
      "New tutor application",
      p(`<strong>${esc(name)}</strong> has applied to teach on ${BRAND}.`) +
        details([
          ["Name", name],
          ["Email", email],
          ["Headline", headline],
          ["Country of origin", nationality],
          ["Currently lives in", currentLocation],
          ["Teaches", listOf(languagesTaught, LANGUAGE_LABELS)],
          ["Native language(s)", listOf(nativeLanguages)],
          ["Specialties", listOf(specialties)],
          [
            "Hourly rate",
            typeof hourlyRateCents === "number" ? `${money(hourlyRateCents)} / hour` : "",
          ],
          ["Profile photo", hasPhoto ? "Uploaded" : "Not provided"],
          ["Intro video", hasVideo ? "Uploaded" : "Not provided"],
        ]) +
        block("About", bio) +
        block("Qualifications", qualifications) +
        p(
          "Identity verification (ID document + face scan) is their next step — you'll get a second email once it's ready to review."
        ) +
        btn(applicationUrl(profileId), "Open the application")
    ),
  }),
  tutorIdentityReceived: ({ name }) => ({
    subject: "We received your identity verification",
    html: shell(
      `Thanks, ${name}!`,
      p("Your ID document and face scan have been received. Our team reviews them alongside your application and will email you as soon as a decision is made — usually within one business day.")
    ),
  }),
  tutorIdentityAdminAlert: ({
    profileId,
    name,
    email,
    documentLabel,
    documentCountry,
    documentNumber,
    fullNameOnDocument,
  }) => ({
    subject: `Identity verification submitted: ${name}`,
    html: shell(
      "Tutor identity verification ready for review",
      p(
        `<strong>${esc(name)}</strong> uploaded their ID document and completed the face scan. The application is ready to approve or reject.`
      ) +
        details([
          ["Applicant", name],
          ["Email", email],
          ["Name on document", fullNameOnDocument],
          ["Document", documentLabel],
          ["Issuing country", documentCountry],
          ["Document number", documentNumber],
        ]) +
        p("Check that the face scan matches the photo on the ID before approving.") +
        btn(applicationUrl(profileId), "Open the application")
    ),
  }),
  tutorIdentityRejected: ({ name, reason }) => ({
    subject: "We need new identity documents",
    html: shell(
      `Hi ${name},`,
      p("We couldn't verify your identity with the documents you submitted, so your application is on hold until we receive new ones.") +
        (reason ? p(`<strong>Reason:</strong> ${reason}`) : "") +
        p("Please sign in and upload a clear photo of your ID and a new face scan.") +
        btn(`${SITE()}/apply/verify`, "Redo verification")
    ),
  }),
  tutorApproved: ({ name }) => ({
    subject: `You're approved — welcome to ${BRAND}!`,
    html: shell(
      `Congratulations, ${name}!`,
      p("Your tutor application has been approved and your profile is now live. Sign in with this email address to set your availability and connect your payout account.") +
        btn(`${SITE()}/register`, "Set up your account")
    ),
  }),
  tutorRejected: ({ name, reason }) => ({
    subject: "Update on your tutor application",
    html: shell(
      `Hi ${name},`,
      p("Thank you for your interest in teaching with us. Unfortunately we are unable to approve your application at this time.") +
        (reason ? p(`<strong>Reason:</strong> ${reason}`) : "")
    ),
  }),
  lessonBooked: ({ recipientName, otherName, whenUTC, joinUrl, isTrial, forTutor }) => ({
    subject: `${isTrial ? "Trial lesson" : "Lesson"} booked — ${fmtUTC(whenUTC)}`,
    html: shell(
      `Your ${isTrial ? "trial lesson" : "lesson"} is booked`,
      p(`Hi ${recipientName}, your ${isTrial ? "trial lesson" : "lesson"} ${forTutor ? "with student" : "with"} <strong>${otherName}</strong> is scheduled for <strong>${fmtUTC(whenUTC)}</strong> (shown in your local time on your dashboard).`) +
        p(`The class happens right here on ${BRAND} — no downloads, no extra accounts. Your private classroom opens 15 minutes before the start time.`) +
        btn(joinUrl, "Join the class") +
        p(`<span style="font-size:12px;color:#64748b">This link is private to you and ${otherName} — please don't share it.</span>`)
    ),
  }),
  lessonReminder: ({ recipientName, otherName, whenUTC, joinUrl, hoursBefore }) => ({
    subject: `Reminder: lesson in ${hoursBefore === 1 ? "1 hour" : "24 hours"}`,
    html: shell(
      "Upcoming lesson reminder",
      p(`Hi ${recipientName}, your lesson with <strong>${otherName}</strong> starts at <strong>${fmtUTC(whenUTC)}</strong>.`) +
        btn(joinUrl, "Join the class")
    ),
  }),
  lessonCancelled: ({ recipientName, otherName, whenUTC, byRole, refunded }) => ({
    subject: "Lesson cancelled",
    html: shell(
      "Lesson cancelled",
      p(`Hi ${recipientName}, the lesson with <strong>${otherName}</strong> on <strong>${fmtUTC(whenUTC)}</strong> was cancelled by the ${byRole}.`) +
        (refunded ? p("The lesson hour has been returned to the student's balance.") : "")
    ),
  }),
  lessonRescheduled: ({ recipientName, otherName, oldWhenUTC, newWhenUTC }) => ({
    subject: "Lesson rescheduled",
    html: shell(
      "Lesson rescheduled",
      p(`Hi ${recipientName}, your lesson with <strong>${otherName}</strong> has moved from ${fmtUTC(oldWhenUTC)} to <strong>${fmtUTC(newWhenUTC)}</strong>.`) +
        btn(`${SITE()}/dashboard`, "Open dashboard")
    ),
  }),
  confirmLessonPrompt: ({ recipientName, otherName, whenUTC }) => ({
    subject: "How was your lesson? Please confirm it",
    html: shell(
      "Confirm your lesson",
      p(`Hi ${recipientName}, your lesson with <strong>${otherName}</strong> on ${fmtUTC(whenUTC)} has ended. Please confirm it so your tutor can be paid. It will be confirmed automatically after 72 hours.`) +
        btn(`${SITE()}/dashboard/lessons`, "Confirm lesson")
    ),
  }),
  paymentReceipt: ({ recipientName, description, amountCents }) => ({
    subject: `Receipt — ${money(amountCents)}`,
    html: shell(
      "Payment receipt",
      p(`Hi ${recipientName}, we received your payment.`) +
        p(`<strong>${description}</strong>`) +
        p(`Amount: <strong>${money(amountCents)}</strong>`)
    ),
  }),
  payoutProcessed: ({ recipientName, amountCents }) => ({
    subject: `Payout of ${money(amountCents)} on the way`,
    html: shell(
      "Payout processed",
      p(`Hi ${recipientName}, your withdrawal of <strong>${money(amountCents)}</strong> has been sent to your connected account.`)
    ),
  }),
  inquiryAdminAlert: ({ name, email, program, message }) => ({
    subject: `New inquiry from ${name}`,
    html: shell(
      "New contact inquiry",
      p(`<strong>From:</strong> ${name} (${email})`) +
        (program ? p(`<strong>Program:</strong> ${program}`) : "") +
        p(`<strong>Message:</strong><br/>${message}`)
    ),
  }),
  inquiryAutoReply: ({ name }) => ({
    subject: `We got your message — ${BRAND}`,
    html: shell(
      `Thanks, ${name}!`,
      p("We received your inquiry and will get back to you within one business day.")
    ),
  }),
};

/**
 * Send a templated email via Resend. No-ops (with a log) when RESEND_API_KEY
 * is not configured, so development works without email credentials.
 */
/** The admin-edited version of a template, if one is saved and enabled. */
export const activeOverride = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const row = await ctx.db
      .query("emailTemplates")
      .withIndex("by_key", (q) => q.eq("key", key))
      .first();
    return row && row.enabled ? row : null;
  },
});

export const sendTemplate = internalAction({
  args: {
    to: v.array(v.string()),
    template: v.string(),
    params: v.any(),
  },
  handler: async (ctx, { to, template, params }) => {
    if (!TEMPLATES[template]) throw new Error(`Unknown email template: ${template}`);
    const override = await ctx.runQuery(internal.emails.activeOverride, {
      key: template,
    });
    const { subject, html } = renderTemplate(template, params ?? {}, override);
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey || to.length === 0) {
      console.log(`[emails] skipped "${template}" → ${to.join(", ")} (${subject})`);
      return { skipped: true };
    }
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM ?? "GoTalkify <hello@gotalkify.com>",
        to,
        subject,
        html,
      }),
    });
    if (!res.ok) {
      console.error(`[emails] Resend error ${res.status}: ${await res.text()}`);
      return { ok: false };
    }
    return { ok: true };
  },
});

/** Every template the platform can send, for the admin screen. */
export const TEMPLATE_NAMES = Object.keys(TEMPLATES);
