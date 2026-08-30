"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
import {
  Check,
  X,
  Inbox,
  ShieldAlert,
  ShieldCheck,
  IdCard,
  ScanFace,
  Hourglass,
  Globe,
  MapPin,
} from "lucide-react";

const DOCUMENT_LABELS = {
  passport: "Passport",
  national_id: "National ID card",
  drivers_license: "Driver's licence",
  residence_permit: "Residence permit",
};

/** Full-size scan in a new tab — the thumbnails are too small to judge a face. */
function ScanThumb({ url, label, icon: Icon }) {
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="group block"
      title="Open full size"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={label}
        className="h-36 w-full rounded-xl border border-slate-200 object-cover transition group-hover:border-brand-400"
      />
      <span className="mt-1 flex items-center gap-1 text-xs font-medium text-slate-500">
        <Icon className="h-3.5 w-3.5" /> {label}
      </span>
    </a>
  );
}

/** ID document + live face scan the applicant submitted, for side-by-side review. */
function VerificationPanel({ verification, nationality, timezone, onRequestNew }) {
  if (!verification) {
    return (
      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
        <Hourglass className="h-4 w-4 shrink-0" />
        <span>
          Waiting on identity verification — the applicant hasn&apos;t uploaded
          their ID or completed the face scan yet.
        </span>
      </div>
    );
  }
  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
          <ShieldCheck className="h-4 w-4 text-brand-600" /> Identity verification
        </p>
        <div className="flex items-center gap-2">
          {verification.status === "rejected" ? (
            <span className="badge-red">Documents rejected</span>
          ) : (
            <span className="badge-yellow">Awaiting your review</span>
          )}
          <button
            type="button"
            className="btn-ghost px-3 py-1.5 text-xs"
            onClick={onRequestNew}
          >
            Request new documents
          </button>
        </div>
      </div>

      <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        {[
          ["Name on document", verification.fullNameOnDocument],
          ["Document", DOCUMENT_LABELS[verification.documentType] ?? verification.documentType],
          ["Issuing country", verification.documentCountry],
          ["Document number", verification.documentNumber],
          ["Expiry", verification.documentExpiry || "—"],
          ["Date of birth", verification.dateOfBirth || "—"],
          ["Submitted", fmtDateTime(verification.submittedAt, timezone)],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              {label}
            </dt>
            <dd className="text-slate-800">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <ScanThumb url={verification.idFrontUrl} label="ID front" icon={IdCard} />
        <ScanThumb url={verification.idBackUrl} label="ID back" icon={IdCard} />
        <ScanThumb url={verification.faceUrl} label="Live face scan" icon={ScanFace} />
      </div>
      {nationality && verification.documentCountry &&
      verification.documentCountry.trim().toLowerCase() !==
        nationality.trim().toLowerCase() ? (
        <p className="mt-3 rounded-lg bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
          The ID was issued by <strong>{verification.documentCountry}</strong> but
          the applicant gave <strong>{nationality}</strong> as their country of
          origin. That can be legitimate (residence permits, dual nationality) —
          just check it holds up.
        </p>
      ) : null}
      <p className="mt-2 text-xs text-slate-400">
        Check that the face scan matches the photo on the ID and that the name
        matches the application before approving.
      </p>
    </div>
  );
}

function AdminApplications() {
  const searchParams = useSearchParams();
  // Admin alert emails deep-link to one application: ?id=<profileId>.
  const focusId = searchParams.get("id");
  const me = useQuery(api.users.me);
  const isAdmin = !!me && me.role === "admin";
  const applications = useQuery(api.admin.pendingApplications, isAdmin ? {} : "skip");
  const approveTutor = useMutation(api.admin.approveTutor);
  const rejectTutor = useMutation(api.admin.rejectTutor);
  const requestNewDocuments = useMutation(api.admin.requestNewIdentityDocuments);

  const [rejecting, setRejecting] = useState(null);
  const [requestingDocs, setRequestingDocs] = useState(null);
  const [reason, setReason] = useState("");
  const [docsReason, setDocsReason] = useState("");
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
    if (!profile.verification) {
      setError(
        `${profile.name} hasn't completed identity verification yet — they still need to upload their ID and scan their face.`
      );
      return;
    }
    if (!window.confirm(`Approve ${profile.name} as a tutor? Their identity is marked verified and their profile goes live immediately.`)) return;
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

  async function onRequestDocs(e) {
    e.preventDefault();
    if (!docsReason.trim() || !requestingDocs) return;
    setBusy(true);
    setError("");
    try {
      await requestNewDocuments({
        profileId: requestingDocs._id,
        reason: docsReason.trim(),
      });
      setRequestingDocs(null);
      setDocsReason("");
    } catch (err) {
      setError(cleanError(err));
    } finally {
      setBusy(false);
    }
  }

  const focused = focusId
    ? (applications ?? []).find((app) => app._id === focusId)
    : null;
  const visible = focused ? [focused] : (applications ?? []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tutor applications"
        description="Check each applicant's ID and face scan against their application, then approve or reject."
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
          {focusId ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand-200 bg-brand-50 px-5 py-4 text-sm text-brand-800">
              <p>
                {focused
                  ? "Showing the application linked from your email."
                  : "That application is no longer pending — it may already have been approved or rejected."}
              </p>
              <Link
                href="/dashboard/admin/applications"
                className="font-semibold underline underline-offset-2"
              >
                View all {applications.length} pending
              </Link>
            </div>
          ) : null}
          {visible.map((app) => (
            <SectionCard key={app._id}>
              <div className="flex flex-wrap items-start gap-4">
                <Avatar name={app.name} src={app.photoUrl} size="h-14 w-14 text-lg" />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-bold text-slate-900">
                    {app.name}
                    {app.verification ? (
                      <span className="badge-blue">ID + face submitted</span>
                    ) : (
                      <span className="badge-gray">Identity check pending</span>
                    )}
                  </p>
                  <p className="text-sm text-slate-500">{app.email}</p>
                  {app.headline ? (
                    <p className="mt-1 text-sm font-medium text-slate-700">{app.headline}</p>
                  ) : null}
                  <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
                    <span className="inline-flex items-center gap-1">
                      <Globe className="h-3.5 w-3.5 text-slate-400" />
                      From {app.nationality || "—"}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5 text-slate-400" />
                      Lives in {app.currentLocation || "—"}
                    </span>
                  </p>
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
                    disabled={!app.verification}
                    title={
                      app.verification
                        ? undefined
                        : "Identity verification not submitted yet"
                    }
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

              <VerificationPanel
                verification={app.verification}
                nationality={app.nationality}
                timezone={me.timezone}
                onRequestNew={() => {
                  setRequestingDocs(app);
                  setDocsReason("");
                }}
              />

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
        open={!!requestingDocs}
        onClose={() => setRequestingDocs(null)}
        title={`Request new documents from ${requestingDocs?.name ?? "applicant"}`}
      >
        <form onSubmit={onRequestDocs} className="space-y-4">
          <p className="text-sm text-slate-600">
            The application stays pending and the applicant is emailed a link to
            upload a new ID and retake their face scan.
          </p>
          <div>
            <label className="label" htmlFor="docs-reason">
              What&apos;s wrong with the documents? (required)
            </label>
            <textarea
              id="docs-reason"
              className="input"
              rows={4}
              placeholder="e.g. The photo of your ID is blurry and the expiry date isn't readable."
              value={docsReason}
              onChange={(e) => setDocsReason(e.target.value)}
              required
            />
          </div>
          <ErrorBanner message={error} onDismiss={() => setError("")} />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setRequestingDocs(null)}
            >
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={busy || !docsReason.trim()}>
              {busy ? "Sending…" : "Ask for new documents"}
            </button>
          </div>
        </form>
      </Modal>

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

export default function AdminApplicationsPage() {
  return (
    <Suspense fallback={<LoadingRows rows={3} />}>
      <AdminApplications />
    </Suspense>
  );
}
