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
import { Check, X, Inbox, ShieldAlert } from "lucide-react";

export default function AdminApplicationsPage() {
  const me = useQuery(api.users.me);
  const isAdmin = !!me && me.role === "admin";
  const applications = useQuery(api.admin.pendingApplications, isAdmin ? {} : "skip");
  const approveTutor = useMutation(api.admin.approveTutor);
  const rejectTutor = useMutation(api.admin.rejectTutor);

  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (me === undefined) return <LoadingRows rows={3} />;
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

  async function onApprove(profile) {
    if (!window.confirm(`Approve ${profile.name} as a tutor? Their profile goes live immediately.`)) return;
    setError("");
    try {
      await approveTutor({ profileId: profile._id });
    } catch (err) {
      setError(cleanError(err));
    }
  }

  async function onReject(e) {
    e.preventDefault();
    if (!reason.trim() || !rejecting) return;
    setBusy(true);
    setError("");
    try {
      await rejectTutor({ profileId: rejecting._id, reason: reason.trim() });
      setRejecting(null);
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
        title="Tutor applications"
        description="Review pending applications and approve or reject new tutors."
      />

      <ErrorBanner message={error} onDismiss={() => setError("")} />

      {applications === undefined ? (
        <div className="card">
          <LoadingRows rows={3} />
        </div>
      ) : applications.length === 0 ? (
        <div className="card">
          <EmptyState
            compact
            icon={Inbox}
            title="No pending applications"
            message="New tutor applications will land here for review."
          />
        </div>
      ) : (
        <div className="space-y-6">
          {applications.map((app) => (
            <SectionCard key={app._id}>
              <div className="flex flex-wrap items-start gap-4">
                <Avatar name={app.name} src={app.photoUrl} size="h-14 w-14 text-lg" />
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-slate-900">{app.name}</p>
                  <p className="text-sm text-slate-500">{app.email}</p>
                  {app.headline ? (
                    <p className="mt-1 text-sm font-medium text-slate-700">{app.headline}</p>
                  ) : null}
                  <p className="mt-1 text-sm text-slate-600">
                    Rate: <span className="font-semibold">{fmtMoney(app.hourlyRateCents)}/h</span>
                    <span className="ml-3 text-xs text-slate-400">
                      Applied {fmtDateTime(app._creationTime, me.timezone)}
                    </span>
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    className="btn-primary gap-1.5 px-4 py-2 text-sm"
                    onClick={() => onApprove(app)}
                  >
                    <Check className="h-4 w-4" /> Approve
                  </button>
                  <button
                    className="btn-danger gap-1.5 px-4 py-2 text-sm"
                    onClick={() => {
                      setRejecting(app);
                      setReason("");
                    }}
                  >
                    <X className="h-4 w-4" /> Reject
                  </button>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-1.5">
                {(app.languagesTaught ?? []).map((lang) => (
                  <span key={`t-${lang}`} className="badge-blue">
                    Teaches {lang}
                  </span>
                ))}
                {(app.nativeLanguages ?? []).map((lang) => (
                  <span key={`n-${lang}`} className="badge-green">
                    Native {lang}
                  </span>
                ))}
                {(app.specialties ?? []).map((s) => (
                  <span key={`s-${s}`} className="badge-gray">
                    {s}
                  </span>
                ))}
              </div>

              {app.bio ? (
                <p className="mt-3 whitespace-pre-line text-sm text-slate-600">{app.bio}</p>
              ) : null}

              {app.qualifications ? (
                <div className="mt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Qualifications
                  </p>
                  <p className="whitespace-pre-line text-sm text-slate-600">{app.qualifications}</p>
                </div>
              ) : null}

              {app.introVideoUrl ? (
                <div className="mt-4">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Intro video
                  </p>
                  <video controls src={app.introVideoUrl} className="max-h-64 w-full max-w-md rounded-lg bg-black" />
                </div>
              ) : (
                <p className="mt-3 text-xs text-slate-400">No intro video uploaded.</p>
              )}
            </SectionCard>
          ))}
        </div>
      )}

      <Modal
        open={!!rejecting}
        onClose={() => setRejecting(null)}
        title={`Reject ${rejecting?.name ?? "application"}`}
      >
        <form onSubmit={onReject} className="space-y-4">
          <p className="text-sm text-slate-600">
            The applicant will receive an email with the reason below.
          </p>
          <div>
            <label className="label" htmlFor="reject-reason">
              Reason (required)
            </label>
            <textarea
              id="reject-reason"
              className="input"
              rows={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
            />
          </div>
          <ErrorBanner message={error} onDismiss={() => setError("")} />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setRejecting(null)}>
              Cancel
            </button>
            <button type="submit" className="btn-danger" disabled={busy || !reason.trim()}>
              {busy ? "Rejecting…" : "Reject application"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
