"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import Modal from "@/components/Modal";
import SlotPicker from "@/components/SlotPicker";
import StarRating from "@/components/StarRating";
import JoinClassButton from "@/components/JoinClassButton";
import { fmtDateTime } from "@/lib/format";
import {
  PageHeader,
  SectionCard,
  EmptyState,
  LoadingRows,
  ErrorBanner,
  Avatar,
} from "@/components/dashboard/ui";
import { CalendarDays, History } from "lucide-react";
import { useViewerTimezone } from "@/lib/useViewerTimezone";

function cleanError(error) {
  return String(error?.message ?? error ?? "")
    .replace(/^.*Uncaught Error:\s*/, "")
    .split("\n")[0] || "Something went wrong.";
}

const STATUS_BADGE = {
  scheduled: ["badge-blue", "Scheduled"],
  completed: ["badge-yellow", "Awaiting confirmation"],
  confirmed: ["badge-green", "Confirmed"],
  cancelled_student: ["badge-gray", "Cancelled by student"],
  cancelled_tutor: ["badge-red", "Cancelled by tutor"],
  noshow_student: ["badge-red", "Student no-show"],
  noshow_tutor: ["badge-red", "Tutor no-show"],
};

function StatusBadge({ status }) {
  const [cls, label] = STATUS_BADGE[status] ?? ["badge-gray", status];
  return <span className={cls}>{label}</span>;
}

function UpcomingCard({ lesson, me, onError }) {
  const timezone = useViewerTimezone();
  const cancel = useMutation(api.lessons.cancel);
  const reschedule = useMutation(api.lessons.reschedule);
  const markStudentNoShow = useMutation(api.lessons.markStudentNoShow);
  const reportTutorNoShow = useMutation(api.lessons.reportTutorNoShow);
  const settings = useQuery(api.settings.get);

  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [reschedOpen, setReschedOpen] = useState(false);
  const [newSlot, setNewSlot] = useState(null);
  const [busy, setBusy] = useState(false);

  const isStudent = me._id === lesson.studentId;
  const otherName = isStudent ? lesson.tutorName : lesson.studentName;
  const started = Date.now() >= lesson.startUTC;
  const windowH = settings?.cancellationWindowHours ?? 12;
  const insideWindow = Date.now() > lesson.startUTC - windowH * 3600_000;

  async function run(fn, close) {
    setBusy(true);
    onError(null);
    try {
      await fn();
      close?.();
    } catch (err) {
      onError(cleanError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3.5 first:pt-0 last:pb-0">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar name={otherName} />
        <div className="min-w-0">
          <p className="flex items-center gap-2 truncate text-sm font-semibold text-slate-800">
            {otherName}
            {lesson.type === "trial" ? <span className="badge-blue">Trial</span> : null}
            {lesson.recurringGroupId ? <span className="badge-gray">Weekly</span> : null}
          </p>
          <p className="text-xs text-slate-500">{fmtDateTime(lesson.startUTC, timezone, { withZone: true })}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <JoinClassButton lesson={lesson} showCopy />
        {!started ? (
          <>
            <button
              className="btn-ghost px-4 py-2 text-sm"
              onClick={() => setReschedOpen(true)}
            >
              Reschedule
            </button>
            <button
              className="btn-ghost px-4 py-2 text-sm text-red-600"
              onClick={() => setCancelOpen(true)}
            >
              Cancel
            </button>
          </>
        ) : isStudent ? (
          <button
            className="btn-ghost px-4 py-2 text-sm text-red-600"
            disabled={busy}
            onClick={() => run(() => reportTutorNoShow({ lessonId: lesson._id }))}
          >
            Tutor didn&apos;t show
          </button>
        ) : (
          <button
            className="btn-ghost px-4 py-2 text-sm text-red-600"
            disabled={busy}
            onClick={() => run(() => markStudentNoShow({ lessonId: lesson._id }))}
          >
            Student didn&apos;t show
          </button>
        )}
      </div>

      <Modal open={cancelOpen} onClose={() => setCancelOpen(false)} title="Cancel lesson">
        <p className="text-sm text-slate-600">
          {isStudent
            ? insideWindow
              ? `This lesson starts in less than ${windowH} hours — your lesson hour will be forfeited and the tutor still gets paid.`
              : `You're cancelling more than ${windowH} hours ahead — your lesson hour will be refunded to your balance.`
            : "Cancelling as the tutor refunds the student's hour. Repeated cancellations are flagged to the platform."}
        </p>
        <textarea
          className="input mt-3"
          rows={2}
          placeholder="Reason (optional)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-ghost" onClick={() => setCancelOpen(false)}>Keep lesson</button>
          <button
            className="btn-danger"
            disabled={busy}
            onClick={() =>
              run(
                () => cancel({ lessonId: lesson._id, reason: reason || undefined }),
                () => setCancelOpen(false)
              )
            }
          >
            {busy ? "Cancelling…" : "Cancel lesson"}
          </button>
        </div>
      </Modal>

      <Modal
        open={reschedOpen}
        onClose={() => setReschedOpen(false)}
        title="Reschedule lesson"
        wide
      >
        <p className="mb-3 text-sm text-slate-600">
          Free rescheduling up to {windowH} hours before the start. Pick a new time:
        </p>
        <SlotPicker
          tutorUserId={lesson.tutorId}
          tutorName={lesson.tutorName}
          selected={newSlot}
          onSelect={setNewSlot}
        />
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-ghost" onClick={() => setReschedOpen(false)}>Back</button>
          <button
            className="btn-primary"
            disabled={!newSlot || busy}
            onClick={() =>
              run(
                () => reschedule({ lessonId: lesson._id, newStartUTC: newSlot }),
                () => { setReschedOpen(false); setNewSlot(null); }
              )
            }
          >
            {busy ? "Moving…" : "Confirm new time"}
          </button>
        </div>
      </Modal>
    </li>
  );
}

function HistoryRow({ lesson, me, onError }) {
  const timezone = useViewerTimezone();
  const confirm = useMutation(api.lessons.confirm);
  const createReview = useMutation(api.reviews.create);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const isStudent = me._id === lesson.studentId;
  const otherName = isStudent ? lesson.tutorName : lesson.studentName;

  async function run(fn, close) {
    setBusy(true);
    onError(null);
    try {
      await fn();
      close?.();
    } catch (err) {
      onError(cleanError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr className="transition-colors hover:bg-slate-50">
      <td>{fmtDateTime(lesson.startUTC, timezone, { withZone: true })}</td>
      <td>
        <span className="flex items-center gap-3 font-medium text-slate-800">
          <Avatar name={otherName} size="h-8 w-8 text-xs" />
          {otherName}
          {lesson.type === "trial" ? <span className="badge-blue">Trial</span> : null}
        </span>
      </td>
      <td><StatusBadge status={lesson.status} /></td>
      <td>
        <div className="flex justify-end gap-2">
          {lesson.canConfirm ? (
            <button
              className="btn-primary px-4 py-2 text-sm"
              disabled={busy}
              onClick={() => run(() => confirm({ lessonId: lesson._id }))}
            >
              Confirm lesson
            </button>
          ) : null}
          {lesson.canReview ? (
            <button
              className="btn-secondary px-4 py-2 text-sm"
              onClick={() => setReviewOpen(true)}
            >
              Leave review
            </button>
          ) : null}
        </div>
        <Modal open={reviewOpen} onClose={() => setReviewOpen(false)} title={`Review ${otherName}`}>
          <div className="space-y-3">
            <StarRating value={rating} onChange={setRating} />
            <textarea
              className="input"
              rows={4}
              placeholder="How was your lesson?"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setReviewOpen(false)}>Cancel</button>
              <button
                className="btn-primary"
                disabled={busy || !text.trim()}
                onClick={() =>
                  run(
                    () => createReview({ lessonId: lesson._id, rating, text }),
                    () => setReviewOpen(false)
                  )
                }
              >
                {busy ? "Submitting…" : "Submit review"}
              </button>
            </div>
          </div>
        </Modal>
      </td>
    </tr>
  );
}

export default function LessonsPage() {
  const me = useQuery(api.users.me);
  const upcoming = useQuery(api.lessons.myUpcoming);
  const history = useQuery(api.lessons.myHistory);
  const [error, setError] = useState(null);

  if (!me) return <LoadingRows rows={4} />;

  return (
    <div className="space-y-6">
      <PageHeader title="Lessons" description="Your upcoming schedule and lesson history.">
        {me.role === "student" ? (
          <Link href="/dashboard/tutors" className="btn-primary">Book a lesson</Link>
        ) : null}
      </PageHeader>

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      <SectionCard title="Upcoming lessons">
        {upcoming === undefined ? (
          <LoadingRows rows={3} />
        ) : upcoming.length === 0 ? (
          <EmptyState
            compact
            icon={CalendarDays}
            title="No upcoming lessons"
            message={
              me.role === "student"
                ? "Find a tutor you like and book your next lesson."
                : "Lessons students book with you will appear here."
            }
            action={me.role === "student" ? "Find a tutor" : null}
            href="/dashboard/tutors"
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {upcoming.map((lesson) => (
              <UpcomingCard key={lesson._id} lesson={lesson} me={me} onError={setError} />
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Lesson history">
        {me.role === "student" ? (
          <p className="mb-4 text-sm text-slate-500">
            Confirming a lesson releases the tutor&apos;s payment. Lessons
            auto-confirm {history?.[0]?.confirmationWindowHours ?? 72} hours
            after they end.
          </p>
        ) : null}
        {history === undefined ? (
          <LoadingRows rows={3} />
        ) : history.length === 0 ? (
          <EmptyState
            compact
            icon={History}
            title="No past lessons yet"
            message="Once you've had your first lesson, it will show up here."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>{me.role === "tutor" ? "Student" : "Tutor"}</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {history.map((lesson) => (
                  <HistoryRow key={lesson._id} lesson={lesson} me={me} onError={setError} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
