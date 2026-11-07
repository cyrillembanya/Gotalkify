"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import Modal from "@/components/Modal";
import { fmtMoney, fmtDateTime } from "@/lib/format";
import { cleanError } from "@/components/admin/helpers";
import BookingDetailModal, {
  MONEY_STATE,
  STATUS_BADGE,
  STATUS_LABEL,
} from "@/components/admin/BookingDetail";
import {
  PageHeader,
  SectionCard,
  StatCard,
  EmptyState,
  LoadingRows,
  ErrorBanner,
  Avatar,
} from "@/components/dashboard/ui";
import { Banknote, CalendarDays, Landmark, ShieldAlert, Wallet } from "lucide-react";
import { useViewerTimezone } from "@/lib/useViewerTimezone";

const STATUS_OPTIONS = [
  ["scheduled", "Scheduled"],
  ["completed", "Completed"],
  ["confirmed", "Confirmed"],
  ["cancelled_student", "Cancelled (student)"],
  ["cancelled_tutor", "Cancelled (tutor)"],
  ["noshow_student", "No-show (student)"],
  ["noshow_tutor", "No-show (tutor)"],
];

/** Totals for the rows currently on screen, split settled vs still held. */
function summarise(bookings) {
  const totals = {
    count: bookings.length,
    settledCount: 0,
    commissionCents: 0,
    tutorCents: 0,
    heldCents: 0,
    heldCommissionCents: 0,
    heldTutorCents: 0,
  };
  for (const { money } of bookings) {
    if (money.settled) {
      totals.settledCount += 1;
      totals.commissionCents += money.commissionCents;
      totals.tutorCents += money.tutorCents;
    } else if (money.projected) {
      totals.heldCents += money.grossCents;
      totals.heldCommissionCents += money.commissionCents;
      totals.heldTutorCents += money.tutorCents;
    }
  }
  return totals;
}

export default function AdminBookingsPage() {
  const timezone = useViewerTimezone();
  const me = useQuery(api.users.me);
  const isAdmin = !!me && me.role === "admin";

  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const bookings = useQuery(
    api.admin.bookings,
    isAdmin ? { status: status || undefined, type: type || undefined } : "skip"
  );
  const cancelBooking = useMutation(api.admin.cancelBooking);

  const [detailId, setDetailId] = useState(null);
  const [cancelling, setCancelling] = useState(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const totals = useMemo(() => summarise(bookings ?? []), [bookings]);

  if (me === undefined) return <LoadingRows rows={4} />;
  if (!isAdmin) {
    return (
      <div className="card">
        <EmptyState
          compact
          icon={ShieldAlert}
          title="Admins only"
          message="You need administrator access to view this page."
        />
      </div>
    );
  }

  function openCancel(lesson) {
    setDetailId(null);
    setCancelling(lesson);
    setReason("");
    setError("");
  }

  async function onCancel(e) {
    e.preventDefault();
    if (!cancelling) return;
    setBusy(true);
    setError("");
    try {
      await cancelBooking({
        lessonId: cancelling._id,
        reason: reason.trim() || undefined,
      });
      setCancelling(null);
      setReason("");
    } catch (err) {
      setError(cleanError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bookings"
        description="Every lesson on the platform — what it earned, who owes what, and the detail behind each one."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Lessons shown"
          value={bookings === undefined ? "…" : totals.count}
          icon={CalendarDays}
          note={`${totals.settledCount} settled`}
        />
        <StatCard
          label="Platform commission"
          value={bookings === undefined ? "…" : fmtMoney(totals.commissionCents)}
          icon={Landmark}
          accent="text-brand-700"
          note="Earned on settled lessons"
        />
        <StatCard
          label="Tutor earnings"
          value={bookings === undefined ? "…" : fmtMoney(totals.tutorCents)}
          icon={Wallet}
          accent="text-emerald-700"
          note="Released to tutor wallets"
        />
        <StatCard
          label="Still held"
          value={bookings === undefined ? "…" : fmtMoney(totals.heldCents)}
          icon={Banknote}
          note={
            bookings === undefined
              ? undefined
              : `${fmtMoney(totals.heldCommissionCents)} commission · ${fmtMoney(
                  totals.heldTutorCents
                )} tutor`
          }
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select
          id="booking-status"
          className="input max-w-xs"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          id="booking-type"
          className="input max-w-xs"
          value={type}
          onChange={(e) => setType(e.target.value)}
          aria-label="Filter by lesson type"
        >
          <option value="">All types</option>
          <option value="trial">Trial</option>
          <option value="regular">Regular</option>
        </select>
      </div>

      {error && !cancelling ? (
        <ErrorBanner message={error} onDismiss={() => setError("")} />
      ) : null}

      <SectionCard title="All bookings">
        {bookings === undefined ? (
          <LoadingRows rows={5} />
        ) : bookings.length === 0 ? (
          <EmptyState
            compact
            icon={CalendarDays}
            title="No bookings found"
            message="Lessons matching this filter will appear here."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Student</th>
                  <th>Tutor</th>
                  <th>Type</th>
                  <th>Price</th>
                  <th>Commission</th>
                  <th>Tutor gets</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((lesson) => {
                  const money = lesson.money;
                  const state = MONEY_STATE[money.state] ?? MONEY_STATE.void;
                  return (
                    <tr key={lesson._id} className="transition-colors hover:bg-slate-50">
                      <td data-label="Date" className="whitespace-nowrap">
                        {fmtDateTime(lesson.startUTC, timezone, { withZone: true })}
                      </td>
                      <td data-primary>
                        <span className="flex items-center gap-3">
                          <Avatar name={lesson.studentName} size="h-8 w-8 text-xs" />
                          {lesson.studentName}
                        </span>
                      </td>
                      <td data-label="Tutor">
                        <span className="flex items-center gap-3">
                          <Avatar name={lesson.tutorName} size="h-8 w-8 text-xs" />
                          {lesson.tutorName}
                        </span>
                      </td>
                      <td data-label="Type">
                        <span className={lesson.type === "trial" ? "badge-blue" : "badge-gray"}>
                          {lesson.type}
                        </span>
                      </td>
                      <td data-label="Price" className="whitespace-nowrap">
                        {fmtMoney(money.grossCents)}
                      </td>
                      {/* Settled figures are firm; anything still held is an
                          estimate at today's commission rate. */}
                      <td data-label="Commission" className="whitespace-nowrap">
                        <span className={money.settled ? "font-medium text-brand-700" : "text-slate-500"}>
                          {money.projected ? "~" : ""}
                          {fmtMoney(money.commissionCents)}
                        </span>
                        <span className="ml-1 text-xs text-slate-400">
                          {money.commissionCents > 0 ? `${money.ratePercent}%` : ""}
                        </span>
                      </td>
                      <td data-label="Tutor gets" className="whitespace-nowrap">
                        <span className={money.settled ? "font-medium text-emerald-700" : "text-slate-500"}>
                          {money.projected ? "~" : ""}
                          {fmtMoney(money.tutorCents)}
                        </span>
                      </td>
                      <td data-label="Status">
                        <span className="flex flex-col items-end gap-1 md:items-start">
                          <span className={STATUS_BADGE[lesson.status] ?? "badge-gray"}>
                            {STATUS_LABEL[lesson.status] ?? lesson.status}
                          </span>
                          <span className="text-xs text-slate-400">{state.label}</span>
                        </span>
                      </td>
                      <td data-actions>
                        <span className="flex flex-wrap gap-2">
                          <button
                            className="btn-secondary px-4 py-2 text-sm"
                            onClick={() => setDetailId(lesson._id)}
                          >
                            Details
                          </button>
                          {lesson.status === "scheduled" ? (
                            <button
                              className="btn-danger px-4 py-2 text-sm"
                              onClick={() => openCancel(lesson)}
                            >
                              Cancel &amp; refund
                            </button>
                          ) : null}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <BookingDetailModal
        lessonId={detailId}
        timezone={timezone}
        onClose={() => setDetailId(null)}
        onCancelBooking={openCancel}
      />

      <Modal
        open={!!cancelling}
        onClose={() => setCancelling(null)}
        title="Cancel lesson & refund"
      >
        <form onSubmit={onCancel} className="space-y-4">
          {cancelling ? (
            <p className="text-sm text-slate-600">
              {cancelling.studentName} with {cancelling.tutorName} on{" "}
              {fmtDateTime(cancelling.startUTC, timezone, { withZone: true })}. The student&apos;s hour will be
              refunded to their balance.
            </p>
          ) : null}
          <div>
            <label className="label" htmlFor="cancel-reason">
              Reason (optional)
            </label>
            <textarea
              id="cancel-reason"
              className="input"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <ErrorBanner message={error} onDismiss={() => setError("")} />
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setCancelling(null)}>
              Keep lesson
            </button>
            <button type="submit" className="btn-danger" disabled={busy}>
              {busy ? "Cancelling…" : "Cancel & refund"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
