import { internalAction } from "./_generated/server";
import { v } from "convex/values";

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
  tutorApplicationAdminAlert: ({ name, email }) => ({
    subject: `New tutor application: ${name}`,
    html: shell(
      "New tutor application",
      p(`<strong>${name}</strong> (${email}) has applied to become a tutor.`) +
        btn(`${SITE()}/dashboard/admin/applications`, "Review application")
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
export const sendTemplate = internalAction({
  args: {
    to: v.array(v.string()),
    template: v.string(),
    params: v.any(),
  },
  handler: async (_ctx, { to, template, params }) => {
    const build = TEMPLATES[template];
    if (!build) throw new Error(`Unknown email template: ${template}`);
    const { subject, html } = build(params ?? {});
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
