"use node";

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import crypto from "crypto";

/**
 * Google Meet links via the Calendar API, owned by one central platform
 * Google Workspace account (service account with domain-wide delegation).
 * All functions degrade gracefully when credentials are not configured.
 */

function credentials() {
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const organizer = process.env.GOOGLE_MEET_ORGANIZER_EMAIL;
  if (!json || !organizer) return null;
  try {
    return { serviceAccount: JSON.parse(json), organizer };
  } catch {
    console.error("[meet] GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON");
    return null;
  }
}

function base64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** OAuth2 access token via service-account JWT (domain-wide delegation). */
async function getAccessToken({ serviceAccount, organizer }) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: serviceAccount.client_email,
      sub: organizer, // impersonate the platform organizer account
      scope: "https://www.googleapis.com/auth/calendar",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })
  );
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const signature = signer
    .sign(serviceAccount.private_key, "base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const jwt = `${header}.${claims}.${signature}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) {
    throw new Error(`Google token error ${res.status}: ${await res.text()}`);
  }
  return (await res.json()).access_token;
}

async function calendarFetch(token, path, options = {}) {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events${path}`,
    {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(options.headers ?? {}),
      },
    }
  );
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(`Calendar API ${res.status}: ${await res.text()}`);
  }
  if (options.method === "DELETE") return null;
  return res.json().catch(() => null);
}

function eventBody(lesson, student, tutor) {
  return {
    summary: `GoTalkify ${lesson.type === "trial" ? "trial " : ""}lesson: ${student?.name ?? "Student"} & ${tutor?.name ?? "Tutor"}`,
    description: "Your GoTalkify lesson. Join with the Google Meet link.",
    start: { dateTime: new Date(lesson.startUTC).toISOString(), timeZone: "UTC" },
    end: { dateTime: new Date(lesson.endUTC).toISOString(), timeZone: "UTC" },
    attendees: [
      ...(student?.email ? [{ email: student.email }] : []),
      ...(tutor?.email ? [{ email: tutor.email }] : []),
    ],
    conferenceData: {
      createRequest: {
        requestId: String(lesson._id),
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    },
  };
}

/** Create the calendar event + Meet link, then send booking emails. */
export const createForLesson = internalAction({
  args: { lessonId: v.id("lessons") },
  handler: async (ctx, { lessonId }) => {
    const data = await ctx.runQuery(internal.lessons.getWithUsers, { lessonId });
    if (!data || data.lesson.status !== "scheduled") return;
    const { lesson, student, tutor } = data;

    let meetLink;
    let gcalEventId;
    const creds = credentials();
    if (creds) {
      try {
        const token = await getAccessToken(creds);
        const event = await calendarFetch(
          token,
          "?conferenceDataVersion=1&sendUpdates=none",
          { method: "POST", body: JSON.stringify(eventBody(lesson, student, tutor)) }
        );
        gcalEventId = event?.id;
        meetLink =
          event?.hangoutLink ??
          event?.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")?.uri;
        await ctx.runMutation(internal.lessons.setMeetInfo, {
          lessonId,
          meetLink,
          gcalEventId,
        });
      } catch (error) {
        console.error(`[meet] failed to create event: ${error.message}`);
      }
    } else {
      console.log("[meet] Google credentials not configured — skipping Meet link");
    }

    // Booking confirmation emails (with the link when available).
    const isTrial = lesson.type === "trial";
    if (student?.email) {
      await ctx.runAction(internal.emails.sendTemplate, {
        to: [student.email],
        template: "lessonBooked",
        params: {
          recipientName: student.name ?? "there",
          otherName: tutor?.name ?? "your tutor",
          whenUTC: lesson.startUTC,
          meetLink,
          isTrial,
        },
      });
    }
    if (tutor?.email) {
      await ctx.runAction(internal.emails.sendTemplate, {
        to: [tutor.email],
        template: "lessonBooked",
        params: {
          recipientName: tutor.name ?? "there",
          otherName: student?.name ?? "your student",
          whenUTC: lesson.startUTC,
          meetLink,
          isTrial,
          forTutor: true,
        },
      });
    }
  },
});

/** Move the calendar event after a reschedule. */
export const updateForLesson = internalAction({
  args: { lessonId: v.id("lessons") },
  handler: async (ctx, { lessonId }) => {
    const data = await ctx.runQuery(internal.lessons.getWithUsers, { lessonId });
    if (!data?.lesson.gcalEventId) return;
    const creds = credentials();
    if (!creds) return;
    try {
      const token = await getAccessToken(creds);
      await calendarFetch(token, `/${data.lesson.gcalEventId}?sendUpdates=none`, {
        method: "PATCH",
        body: JSON.stringify({
          start: { dateTime: new Date(data.lesson.startUTC).toISOString(), timeZone: "UTC" },
          end: { dateTime: new Date(data.lesson.endUTC).toISOString(), timeZone: "UTC" },
        }),
      });
    } catch (error) {
      console.error(`[meet] failed to update event: ${error.message}`);
    }
  },
});

/** Delete the calendar event after a cancellation. */
export const deleteForLesson = internalAction({
  args: { gcalEventId: v.string() },
  handler: async (_ctx, { gcalEventId }) => {
    const creds = credentials();
    if (!creds) return;
    try {
      const token = await getAccessToken(creds);
      await calendarFetch(token, `/${gcalEventId}?sendUpdates=none`, {
        method: "DELETE",
      });
    } catch (error) {
      console.error(`[meet] failed to delete event: ${error.message}`);
    }
  },
});
