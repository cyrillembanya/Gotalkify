import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

const lessonStatus = v.union(
  v.literal("scheduled"),
  v.literal("completed"),
  v.literal("confirmed"),
  v.literal("cancelled_student"),
  v.literal("cancelled_tutor"),
  v.literal("noshow_student"),
  v.literal("noshow_tutor")
);

export default defineSchema({
  ...authTables,

  users: defineTable({
    // Convex Auth managed fields
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    image: v.optional(v.string()),
    isAnonymous: v.optional(v.boolean()),
    // GoTalkify fields
    role: v.optional(
      v.union(
        v.literal("student"),
        v.literal("tutor"),
        v.literal("tutor_applicant"),
        v.literal("admin")
      )
    ),
    timezone: v.optional(v.string()), // IANA zone; all times are displayed in it
    // "auto" = detected from the browser and kept in sync; "manual" = the user
    // picked it themselves, so detection must not overwrite it.
    timezoneSource: v.optional(v.union(v.literal("auto"), v.literal("manual"))),
    locale: v.optional(v.string()),
    status: v.optional(
      v.union(v.literal("active"), v.literal("suspended"), v.literal("deleted"))
    ),
    avatarStorageId: v.optional(v.id("_storage")),
    learningLanguage: v.optional(v.string()),
    level: v.optional(v.string()),
    goals: v.optional(v.string()),
    stripeCustomerId: v.optional(v.string()),
  }).index("email", ["email"]),

  tutorProfiles: defineTable({
    userId: v.optional(v.id("users")),
    name: v.string(),
    email: v.string(), // lowercase; used to link the account after approval
    bio: v.string(),
    headline: v.optional(v.string()),
    languagesTaught: v.array(v.union(v.literal("en"), v.literal("fr"))),
    nativeLanguages: v.array(v.string()),
    // Country of origin (compulsory on new applications) and where they live now.
    nationality: v.optional(v.string()),
    currentLocation: v.optional(v.string()),
    specialties: v.array(v.string()),
    hourlyRateCents: v.number(),
    introVideoStorageId: v.optional(v.id("_storage")),
    photoStorageId: v.optional(v.id("_storage")),
    qualifications: v.string(),
    approvalStatus: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected")
    ),
    rejectionReason: v.optional(v.string()),
    stripeConnectAccountId: v.optional(v.string()),
    stripeConnectOnboarded: v.optional(v.boolean()),
    rating: v.optional(v.number()),
    reviewCount: v.optional(v.number()),
    cancellationCount: v.optional(v.number()),
    flaggedForCancellations: v.optional(v.boolean()),
    // Set once an admin has approved the applicant's ID + face scan.
    identityVerified: v.optional(v.boolean()),
  })
    .index("by_userId", ["userId"])
    .index("by_email", ["email"])
    .index("by_approvalStatus", ["approvalStatus"])
    .index("by_connectAccount", ["stripeConnectAccountId"]),

  /**
   * Identity check a tutor applicant completes straight after the application
   * form: a government ID (front, plus back where the document has one) and a
   * live face scan captured from their camera. An admin compares the two and
   * approves or rejects the application from the same screen.
   */
  tutorVerifications: defineTable({
    profileId: v.id("tutorProfiles"),
    userId: v.optional(v.id("users")),
    email: v.string(), // lowercase, mirrors the profile
    documentType: v.union(
      v.literal("passport"),
      v.literal("national_id"),
      v.literal("drivers_license"),
      v.literal("residence_permit")
    ),
    documentCountry: v.string(),
    documentNumber: v.string(),
    documentExpiry: v.optional(v.string()), // "YYYY-MM-DD"
    fullNameOnDocument: v.string(),
    dateOfBirth: v.optional(v.string()), // "YYYY-MM-DD"
    idFrontStorageId: v.id("_storage"),
    idBackStorageId: v.optional(v.id("_storage")),
    faceStorageId: v.id("_storage"), // frame captured from the live camera
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected")
    ),
    rejectionReason: v.optional(v.string()),
    submittedAt: v.number(),
    reviewedAt: v.optional(v.number()),
    reviewedBy: v.optional(v.id("users")),
  })
    .index("by_profile", ["profileId"])
    .index("by_userId", ["userId"])
    .index("by_status", ["status"]),

  // Availability is stored as the tutor's own wall-clock time plus the zone it
  // was written in, so "Mon 09:00" stays 09:00 for them across DST — and each
  // occurrence resolves to a different UTC instant, which is what students see
  // converted into their own zone. Rows written before this (UTC weekday +
  // minutes, no `timezone`) are still read, and `availability.migrateToLocal`
  // rewrites them.
  availabilityRules: defineTable({
    tutorId: v.id("users"),
    weekday: v.number(), // 0 (Sun) – 6 (Sat), in `timezone`
    startMinute: v.optional(v.number()), // minutes from local midnight, 0–1439
    endMinute: v.optional(v.number()), // exclusive, 1–1440
    timezone: v.optional(v.string()), // zone the minutes above are written in
    startMinuteUTC: v.optional(v.number()), // legacy
    endMinuteUTC: v.optional(v.number()), // legacy
  }).index("by_tutor", ["tutorId"]),

  availabilityOverrides: defineTable({
    tutorId: v.id("users"),
    date: v.string(), // "YYYY-MM-DD" in `timezone` (UTC on legacy rows)
    type: v.union(v.literal("extra"), v.literal("blocked")),
    startMinute: v.optional(v.number()),
    endMinute: v.optional(v.number()),
    timezone: v.optional(v.string()),
    startMinuteUTC: v.optional(v.number()), // legacy
    endMinuteUTC: v.optional(v.number()), // legacy
  }).index("by_tutor_date", ["tutorId", "date"]),

  lessons: defineTable({
    studentId: v.id("users"),
    tutorId: v.id("users"),
    startUTC: v.number(), // ms epoch
    endUTC: v.number(),
    type: v.union(v.literal("trial"), v.literal("regular")),
    status: lessonStatus,
    lateCancel: v.optional(v.boolean()), // cancelled_student inside the window → forfeit
    // Unguessable 128-bit token addressing the built-in video room: /class/<roomId>.
    roomId: v.optional(v.string()),
    // Legacy Google Meet fields, kept so historic documents keep validating.
    meetLink: v.optional(v.string()),
    gcalEventId: v.optional(v.string()),
    priceCents: v.number(), // value released on confirmation (purchase rate)
    commissionCents: v.optional(v.number()),
    recurringGroupId: v.optional(v.string()),
    confirmedAt: v.optional(v.number()),
    confirmedBy: v.optional(v.union(v.literal("student"), v.literal("auto"))),
    cancelledAt: v.optional(v.number()),
    cancelReason: v.optional(v.string()),
    reminded24h: v.optional(v.boolean()),
    reminded1h: v.optional(v.boolean()),
    confirmEmailSent: v.optional(v.boolean()),
    payoutReleased: v.optional(v.boolean()),
  })
    .index("by_tutor_start", ["tutorId", "startUTC"])
    .index("by_student_start", ["studentId", "startUTC"])
    .index("by_status_end", ["status", "endUTC"])
    .index("by_status_start", ["status", "startUTC"])
    .index("by_recurringGroup", ["recurringGroupId"])
    .index("by_roomId", ["roomId"]),

  /* --------------------------- built-in video classroom -------------------------- */

  /**
   * One row per browser tab currently in (or recently in) a class room.
   * Liveness is a heartbeat: a peer whose `lastSeenAt` has gone stale is
   * treated as gone by every other client.
   */
  videoParticipants: defineTable({
    roomId: v.string(),
    lessonId: v.id("lessons"),
    userId: v.id("users"),
    peerId: v.string(), // random per tab; the WebRTC signalling address
    name: v.string(),
    role: v.union(v.literal("tutor"), v.literal("student"), v.literal("admin")),
    joinedAt: v.number(),
    lastSeenAt: v.number(),
    micOn: v.boolean(),
    camOn: v.boolean(),
    sharing: v.boolean(),
    left: v.boolean(),
  })
    .index("by_room", ["roomId"])
    .index("by_room_peer", ["roomId", "peerId"])
    .index("by_lastSeenAt", ["lastSeenAt"]),

  /**
   * WebRTC signalling mailbox. Rows are written by the sender, read by the
   * addressee through a reactive query, and deleted as soon as they are
   * applied (a sweeper cron removes anything undelivered).
   */
  videoSignals: defineTable({
    roomId: v.string(),
    fromPeer: v.string(),
    toPeer: v.string(),
    kind: v.union(
      v.literal("offer"),
      v.literal("answer"),
      v.literal("candidate"),
      v.literal("bye")
    ),
    payload: v.string(), // JSON
    createdAt: v.number(),
  })
    .index("by_room_target", ["roomId", "toPeer", "createdAt"])
    .index("by_createdAt", ["createdAt"]),

  /** In-class text chat (links, spellings, corrections during a lesson). */
  videoChat: defineTable({
    roomId: v.string(),
    userId: v.id("users"),
    name: v.string(),
    text: v.string(),
    sentAt: v.number(),
  })
    .index("by_room", ["roomId", "sentAt"])
    .index("by_sentAt", ["sentAt"]),

  hourBalances: defineTable({
    studentId: v.id("users"),
    tutorId: v.id("users"),
    minutesRemaining: v.number(),
    purchaseRateCents: v.number(), // rate the hours were bought at (latest purchase)
  })
    .index("by_student_tutor", ["studentId", "tutorId"])
    .index("by_student", ["studentId"])
    .index("by_tutor", ["tutorId"]),

  balanceEntries: defineTable({
    balanceId: v.id("hourBalances"),
    deltaMinutes: v.number(),
    reason: v.union(
      v.literal("purchase"),
      v.literal("subscription_renewal"),
      v.literal("booking"),
      v.literal("refund"),
      v.literal("transfer"),
      v.literal("admin_adjustment")
    ),
    lessonId: v.optional(v.id("lessons")),
    purchaseId: v.optional(v.id("purchases")),
    note: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_balance", ["balanceId"]),

  purchases: defineTable({
    studentId: v.id("users"),
    tutorId: v.id("users"),
    kind: v.union(
      v.literal("trial"),
      v.literal("package"),
      v.literal("subscription_cycle")
    ),
    hours: v.number(),
    amountCents: v.number(),
    stripeSessionId: v.optional(v.string()),
    stripeInvoiceId: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("paid"),
      v.literal("conflict"), // paid but the slot was taken meanwhile — admin resolves
      v.literal("failed")
    ),
    lessonStartUTC: v.optional(v.number()), // trial checkouts carry the chosen slot
    createdAt: v.number(),
  })
    .index("by_student", ["studentId"])
    .index("by_session", ["stripeSessionId"])
    .index("by_invoice", ["stripeInvoiceId"]),

  subscriptions: defineTable({
    studentId: v.id("users"),
    tutorId: v.id("users"),
    stripeSubscriptionId: v.string(),
    hoursPerCycle: v.number(),
    status: v.union(
      v.literal("active"),
      v.literal("cancelled"),
      v.literal("past_due")
    ),
    currentPeriodEnd: v.optional(v.number()),
  })
    .index("by_student", ["studentId"])
    .index("by_stripeSubscription", ["stripeSubscriptionId"]),

  walletEntries: defineTable({
    tutorId: v.id("users"),
    lessonId: v.optional(v.id("lessons")),
    payoutId: v.optional(v.id("payouts")),
    amountCents: v.number(),
    type: v.union(v.literal("earning"), v.literal("withdrawal")),
    status: v.union(
      v.literal("available"),
      v.literal("locked"),
      v.literal("paid")
    ),
    createdAt: v.number(),
  })
    .index("by_tutor", ["tutorId"])
    .index("by_tutor_status", ["tutorId", "status"])
    .index("by_lesson", ["lessonId"]),

  payouts: defineTable({
    tutorId: v.id("users"),
    amountCents: v.number(),
    stripeTransferId: v.optional(v.string()),
    status: v.union(
      v.literal("processing"),
      v.literal("paid"),
      v.literal("failed")
    ),
    createdAt: v.number(),
  }).index("by_tutor", ["tutorId"]),

  conversations: defineTable({
    studentId: v.id("users"),
    tutorId: v.id("users"),
    lastMessageAt: v.number(),
    lastMessagePreview: v.optional(v.string()),
    studentUnread: v.number(),
    tutorUnread: v.number(),
  })
    .index("by_pair", ["studentId", "tutorId"])
    .index("by_student", ["studentId"])
    .index("by_tutor", ["tutorId"]),

  messages: defineTable({
    conversationId: v.id("conversations"),
    senderId: v.id("users"),
    body: v.string(),
    sentAt: v.number(),
    readAt: v.optional(v.number()),
  }).index("by_conversation", ["conversationId", "sentAt"]),

  reviews: defineTable({
    studentId: v.id("users"),
    tutorId: v.id("users"),
    lessonId: v.id("lessons"),
    rating: v.number(), // 1–5
    text: v.string(),
    createdAt: v.number(),
  })
    .index("by_tutor", ["tutorId"])
    .index("by_lesson", ["lessonId"])
    .index("by_student", ["studentId"]),

  inquiries: defineTable({
    name: v.string(),
    email: v.string(),
    message: v.string(),
    program: v.optional(v.string()),
    status: v.union(v.literal("new"), v.literal("handled")),
    createdAt: v.number(),
  }).index("by_status", ["status"]),

  newsletterSubscribers: defineTable({
    email: v.string(),
    locale: v.string(),
    createdAt: v.number(),
  }).index("by_email", ["email"]),

  testimonials: defineTable({
    name: v.string(),
    text: v.string(),
    photoStorageId: v.optional(v.id("_storage")),
    published: v.boolean(),
    order: v.number(),
  }).index("by_published", ["published", "order"]),

  /**
   * Admin-edited overrides for the transactional emails in convex/emails.js.
   * A row exists only once a template has been customised; deleting it (or
   * disabling it) restores the built-in copy. Bodies are plain text with
   * {{placeholders}} and **bold**, rendered into the standard branded shell.
   */
  emailTemplates: defineTable({
    key: v.string(), // template name, e.g. "tutorApproved"
    subject: v.string(),
    heading: v.string(),
    body: v.string(),
    buttonLabel: v.optional(v.string()),
    buttonUrl: v.optional(v.string()),
    enabled: v.boolean(), // false = keep the row but send the built-in version
    updatedAt: v.number(),
    updatedBy: v.optional(v.id("users")),
  }).index("by_key", ["key"]),

  settings: defineTable({
    commissionPercent: v.number(),
    cancellationWindowHours: v.number(),
    confirmationWindowHours: v.number(),
    minNoticeHours: v.number(),
  }),

  faqs: defineTable({
    locale: v.union(v.literal("en"), v.literal("fr")),
    question: v.string(),
    answer: v.string(),
    order: v.number(),
    published: v.boolean(),
  }).index("by_locale", ["locale", "order"]),

  // Admin-authored blog posts (markdown). A stored slug overrides the
  // built-in content/blog/*.mdx file with the same slug.
  blogPosts: defineTable({
    slug: v.string(),
    locale: v.union(v.literal("en"), v.literal("fr")),
    title: v.string(),
    description: v.string(),
    content: v.string(), // markdown
    date: v.string(), // "YYYY-MM-DD" display date
    published: v.boolean(),
    updatedAt: v.number(),
  }).index("by_slug", ["slug"]),

  // Admin-editable static pages (privacy policy, terms & conditions).
  sitePages: defineTable({
    slug: v.union(v.literal("privacy"), v.literal("terms")),
    locale: v.union(v.literal("en"), v.literal("fr")),
    title: v.string(),
    subtitle: v.optional(v.string()), // e.g. "Last updated: July 2026"
    content: v.string(), // "## Heading" lines start sections; blank lines split paragraphs
    updatedAt: v.number(),
  }).index("by_slug_locale", ["slug", "locale"]),
});
