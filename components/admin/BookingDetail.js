"use client";

/**
 * The full picture of one booking for an admin: where the money sits, what
 * the platform keeps, what the tutor gets, who the two people are, and every
 * trace the lesson left behind (hour ledger, classroom attendance, review).
 */

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Modal from "@/components/Modal";
import StarRating from "@/components/StarRating";
import { fmtMoney, fmtDateTime } from "@/lib/format";
import { LoadingRows, Avatar } from "@/components/dashboard/ui";
import { classPath } from "@/components/JoinClassButton";
import {
  Banknote,
  CalendarClock,
  GraduationCap,
  History,
  ListOrdered,
  MessageSquareQuote,
  ShieldCheck,
  Users,
  Video,
} from "lucide-react";

export const STATUS_LABEL = {
  scheduled: "Scheduled",
  completed: "Completed",
  confirmed: "Confirmed",
  cancelled_student: "Cancelled (student)",
  cancelled_tutor: "Cancelled (tutor)",
  noshow_student: "No-show (student)",
  noshow_tutor: "No-show (tutor)",
};

export const STATUS_BADGE = {
  scheduled: "badge-blue",
  completed: "badge-yellow",
  confirmed: "badge-green",
  cancelled_student: "badge-red",
  cancelled_tutor: "badge-red",
  noshow_student: "badge-gray",
  noshow_tutor: "badge-gray",
};

/** Label + badge for where a lesson's money sits (see lessonMoney in convex/lib.js). */
export const MONEY_STATE = {
  escrow: { label: "In escrow", badge: "badge-yellow" },
  awaiting_confirmation: { label: "Awaiting confirmation", badge: "badge-yellow" },
  released: { label: "Released", badge: "badge-green" },
  refunded: { label: "Refunded", badge: "badge-gray" },
  void: { label: "Unreleased", badge: "badge-red" },
};

const WALLET_STATUS = {
  available: "In the tutor's wallet, ready to withdraw",
  locked: "Locked into a payout request",
  paid: "Paid out to the tutor",
};

const LEDGER_REASON = {
  purchase: "Hours purchased",
  subscription_renewal: "Subscription renewal",
  booking: "Booked this lesson",
  refund: "Refunded",
  transfer: "Transferred",
  admin_adjustment: "Admin adjustment",
};

/* --------------------------------- primitives -------------------------------- */

function Panel({ title, icon: Icon, children, className = "" }) {
  return (
    <section className={`rounded-xl border border-slate-200 p-4 ${className}`}>
      <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {Icon ? <Icon className="h-4 w-4" strokeWidth={2} aria-hidden="true" /> : null}
        {title}
      </h4>
      {children}
    </section>
  );
}

function Row({ label, children }) {
  if (children === null || children === undefined || children === "") return null;
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-2 text-sm last:border-b-0">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className="min-w-0 break-words text-right font-medium text-slate-800">{children}</dd>
    </div>
  );
}

/** One money figure, sized to be read at a glance. */
function Amount({ label, value, note, accent = "text-slate-900", className = "" }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-3 ${className}`}>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-bold tracking-tight ${accent}`}>{value}</p>
      {note ? <p className="mt-0.5 text-xs text-slate-400">{note}</p> : null}
    </div>
  );
}

/* ---------------------------------- copy ------------------------------------- */

/** One sentence saying exactly where this lesson's money is right now. */
function moneyExplanation(detail, timezone) {
  const { money, lesson, releaseDueAt, settings } = detail;
  const due = releaseDueAt ? fmtDateTime(releaseDueAt, timezone, { withZone: true }) : null;
  switch (money.state) {
    case "escrow":
      return `The student's hour is held against this lesson. Nothing reaches the tutor's wallet until the lesson is confirmed — the student can confirm it once it ends, and it auto-confirms on ${due} otherwise.`;
    case "awaiting_confirmation":
      return `The lesson is over and the money is still held. It releases to the tutor automatically on ${due} (${settings.confirmationWindowHours}h after the lesson) unless the student confirms sooner.`;
    case "released":
      return `Settled${
        lesson.confirmedAt
          ? ` on ${fmtDateTime(lesson.confirmedAt, timezone, { withZone: true })}`
          : ""
      }${
        lesson.confirmedBy === "auto"
          ? " — auto-confirmed after the confirmation window"
          : lesson.confirmedBy === "student"
            ? " — confirmed by the student"
            : ""
      }.`;
    case "refunded":
      return "The hour went back to the student's balance. Nobody earned anything on this lesson.";
    case "void":
      return "This trial was paid for by card and the lesson never happened. Nothing was released to the tutor and no hour was refunded.";
    default:
      return "";
  }
}

/* --------------------------------- the modal --------------------------------- */

export default function BookingDetailModal({ lessonId, timezone, onClose, onCancelBooking }) {
  const detail = useQuery(api.admin.bookingDetail, lessonId ? { lessonId } : "skip");

  return (
    <Modal open={!!lessonId} onClose={onClose} title="Booking details" wide>
      {detail === undefined ? (
        <LoadingRows rows={5} />
      ) : (
        <BookingDetailBody
          detail={detail}
          timezone={timezone}
          onCancelBooking={onCancelBooking}
        />
      )}
    </Modal>
  );
}

function BookingDetailBody({ detail, timezone, onCancelBooking }) {
  const { lesson, money, student, tutor, wallet, payout, balance, ledger } = detail;
  const state = MONEY_STATE[money.state] ?? MONEY_STATE.void;
  const isTrial = lesson.type === "trial";
  // Refunded and void lessons earn nobody anything, so the tile captions
  // below must not talk about shares of a split that never happens.
  const earns = ["released", "escrow", "awaiting_confirmation"].includes(money.state);

  return (
    <div className="space-y-5">
      {/* ------------------------------- headline ------------------------------- */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-bold text-slate-900">
            {fmtDateTime(lesson.startUTC, timezone, { withZone: true })}
          </p>
          <p className="mt-0.5 text-sm text-slate-500">
            {lesson.studentName} with {lesson.tutorName} · 60 min
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={isTrial ? "badge-blue" : "badge-gray"}>
            {isTrial ? "Trial" : "Regular"}
          </span>
          <span className={STATUS_BADGE[lesson.status] ?? "badge-gray"}>
            {STATUS_LABEL[lesson.status] ?? lesson.status}
          </span>
        </div>
      </div>

      {/* --------------------------------- money -------------------------------- */}
      <Panel title="Money" icon={Banknote} className="bg-slate-50">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className={state.badge}>{state.label}</span>
          {money.projected ? (
            <span className="badge-gray">Projected — not settled yet</span>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Amount
            label={money.state === "refunded" ? "Lesson value" : "Student paid"}
            value={fmtMoney(money.grossCents)}
            note={
              money.state === "refunded"
                ? "Returned to the student's hour balance"
                : isTrial
                  ? "Card payment for the trial"
                  : "Value of the prepaid hour used"
            }
          />
          <Amount
            label="Platform commission"
            value={fmtMoney(money.commissionCents)}
            note={
              earns
                ? `${money.ratePercent}% of the lesson value`
                : "Nothing earned on this lesson"
            }
            accent="text-brand-700"
          />
          <Amount
            label={money.settled ? "Tutor received" : "Tutor will get"}
            value={fmtMoney(money.tutorCents)}
            note={
              !earns
                ? "Nothing released to the tutor"
                : isTrial
                  ? "Trials are 100% platform"
                  : `${Math.round((100 - money.ratePercent) * 10) / 10}% of the lesson value`
            }
            accent="text-emerald-700"
          />
        </div>

        <p className="mt-3 text-sm text-slate-600">{moneyExplanation(detail, timezone)}</p>

        <dl className="mt-3">
          <Row label="Commission rate applied">
            {earns ? `${money.ratePercent}%` : "—"}
            {earns && !money.settled && !isTrial
              ? ` (current platform setting: ${detail.settings.commissionPercent}%)`
              : null}
          </Row>
          {wallet ? (
            <>
              <Row label="Tutor wallet credit">
                {fmtMoney(wallet.amountCents)} on{" "}
                {fmtDateTime(wallet.createdAt, timezone)}
              </Row>
              <Row label="Wallet status">{WALLET_STATUS[wallet.status] ?? wallet.status}</Row>
            </>
          ) : null}
          {payout ? (
            <>
              <Row label="Paid out on">
                {payout.resolvedAt
                  ? fmtDateTime(payout.resolvedAt, timezone)
                  : `Requested ${fmtDateTime(payout.createdAt, timezone)}`}
              </Row>
              <Row label="Payout">
                {fmtMoney(payout.amountCents)} · {payout.status}
                {payout.method ? ` · ${payout.method === "paypal" ? "PayPal" : "Stripe"}` : ""}
              </Row>
              <Row label="Payout reference">
                {payout.reference ?? payout.stripeTransferId ?? null}
              </Row>
            </>
          ) : null}
        </dl>
      </Panel>

      {/* -------------------------------- parties ------------------------------- */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Panel title="Student" icon={GraduationCap}>
          <div className="mb-2 flex items-center gap-3">
            <Avatar name={lesson.studentName} size="h-9 w-9 text-sm" />
            <div className="min-w-0">
              <p className="truncate font-semibold text-slate-800">{lesson.studentName}</p>
              <p className="truncate text-xs text-slate-500">{student?.email ?? "—"}</p>
            </div>
          </div>
          <dl>
            <Row label="Account">{student?.status ?? "—"}</Row>
            <Row label="Their local time">
              {student?.timezone
                ? fmtDateTime(lesson.startUTC, student.timezone, { withZone: true })
                : "Timezone not set"}
            </Row>
            <Row label="Hours left with this tutor">
              {balance ? `${(balance.minutesRemaining / 60).toFixed(1)} h` : "None"}
            </Row>
            <Row label="Hours bought at">
              {balance ? `${fmtMoney(balance.purchaseRateCents)} / h` : null}
            </Row>
            <Row label="Member since">
              {student ? fmtDateTime(student.joinedAt, timezone) : null}
            </Row>
          </dl>
        </Panel>

        <Panel title="Tutor" icon={Users}>
          <div className="mb-2 flex items-center gap-3">
            <Avatar name={lesson.tutorName} size="h-9 w-9 text-sm" />
            <div className="min-w-0">
              <p className="truncate font-semibold text-slate-800">{lesson.tutorName}</p>
              <p className="truncate text-xs text-slate-500">{tutor?.email ?? "—"}</p>
            </div>
          </div>
          <dl>
            <Row label="Listed rate">
              {tutor?.hourlyRateCents != null ? `${fmtMoney(tutor.hourlyRateCents)} / h` : null}
            </Row>
            <Row label="Their local time">
              {tutor?.timezone
                ? fmtDateTime(lesson.startUTC, tutor.timezone, { withZone: true })
                : "Timezone not set"}
            </Row>
            <Row label="Payout method">
              {tutor?.payoutMethod === "paypal"
                ? `PayPal · ${tutor.paypalEmail ?? "no address"}`
                : tutor?.payoutMethod === "stripe"
                  ? `Stripe ${tutor.connectOnboarded ? "(onboarded)" : "(not onboarded)"}`
                  : "Not set up yet"}
            </Row>
            <Row label="Rating">
              {tutor?.rating ? `${tutor.rating.toFixed(1)} (${tutor.reviewCount})` : null}
            </Row>
            <Row label="Cancellations">
              {tutor?.cancellationCount
                ? `${tutor.cancellationCount}${tutor.flaggedForCancellations ? " — flagged" : ""}`
                : null}
            </Row>
          </dl>
        </Panel>
      </div>

      {/* ------------------------------- the lesson ----------------------------- */}
      <Panel title="Lesson" icon={CalendarClock}>
        <dl>
          <Row label="Booked">{fmtDateTime(lesson._creationTime, timezone)}</Row>
          <Row label="Ends">{fmtDateTime(lesson.endUTC, timezone, { withZone: true })}</Row>
          <Row label="Recurring series">
            {detail.seriesCount > 1 ? `Weekly — ${detail.seriesCount} lessons` : null}
          </Row>
          <Row label="Confirmed">
            {lesson.confirmedAt
              ? `${fmtDateTime(lesson.confirmedAt, timezone)} (${
                  lesson.confirmedBy === "auto" ? "automatically" : "by the student"
                })`
              : null}
          </Row>
          <Row label="Cancelled">
            {lesson.cancelledAt ? fmtDateTime(lesson.cancelledAt, timezone) : null}
          </Row>
          <Row label="Late cancellation">
            {lesson.lateCancel
              ? `Yes — inside the ${detail.settings.cancellationWindowHours}h window, so the hour was forfeited`
              : null}
          </Row>
          <Row label="Reason given">{lesson.cancelReason ?? null}</Row>
          <Row label="Reminders sent">
            {lesson.reminded24h || lesson.reminded1h
              ? [lesson.reminded24h ? "24h" : null, lesson.reminded1h ? "1h" : null]
                  .filter(Boolean)
                  .join(" · ")
              : "None"}
          </Row>
          <Row label="Classroom">
            {lesson.roomId ? (
              <Link
                href={classPath(lesson.roomId)}
                className="inline-flex items-center gap-1.5 text-brand-700 underline"
              >
                <Video className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                Open the room
              </Link>
            ) : null}
          </Row>
          <Row label="Lesson ID">
            <span className="font-mono text-xs">{lesson._id}</span>
          </Row>
        </dl>
      </Panel>

      {/* ------------------------------- attendance ----------------------------- */}
      {detail.attendance.length > 0 ? (
        <Panel title="Who joined the classroom" icon={ShieldCheck}>
          <ul className="divide-y divide-slate-100">
            {detail.attendance.map((person, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span className="font-medium text-slate-800">
                  {person.name}{" "}
                  <span className="text-xs font-normal text-slate-500">({person.role})</span>
                </span>
                <span className="text-slate-500">
                  {fmtDateTime(person.joinedAt, timezone)} ·{" "}
                  {Math.max(1, Math.round((person.lastSeenAt - person.joinedAt) / 60000))} min
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {/* -------------------------------- payment ------------------------------- */}
      {detail.purchase ? (
        <Panel title="Trial payment" icon={History}>
          <dl>
            <Row label="Charged">{fmtMoney(detail.purchase.amountCents)}</Row>
            <Row label="Status">{detail.purchase.status}</Row>
            <Row label="Paid">{fmtDateTime(detail.purchase.createdAt, timezone)}</Row>
            <Row label="Stripe session">
              {detail.purchase.stripeSessionId ? (
                <span className="font-mono text-xs">{detail.purchase.stripeSessionId}</span>
              ) : null}
            </Row>
          </dl>
        </Panel>
      ) : null}

      {/* -------------------------------- ledger -------------------------------- */}
      {ledger.length > 0 ? (
        <Panel title="Hour ledger" icon={ListOrdered}>
          <ul className="divide-y divide-slate-100">
            {ledger.map((entry) => (
              <li key={entry._id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span className="min-w-0">
                  <span className="font-medium text-slate-800">
                    {LEDGER_REASON[entry.reason] ?? entry.reason}
                  </span>
                  {entry.note ? (
                    <span className="block text-xs text-slate-500">{entry.note}</span>
                  ) : null}
                </span>
                <span className="flex items-center gap-3 whitespace-nowrap">
                  <span className="text-xs text-slate-400">
                    {fmtDateTime(entry.createdAt, timezone)}
                  </span>
                  <span
                    className={
                      entry.deltaMinutes < 0
                        ? "font-semibold text-red-600"
                        : "font-semibold text-emerald-600"
                    }
                  >
                    {entry.deltaMinutes > 0 ? "+" : ""}
                    {entry.deltaMinutes} min
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {/* -------------------------------- review -------------------------------- */}
      {detail.review ? (
        <Panel title="Student review" icon={MessageSquareQuote}>
          <div className="flex items-center gap-2">
            <StarRating value={detail.review.rating} size="h-4 w-4" />
            <span className="text-xs text-slate-400">
              {fmtDateTime(detail.review.createdAt, timezone)}
            </span>
          </div>
          {detail.review.text ? (
            <p className="mt-2 text-sm text-slate-700">{detail.review.text}</p>
          ) : null}
        </Panel>
      ) : null}

      {lesson.status === "scheduled" && onCancelBooking ? (
        <div className="flex justify-end border-t border-slate-100 pt-4">
          <button className="btn-danger px-4 py-2 text-sm" onClick={() => onCancelBooking(lesson)}>
            Cancel &amp; refund
          </button>
        </div>
      ) : null}
    </div>
  );
}
