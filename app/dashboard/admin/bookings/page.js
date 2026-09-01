"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import Modal from "@/components/Modal";
import { fmtMoney, fmtDateTime } from "@/lib/format";
import { cleanError } from "@/components/admin/helpers";
import {
  PageHeader,
  SectionCard,
  EmptyState,
  LoadingRows,
  ErrorBanner,
  Avatar,
} from "@/components/dashboard/ui";
import { CalendarDays, ShieldAlert } from "lucide-react";
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

const STATUS_BADGE = {
  scheduled: "badge-blue",
  completed: "badge-yellow",
  confirmed: "badge-green",
  cancelled_student: "badge-red",
  cancelled_tutor: "badge-red",
  noshow_student: "badge-gray",
  noshow_tutor: "badge-gray",
};

const STATUS_LABEL = Object.fromEntries(STATUS_OPTIONS);

export default function AdminBookingsPage() {
  const timezone = useViewerTimezone();
  const me = useQuery(api.users.me);
  const isAdmin = !!me && me.role === "admin";

  const [status, setStatus] = useState("");
  const bookings = useQuery(
    api.admin.bookings,
    isAdmin ? { status: status || undefined } : "skip"
  );
  const cancelBooking = useMutation(api.admin.cancelBooking);

  const [cancelling, setCancelling] = useState(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
      <PageHeader title="Bookings" description="Every lesson on the platform — filter, inspect and refund." />

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
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((lesson) => (
                  <tr key={lesson._id} className="transition-colors hover:bg-slate-50">
                    <td className="whitespace-nowrap">
                      {fmtDateTime(lesson.startUTC, timezone, { withZone: true })}
                    </td>
                    <td>
                      <span className="flex items-center gap-3">
                        <Avatar name={lesson.studentName} size="h-8 w-8 text-xs" />
                        {lesson.studentName}
                      </span>
                    </td>
                    <td>
                      <span className="flex items-center gap-3">
                        <Avatar name={lesson.tutorName} size="h-8 w-8 text-xs" />
                        {lesson.tutorName}
                      </span>
                    </td>
                    <td>
                      <span className={lesson.type === "trial" ? "badge-blue" : "badge-gray"}>
                        {lesson.type}
                      </span>
                    </td>
                    <td>{fmtMoney(lesson.priceCents)}</td>
                    <td>
                      <span className={STATUS_BADGE[lesson.status] ?? "badge-gray"}>
                        {STATUS_LABEL[lesson.status] ?? lesson.status}
                      </span>
                    </td>
                    <td>
                      {lesson.status === "scheduled" ? (
                        <button
                          className="btn-danger px-4 py-2 text-sm"
                          onClick={() => {
                            setCancelling(lesson);
                            setReason("");
                            setError("");
                          }}
                        >
                          Cancel &amp; refund
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

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
          <div className="flex justify-end gap-2">
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
