/**
 * Catalogue of every transactional email the platform sends.
 *
 * `emails.js` holds the built-in rendering (with generated tables and
 * conditional wording); this file describes each template for the admin
 * screen — what it is, when it goes out, which placeholders it accepts, and
 * an editable plain-text starting point used when an admin customises it.
 *
 * `params` doubles as the placeholder list and as the sample values used for
 * the preview, so adding a key here immediately makes it available in the
 * editor. `{{siteUrl}}` is always available on top of these.
 *
 * A placeholder whose name ends in "UTC" is rendered in the recipient's own
 * timezone (the `timezone` param each send carries), with the zone named — so
 * one lesson goes out as 15:00 to New York and 21:00 to Paris. The samples
 * below preview that with a Paris recipient.
 */

const SAMPLE_LESSON_UTC = Date.UTC(2026, 2, 17, 14, 0);
const SAMPLE_TIMEZONE = "Europe/Paris";

export const TEMPLATE_META = {
  studentWelcome: {
    label: "Student welcome",
    description: "Sent to a student right after they create their account.",
    audience: "Student",
    params: { name: "Alex" },
    editable: {
      subject: "Welcome to GoTalkify!",
      heading: "Welcome, {{name}}!",
      body: "Your student account is ready. Browse our native English and French tutors, watch their intro videos and book a trial lesson to get started.",
      buttonLabel: "Find your tutor",
      buttonUrl: "{{siteUrl}}/tutors",
    },
  },

  tutorApplicationReceived: {
    label: "Tutor application received",
    description: "Confirmation to an applicant once their application form is submitted.",
    audience: "Tutor applicant",
    params: { name: "Marie Dupont" },
    editable: {
      subject: "We received your tutor application",
      heading: "Thanks for applying, {{name}}!",
      body: "Our team will review your application and get back to you shortly. You will receive an email once it has been approved or if we need more information.",
    },
  },

  tutorApplicationAdminAlert: {
    label: "New application (admin alert)",
    description:
      "Sent to ADMIN_EMAIL when someone submits the tutor application form. Includes the full application and a link that opens it.",
    audience: "Admin",
    params: {
      profileId: "j57example",
      name: "Marie Dupont",
      email: "marie@example.com",
      headline: "DELF examiner with 10 years of experience",
      nationality: "France",
      currentLocation: "Canada",
      languagesTaught: ["fr", "en"],
      nativeLanguages: ["French"],
      specialties: ["Business French", "DELF prep"],
      hourlyRateCents: 3200,
      bio: "I have taught French to professionals for ten years.",
      qualifications: "MA Linguistics, DELF examiner",
    },
    editable: {
      subject: "New tutor application: {{name}}",
      heading: "New tutor application",
      body: "**{{name}}** has applied to teach on GoTalkify.\n\nEmail: {{email}}\nHeadline: {{headline}}\nCountry of origin: {{nationality}}\nCurrently lives in: {{currentLocation}}\nTeaches: {{languagesTaught}}\nNative language(s): {{nativeLanguages}}\nSpecialties: {{specialties}}\nHourly rate: {{hourlyRateCents}}\n\n**About**\n{{bio}}\n\n**Qualifications**\n{{qualifications}}",
      buttonLabel: "Open the application",
      buttonUrl: "{{siteUrl}}/dashboard/admin/applications?id={{profileId}}",
    },
  },

  tutorIdentityReceived: {
    label: "Identity verification received",
    description:
      "Confirmation to the applicant after they upload their ID document and complete the face scan.",
    audience: "Tutor applicant",
    params: { name: "Marie Dupont" },
    editable: {
      subject: "We received your identity verification",
      heading: "Thanks, {{name}}!",
      body: "Your ID document and face scan have been received. Our team reviews them alongside your application and will email you as soon as a decision is made — usually within one business day.",
    },
  },

  tutorIdentityAdminAlert: {
    label: "Identity verification submitted (admin alert)",
    description:
      "Sent to ADMIN_EMAIL when an applicant finishes the ID + face scan, so the application can be approved or rejected.",
    audience: "Admin",
    params: {
      profileId: "j57example",
      name: "Marie Dupont",
      email: "marie@example.com",
      fullNameOnDocument: "Marie Camille Dupont",
      documentLabel: "Passport",
      documentCountry: "France",
      documentNumber: "X1234567",
    },
    editable: {
      subject: "Identity verification submitted: {{name}}",
      heading: "Tutor identity verification ready for review",
      body: "**{{name}}** uploaded their ID document and completed the face scan. The application is ready to approve or reject.\n\nEmail: {{email}}\nName on document: {{fullNameOnDocument}}\nDocument: {{documentLabel}}\nIssuing country: {{documentCountry}}\nDocument number: {{documentNumber}}\n\nCheck that the face scan matches the photo on the ID before approving.",
      buttonLabel: "Open the application",
      buttonUrl: "{{siteUrl}}/dashboard/admin/applications?id={{profileId}}",
    },
  },

  tutorIdentityRejected: {
    label: "New identity documents requested",
    description:
      "Sent when an admin asks an applicant for a new ID photo or face scan. The application stays pending.",
    audience: "Tutor applicant",
    params: { name: "Marie Dupont", reason: "The photo of your ID is blurry." },
    editable: {
      subject: "We need new identity documents",
      heading: "Hi {{name}},",
      body: "We couldn't verify your identity with the documents you submitted, so your application is on hold until we receive new ones.\n\n**Reason:** {{reason}}\n\nPlease sign in and upload a clear photo of your ID and a new face scan.",
      buttonLabel: "Redo verification",
      buttonUrl: "{{siteUrl}}/apply/verify",
    },
  },

  tutorApproved: {
    label: "Tutor approved",
    description: "Sent when an admin approves a tutor application and the profile goes live.",
    audience: "Tutor",
    params: { name: "Marie Dupont" },
    editable: {
      subject: "You're approved — welcome to GoTalkify!",
      heading: "Congratulations, {{name}}!",
      body: "Your tutor application has been approved and your profile is now live. Sign in with this email address to set your availability and connect your payout account.",
      buttonLabel: "Set up your account",
      buttonUrl: "{{siteUrl}}/register",
    },
  },

  tutorRejected: {
    label: "Tutor application rejected",
    description: "Sent when an admin rejects a tutor application, with the reason they gave.",
    audience: "Tutor applicant",
    params: { name: "Marie Dupont", reason: "We are not onboarding new French tutors right now." },
    editable: {
      subject: "Update on your tutor application",
      heading: "Hi {{name}},",
      body: "Thank you for your interest in teaching with us. Unfortunately we are unable to approve your application at this time.\n\n**Reason:** {{reason}}",
    },
  },

  lessonBooked: {
    label: "Lesson booked",
    description: "Sent to both the student and the tutor when a lesson is booked.",
    audience: "Student & tutor",
    params: {
      recipientName: "Alex",
      otherName: "Marie Dupont",
      whenUTC: SAMPLE_LESSON_UTC,
      timezone: SAMPLE_TIMEZONE,
      joinUrl: "https://gotalkify.com/class/2f6c1d…",
      isTrial: true,
      forTutor: false,
    },
    editable: {
      subject: "Lesson booked — {{whenUTC}}",
      heading: "Your lesson is booked",
      body: "Hi {{recipientName}}, your lesson with **{{otherName}}** is scheduled for **{{whenUTC}}**, your local time.\n\nThe class happens right here on GoTalkify — no downloads, no extra accounts. Your private classroom opens 15 minutes before the start time.\n\nThis link is private to you and {{otherName}} — please don't share it.",
      buttonLabel: "Join the class",
      buttonUrl: "{{joinUrl}}",
    },
  },

  lessonReminder: {
    label: "Lesson reminder",
    description: "Sent 24 hours and again 1 hour before a lesson starts.",
    audience: "Student & tutor",
    params: {
      recipientName: "Alex",
      otherName: "Marie Dupont",
      whenUTC: SAMPLE_LESSON_UTC,
      timezone: SAMPLE_TIMEZONE,
      joinUrl: "https://gotalkify.com/class/2f6c1d…",
      hoursBefore: 1,
    },
    editable: {
      subject: "Reminder: your upcoming lesson",
      heading: "Upcoming lesson reminder",
      body: "Hi {{recipientName}}, your lesson with **{{otherName}}** starts at **{{whenUTC}}**.",
      buttonLabel: "Join the class",
      buttonUrl: "{{joinUrl}}",
    },
  },

  lessonCancelled: {
    label: "Lesson cancelled",
    description: "Sent to both sides when a lesson is cancelled by the student, tutor or an admin.",
    audience: "Student & tutor",
    params: {
      recipientName: "Alex",
      otherName: "Marie Dupont",
      whenUTC: SAMPLE_LESSON_UTC,
      timezone: SAMPLE_TIMEZONE,
      byRole: "tutor",
      refunded: true,
    },
    editable: {
      subject: "Lesson cancelled",
      heading: "Lesson cancelled",
      body: "Hi {{recipientName}}, the lesson with **{{otherName}}** on **{{whenUTC}}** was cancelled by the {{byRole}}.\n\nThe lesson hour has been returned to the student's balance where applicable.",
    },
  },

  lessonRescheduled: {
    label: "Lesson rescheduled",
    description: "Sent to both sides when a lesson moves to a new time.",
    audience: "Student & tutor",
    params: {
      recipientName: "Alex",
      otherName: "Marie Dupont",
      oldWhenUTC: SAMPLE_LESSON_UTC,
      timezone: SAMPLE_TIMEZONE,
      newWhenUTC: SAMPLE_LESSON_UTC + 86_400_000,
    },
    editable: {
      subject: "Lesson rescheduled",
      heading: "Lesson rescheduled",
      body: "Hi {{recipientName}}, your lesson with **{{otherName}}** has moved from {{oldWhenUTC}} to **{{newWhenUTC}}**.",
      buttonLabel: "Open dashboard",
      buttonUrl: "{{siteUrl}}/dashboard",
    },
  },

  confirmLessonPrompt: {
    label: "Confirm your lesson",
    description:
      "Sent to the student after a lesson ends, asking them to confirm it so the tutor gets paid.",
    audience: "Student",
    params: {
      recipientName: "Alex",
      otherName: "Marie Dupont",
      whenUTC: SAMPLE_LESSON_UTC,
      timezone: SAMPLE_TIMEZONE,
    },
    editable: {
      subject: "How was your lesson? Please confirm it",
      heading: "Confirm your lesson",
      body: "Hi {{recipientName}}, your lesson with **{{otherName}}** on {{whenUTC}} has ended. Please confirm it so your tutor can be paid. It will be confirmed automatically after 72 hours.",
      buttonLabel: "Confirm lesson",
      buttonUrl: "{{siteUrl}}/dashboard/lessons",
    },
  },

  paymentReceipt: {
    label: "Payment receipt",
    description: "Sent to a student after a successful payment.",
    audience: "Student",
    params: {
      recipientName: "Alex",
      description: "10 lesson hours with Marie Dupont",
      amountCents: 32000,
    },
    editable: {
      subject: "Receipt — {{amountCents}}",
      heading: "Payment receipt",
      body: "Hi {{recipientName}}, we received your payment.\n\n**{{description}}**\n\nAmount: **{{amountCents}}**",
    },
  },

  payoutProcessed: {
    label: "Payout processed",
    description: "Sent to a tutor when a withdrawal is sent to their connected account.",
    audience: "Tutor",
    params: { recipientName: "Marie Dupont", amountCents: 24500 },
    editable: {
      subject: "Payout of {{amountCents}} on the way",
      heading: "Payout processed",
      body: "Hi {{recipientName}}, your withdrawal of **{{amountCents}}** has been sent to your connected account.",
    },
  },

  inquiryAdminAlert: {
    label: "Contact inquiry (admin alert)",
    description: "Sent to ADMIN_EMAIL when someone submits the contact form.",
    audience: "Admin",
    params: {
      name: "Jordan Lee",
      email: "jordan@example.com",
      program: "Corporate training",
      message: "We would like French lessons for six employees.",
    },
    editable: {
      subject: "New inquiry from {{name}}",
      heading: "New contact inquiry",
      body: "**From:** {{name}} ({{email}})\n**Program:** {{program}}\n\n**Message**\n{{message}}",
    },
  },

  inquiryAutoReply: {
    label: "Contact form auto-reply",
    description: "Confirmation sent to whoever submits the contact form.",
    audience: "Visitor",
    params: { name: "Jordan Lee" },
    editable: {
      subject: "We got your message — GoTalkify",
      heading: "Thanks, {{name}}!",
      body: "We received your inquiry and will get back to you within one business day.",
    },
  },
};

/** Template keys in the order they are shown in the admin screen. */
export const TEMPLATE_KEYS = Object.keys(TEMPLATE_META);
