"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import FaceScan from "@/components/FaceScan";
import { cleanError } from "@/lib/errors";
import {
  BadgeCheck,
  Check,
  ClipboardCheck,
  IdCard,
  LogIn,
  ScanFace,
  ShieldAlert,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";

const MAX_IMAGE_BYTES = 10_000_000; // 10 MB per scan

const DOCUMENT_TYPES = [
  { value: "passport", label: "Passport", needsBack: false },
  { value: "national_id", label: "National ID card", needsBack: true },
  { value: "drivers_license", label: "Driver's licence", needsBack: true },
  { value: "residence_permit", label: "Residence permit", needsBack: true },
];

const STEPS = [
  { key: "id", label: "ID document", icon: IdCard },
  { key: "face", label: "Face scan", icon: ScanFace },
  { key: "review", label: "Review & submit", icon: ClipboardCheck },
];

function Shell({ children }) {
  return (
    <div className="bg-slate-50 py-12">
      <div className="container-page max-w-2xl">{children}</div>
    </div>
  );
}

function Centered({ icon: Icon, tone = "brand", title, children }) {
  const tones = {
    brand: "bg-brand-50 text-brand-600",
    green: "bg-green-100 text-green-600",
    red: "bg-red-100 text-red-600",
    yellow: "bg-yellow-100 text-yellow-700",
  };
  return (
    <div className="flex min-h-[60vh] items-center justify-center bg-slate-50 px-4 py-12">
      <div className="card w-full max-w-lg text-center">
        <div className={`mx-auto mb-4 w-fit rounded-2xl p-4 ${tones[tone]}`}>
          <Icon className="h-8 w-8" strokeWidth={1.75} />
        </div>
        <h1 className="text-xl font-bold text-slate-900">{title}</h1>
        {children}
      </div>
    </div>
  );
}

function StepBar({ current }) {
  const index = STEPS.findIndex((s) => s.key === current);
  return (
    <ol className="mt-6 flex items-center gap-2">
      {STEPS.map((step, i) => {
        const done = i < index;
        const active = i === index;
        const Icon = done ? Check : step.icon;
        return (
          <li key={step.key} className="flex flex-1 items-center gap-2">
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold ${
                done
                  ? "border-green-500 bg-green-500 text-white"
                  : active
                    ? "border-brand-600 bg-brand-600 text-white"
                    : "border-slate-300 bg-white text-slate-400"
              }`}
            >
              <Icon className="h-4 w-4" />
            </span>
            <span
              className={`hidden text-sm font-medium sm:block ${
                active ? "text-slate-900" : "text-slate-500"
              }`}
            >
              {step.label}
            </span>
            {i < STEPS.length - 1 ? (
              <span
                className={`h-px flex-1 ${done ? "bg-green-500" : "bg-slate-200"}`}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/** File picker with a thumbnail preview, used for the ID scans. */
function ImageUpload({ id, label, hint, file, previewUrl, onPick }) {
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <div className="flex items-start gap-4">
        <div className="flex h-24 w-36 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-slate-300 bg-slate-50">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt={label} className="h-full w-full object-cover" />
          ) : (
            <Upload className="h-6 w-6 text-slate-300" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <input
            id={id}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/heic"
            className="input"
            onChange={(e) => onPick(e.target.files?.[0] ?? null)}
          />
          <p className="mt-1 text-xs text-slate-400">{hint}</p>
          {file ? (
            <p className="mt-1 truncate text-xs text-slate-500">{file.name}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function VerifyIdentityPage() {
  const me = useQuery(api.users.me);
  const status = useQuery(api.verification.myStatus, me ? {} : "skip");
  const generateUploadUrl = useMutation(api.verification.generateUploadUrl);
  const submitVerification = useMutation(api.verification.submit);

  const [step, setStep] = useState("id");
  const [form, setForm] = useState({
    fullNameOnDocument: "",
    documentType: "passport",
    documentCountry: "",
    documentNumber: "",
    documentExpiry: "",
    dateOfBirth: "",
  });
  const [idFront, setIdFront] = useState(null);
  const [idFrontUrl, setIdFrontUrl] = useState(null);
  const [idBack, setIdBack] = useState(null);
  const [idBackUrl, setIdBackUrl] = useState(null);
  const [face, setFace] = useState(null);
  const [faceUrl, setFaceUrl] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const docType = DOCUMENT_TYPES.find((d) => d.value === form.documentType);

  function pickImage(setFile, setUrl, previousUrl) {
    return (file) => {
      setError("");
      if (file && !file.type.startsWith("image/")) {
        setError("Please upload a photo of your document (JPG, PNG or WebP).");
        return;
      }
      if (file && file.size > MAX_IMAGE_BYTES) {
        setError("Each image must be under 10 MB.");
        return;
      }
      if (previousUrl) URL.revokeObjectURL(previousUrl);
      setFile(file);
      setUrl(file ? URL.createObjectURL(file) : null);
    };
  }

  async function upload(file) {
    const url = await generateUploadUrl();
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": file.type },
      body: file,
    });
    if (!res.ok) throw new Error("Upload failed — please check your connection and try again");
    const { storageId } = await res.json();
    return storageId;
  }

  function onIdStepSubmit(e) {
    e.preventDefault();
    setError("");
    if (!idFront) {
      setError("Upload a photo of the front of your document.");
      return;
    }
    if (docType?.needsBack && !idBack) {
      setError("Upload the back of your document too.");
      return;
    }
    setStep("face");
  }

  async function onSubmit() {
    setError("");
    try {
      setBusy("uploading");
      const idFrontStorageId = await upload(idFront);
      const idBackStorageId = idBack ? await upload(idBack) : undefined;
      const faceStorageId = await upload(face);
      setBusy("submitting");
      await submitVerification({
        documentType: form.documentType,
        documentCountry: form.documentCountry.trim(),
        documentNumber: form.documentNumber.trim(),
        documentExpiry: form.documentExpiry || undefined,
        fullNameOnDocument: form.fullNameOnDocument.trim(),
        dateOfBirth: form.dateOfBirth || undefined,
        idFrontStorageId,
        idBackStorageId,
        faceStorageId,
      });
      setSubmitted(true);
    } catch (err) {
      setError(cleanError(err));
    } finally {
      setBusy("");
    }
  }

  /* ------------------------------- gate states ------------------------------- */

  if (me === undefined || (me && status === undefined)) {
    return (
      <Shell>
        <div className="card animate-pulse space-y-4">
          <div className="h-6 w-1/3 rounded bg-slate-100" />
          <div className="h-24 rounded bg-slate-100" />
        </div>
      </Shell>
    );
  }

  if (me === null) {
    return (
      <Centered icon={LogIn} title="Sign in to continue">
        <p className="mt-2 text-sm text-slate-600">
          Identity verification is tied to your tutor account. Log in with the
          email you applied with to upload your ID and scan your face.
        </p>
        <Link href="/login" className="btn-primary mt-6">
          Log in
        </Link>
      </Centered>
    );
  }

  const application = status?.application ?? null;
  const verification = status?.verification ?? null;

  if (!application) {
    return (
      <Centered icon={ShieldAlert} tone="yellow" title="No application found">
        <p className="mt-2 text-sm text-slate-600">
          We couldn&apos;t find a tutor application for{" "}
          <strong>{me.email}</strong>. Fill in the application form first — the
          identity check is the second step.
        </p>
        <Link href="/apply" className="btn-primary mt-6">
          Start the application
        </Link>
      </Centered>
    );
  }

  if (application.approvalStatus === "approved") {
    return (
      <Centered icon={BadgeCheck} tone="green" title="You're verified">
        <p className="mt-2 text-sm text-slate-600">
          Your identity has been confirmed and your tutor profile is live.
        </p>
        <Link href="/dashboard" className="btn-primary mt-6">
          Go to my dashboard
        </Link>
      </Centered>
    );
  }

  if (application.approvalStatus === "rejected") {
    return (
      <Centered icon={X} tone="red" title="Application not approved">
        <p className="mt-2 text-sm text-slate-600">
          Our team reviewed your application and couldn&apos;t approve it.
        </p>
        {application.rejectionReason ? (
          <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {application.rejectionReason}
          </p>
        ) : null}
        <Link href="/contact" className="btn-secondary mt-6">
          Contact us
        </Link>
      </Centered>
    );
  }

  if (submitted || verification?.status === "pending") {
    return (
      <Centered icon={ShieldCheck} tone="green" title="Verification submitted">
        <p className="mt-2 text-sm text-slate-600">
          Thanks — your ID and face scan are with our team. We compare them
          against your application and email you at{" "}
          <strong>{application.email}</strong> as soon as it&apos;s approved or
          rejected, usually within one business day.
        </p>
        <Link href="/dashboard" className="btn-primary mt-6">
          Go to my dashboard
        </Link>
      </Centered>
    );
  }

  /* --------------------------------- the form -------------------------------- */

  const resubmitting = verification?.status === "rejected";

  return (
    <Shell>
      <p className="text-sm font-semibold uppercase tracking-wide text-brand-600">
        Step 2 of 2
      </p>
      <h1 className="section-title">Verify your identity</h1>
      <p className="section-subtitle">
        Students book one-to-one lessons with you, so we confirm every tutor is a
        real person. Upload a government ID, then take a quick face scan — an
        admin checks that the two match and approves your application.
      </p>

      {resubmitting ? (
        <div className="mt-6 rounded-2xl border border-yellow-200 bg-yellow-50 px-5 py-4 text-sm text-yellow-800">
          <p className="font-semibold">We need new documents</p>
          {verification.rejectionReason ? (
            <p className="mt-1">{verification.rejectionReason}</p>
          ) : null}
          <p className="mt-1">
            Please upload a clear photo of your ID and take a new face scan.
          </p>
        </div>
      ) : null}

      <StepBar current={step} />

      {step === "id" ? (
        <form onSubmit={onIdStepSubmit} className="card mt-6 space-y-5">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Your ID document</h2>
            <p className="mt-1 text-sm text-slate-500">
              A passport, national ID card, driver&apos;s licence or residence
              permit. Make sure all four corners are visible and the text is
              readable — blurry photos get rejected.
            </p>
          </div>

          <div>
            <label className="label" htmlFor="fullNameOnDocument">
              Full name as printed on the document *
            </label>
            <input
              id="fullNameOnDocument"
              required
              className="input"
              value={form.fullNameOnDocument}
              onChange={set("fullNameOnDocument")}
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="documentType">
                Document type *
              </label>
              <select
                id="documentType"
                className="input"
                value={form.documentType}
                onChange={set("documentType")}
              >
                {DOCUMENT_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="documentCountry">
                Issuing country *
              </label>
              <input
                id="documentCountry"
                required
                className="input"
                placeholder="e.g. Canada"
                value={form.documentCountry}
                onChange={set("documentCountry")}
              />
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="documentNumber">
                Document number *
              </label>
              <input
                id="documentNumber"
                required
                minLength={4}
                className="input"
                value={form.documentNumber}
                onChange={set("documentNumber")}
              />
            </div>
            <div>
              <label className="label" htmlFor="documentExpiry">
                Expiry date
              </label>
              <input
                id="documentExpiry"
                type="date"
                className="input"
                value={form.documentExpiry}
                onChange={set("documentExpiry")}
              />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="dateOfBirth">
              Date of birth
            </label>
            <input
              id="dateOfBirth"
              type="date"
              className="input sm:max-w-xs"
              value={form.dateOfBirth}
              onChange={set("dateOfBirth")}
            />
          </div>

          <ImageUpload
            id="idFront"
            label={`Photo of the ${docType?.needsBack ? "front" : "photo page"} *`}
            hint="JPG, PNG or WebP, up to 10 MB."
            file={idFront}
            previewUrl={idFrontUrl}
            onPick={pickImage(setIdFront, setIdFrontUrl, idFrontUrl)}
          />

          {docType?.needsBack ? (
            <ImageUpload
              id="idBack"
              label="Photo of the back *"
              hint="The side with the machine-readable strip or barcode."
              file={idBack}
              previewUrl={idBackUrl}
              onPick={pickImage(setIdBack, setIdBackUrl, idBackUrl)}
            />
          ) : null}

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <button className="btn-primary w-full">Continue to face scan</button>
        </form>
      ) : null}

      {step === "face" ? (
        <div className="card mt-6 space-y-5">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Face scan</h2>
            <p className="mt-1 text-sm text-slate-500">
              Look straight at the camera in a well-lit room, fit your face inside
              the oval and hold still for the countdown. No hats, sunglasses or
              filters — we compare this to the photo on your ID.
            </p>
          </div>

          <FaceScan
            preview={faceUrl}
            onCapture={(file, url) => {
              setError("");
              setFace(file);
              setFaceUrl(url);
            }}
            onRetake={() => {
              if (faceUrl) URL.revokeObjectURL(faceUrl);
              setFace(null);
              setFaceUrl(null);
            }}
          />

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="btn-secondary flex-1"
              onClick={() => setStep("id")}
            >
              Back
            </button>
            <button
              type="button"
              className="btn-primary flex-1"
              disabled={!face}
              onClick={() => setStep("review")}
            >
              Continue
            </button>
          </div>
        </div>
      ) : null}

      {step === "review" ? (
        <div className="card mt-6 space-y-5">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Review &amp; submit</h2>
            <p className="mt-1 text-sm text-slate-500">
              Check that everything is readable, then send it to our team for
              approval.
            </p>
          </div>

          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            {[
              ["Name on document", form.fullNameOnDocument],
              ["Document", docType?.label],
              ["Issuing country", form.documentCountry],
              ["Document number", form.documentNumber],
              ["Expiry date", form.documentExpiry || "—"],
              ["Date of birth", form.dateOfBirth || "—"],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {label}
                </dt>
                <dd className="text-slate-800">{value}</dd>
              </div>
            ))}
          </dl>

          <div className="grid gap-4 sm:grid-cols-3">
            {[
              [idFrontUrl, "ID front"],
              [idBackUrl, "ID back"],
              [faceUrl, "Face scan"],
            ]
              .filter(([url]) => url)
              .map(([url, label]) => (
                <figure key={label}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={label}
                    className="h-28 w-full rounded-xl border border-slate-200 object-cover"
                  />
                  <figcaption className="mt-1 text-xs text-slate-500">{label}</figcaption>
                </figure>
              ))}
          </div>

          <p className="rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-500">
            Your documents are stored securely and are only visible to GoTalkify
            administrators reviewing your application. They are never shown on
            your public tutor profile.
          </p>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="btn-secondary flex-1"
              disabled={!!busy}
              onClick={() => setStep("face")}
            >
              Back
            </button>
            <button
              type="button"
              className="btn-primary flex-1"
              disabled={!!busy}
              onClick={onSubmit}
            >
              {busy === "uploading"
                ? "Uploading…"
                : busy === "submitting"
                  ? "Submitting…"
                  : "Submit for approval"}
            </button>
          </div>
        </div>
      ) : null}
    </Shell>
  );
}
