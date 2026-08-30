"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useAction } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "@/convex/_generated/api";
import Turnstile from "@/components/Turnstile";
import CountrySelect from "@/components/CountrySelect";
import { cleanError } from "@/lib/errors";
import { MailCheck, ShieldCheck } from "lucide-react";

const MAX_VIDEO_BYTES = 210_000_000; // ~200 MB

export default function ApplyPage() {
  const router = useRouter();
  const me = useQuery(api.users.me);
  const { signIn } = useAuthActions();
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const submitApplication = useAction(api.tutors.submitApplication);

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    headline: "",
    bio: "",
    languagesTaught: [],
    nativeLanguages: "",
    nationality: "",
    currentLocation: "",
    specialties: "",
    hourlyRate: "20",
    qualifications: "",
  });
  const [photoFile, setPhotoFile] = useState(null);
  const [videoFile, setVideoFile] = useState(null);
  const [turnstileToken, setTurnstileToken] = useState(null);
  // idle | account | verify | uploading | submitting | done
  const [status, setStatus] = useState("idle");
  const [code, setCode] = useState("");
  const [resent, setResent] = useState(false);
  const [error, setError] = useState(null);

  const loggedIn = Boolean(me);
  const email = (loggedIn ? me.email : form.email).trim().toLowerCase();

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  function toggleLanguage(lang) {
    setForm((f) => ({
      ...f,
      languagesTaught: f.languagesTaught.includes(lang)
        ? f.languagesTaught.filter((l) => l !== lang)
        : [...f.languagesTaught, lang],
    }));
  }

  async function upload(file) {
    const url = await generateUploadUrl();
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": file.type },
      body: file,
    });
    if (!res.ok) throw new Error("Upload failed — please try again");
    const { storageId } = await res.json();
    return storageId;
  }

  /** Upload files and submit the application (requires a signed-in session). */
  async function finalize() {
    try {
      setStatus("uploading");
      setError(null);
      const photoStorageId = photoFile ? await upload(photoFile) : undefined;
      const introVideoStorageId = videoFile ? await upload(videoFile) : undefined;
      setStatus("submitting");
      await submitApplication({
        name: form.name.trim(),
        email,
        headline: form.headline.trim() || undefined,
        bio: form.bio.trim(),
        languagesTaught: form.languagesTaught,
        nativeLanguages: form.nativeLanguages
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        nationality: form.nationality,
        currentLocation: form.currentLocation,
        specialties: form.specialties
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        hourlyRateCents: Math.round(Number(form.hourlyRate) * 100),
        qualifications: form.qualifications.trim(),
        photoStorageId,
        introVideoStorageId,
        turnstileToken: turnstileToken ?? undefined,
      });
      setStatus("done");
      // Step 2 of the application: ID document + face scan.
      router.push("/apply/verify");
    } catch (err) {
      setError(cleanError(err));
      // Stay on a retryable step: account already exists/verified at this point.
      setStatus(loggedIn || status !== "idle" ? "verify_failed" : "idle");
    }
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    if (form.languagesTaught.length === 0) {
      setError("Select at least one language you teach.");
      return;
    }
    if (!form.nationality) {
      setError("Select your country of origin.");
      return;
    }
    if (!form.currentLocation) {
      setError("Select the country you currently live in.");
      return;
    }
    if (videoFile && videoFile.size > MAX_VIDEO_BYTES) {
      setError("Intro video must be under 200 MB.");
      return;
    }
    if (loggedIn) {
      // Already have an account — just submit the application.
      await finalize();
      return;
    }
    if (form.password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    try {
      setStatus("account");
      const result = await signIn("password", {
        name: form.name.trim(),
        email,
        password: form.password,
        flow: "signUp",
      });
      if (result?.signingIn) {
        // Verification not enforced (e.g. dev) — continue straight through.
        await finalize();
      } else {
        setStatus("verify");
      }
    } catch (err) {
      const message = String(err?.message ?? "");
      setError(
        message.toLowerCase().includes("already")
          ? "An account with this email already exists — log in first, then submit your application."
          : cleanError(err)
      );
      setStatus("idle");
    }
  }

  async function onVerify(e) {
    e.preventDefault();
    setError(null);
    try {
      setStatus("account");
      await signIn("password", {
        email,
        code: code.trim(),
        flow: "email-verification",
      });
      await finalize();
    } catch {
      setError("Invalid or expired code. Please try again.");
      setStatus("verify");
    }
  }

  async function onResend() {
    setError(null);
    setResent(false);
    try {
      await signIn("password", {
        name: form.name.trim(),
        email,
        password: form.password,
        flow: "signUp",
      });
      setResent(true);
    } catch (err) {
      setError(cleanError(err));
    }
  }

  if (status === "done") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-slate-50 px-4 py-12">
        <div className="card max-w-lg text-center">
          <div className="mx-auto mb-4 w-fit rounded-2xl bg-brand-50 p-4 text-brand-600">
            <ShieldCheck className="h-8 w-8" strokeWidth={1.75} />
          </div>
          <h1 className="text-xl font-bold text-slate-900">
            Application saved — one more step
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Before our team can review it, we need to confirm you are who you say
            you are: upload a government ID and scan your face. It takes about two
            minutes.
          </p>
          <Link href="/apply/verify" className="btn-primary mt-6">
            Verify my identity
          </Link>
        </div>
      </div>
    );
  }

  if (status === "verify" || (status === "account" && code)) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-slate-50 px-4 py-12">
        <div className="card w-full max-w-md text-center">
          <div className="mx-auto mb-4 w-fit rounded-2xl bg-brand-50 p-4 text-brand-600">
            <MailCheck className="h-8 w-8" strokeWidth={1.75} />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Verify your email</h1>
          <p className="mt-2 text-sm text-slate-500">
            We sent a 6-digit code to <strong className="text-slate-700">{email}</strong>.
            Enter it to verify your email and submit your application.
          </p>
          <form onSubmit={onVerify} className="mt-6 space-y-4">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="••••••"
              required
              className="input text-center text-2xl font-bold tracking-[0.5em]"
              aria-label="Verification code"
              autoFocus
            />
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            {resent && !error ? (
              <p className="text-sm text-green-600">A new code is on its way.</p>
            ) : null}
            <button
              className="btn-primary w-full"
              disabled={status === "account" || code.length !== 6}
            >
              {status === "account" ? "Verifying…" : "Verify & submit application"}
            </button>
          </form>
          <p className="mt-6 text-sm text-slate-500">
            Didn&apos;t get it?{" "}
            <button onClick={onResend} className="font-semibold text-brand-600 hover:underline">
              Resend code
            </button>
          </p>
        </div>
      </div>
    );
  }

  if (status === "verify_failed") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-slate-50 px-4 py-12">
        <div className="card w-full max-w-md text-center">
          <h1 className="text-xl font-bold text-slate-900">Almost there</h1>
          <p className="mt-2 text-sm text-slate-600">
            Your account is verified, but submitting the application failed:
          </p>
          {error ? <p className="mt-3 text-sm font-medium text-red-600">{error}</p> : null}
          <div className="mt-4 flex justify-center">
            <Turnstile onToken={setTurnstileToken} />
          </div>
          <button className="btn-primary mt-4 w-full" onClick={finalize}>
            Try submitting again
          </button>
        </div>
      </div>
    );
  }

  const busy = status !== "idle";

  return (
    <div className="bg-slate-50 py-12">
      <div className="container-page max-w-2xl">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-600">
          Step 1 of 2
        </p>
        <h1 className="section-title">Become a GoTalkify tutor</h1>
        <p className="section-subtitle">
          Teach English or French online, set your own hourly rate and get paid
          for every confirmed lesson. After this form you&apos;ll verify your
          identity with a government ID and a face scan, then our team reviews
          your application.
        </p>

        <form onSubmit={onSubmit} className="card mt-8 space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="name">Full name *</label>
              <input id="name" required className="input" value={form.name} onChange={set("name")} />
            </div>
            <div>
              <label className="label" htmlFor="email">Email *</label>
              <input
                id="email"
                type="email"
                required
                disabled={loggedIn}
                className="input disabled:bg-slate-100 disabled:text-slate-500"
                value={loggedIn ? me.email : form.email}
                onChange={set("email")}
              />
              {loggedIn ? (
                <p className="mt-1 text-xs text-slate-400">
                  Applying with your existing account.
                </p>
              ) : null}
            </div>
          </div>

          {!loggedIn ? (
            <div>
              <label className="label" htmlFor="password">Choose a password *</label>
              <input
                id="password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                className="input"
                value={form.password}
                onChange={set("password")}
              />
              <p className="mt-1 text-xs text-slate-400">
                At least 8 characters. Once your application is approved, you&apos;ll
                log in to your tutor dashboard with this email and password.
              </p>
            </div>
          ) : null}

          <div>
            <label className="label" htmlFor="headline">Headline</label>
            <input
              id="headline"
              className="input"
              placeholder="e.g. Certified TEFL teacher with 8 years of experience"
              value={form.headline}
              onChange={set("headline")}
            />
          </div>

          <div>
            <span className="label">Language(s) you teach *</span>
            <div className="flex gap-4">
              {[["en", "English"], ["fr", "French"]].map(([value, label]) => (
                <label key={value} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.languagesTaught.includes(value)}
                    onChange={() => toggleLanguage(value)}
                    className="h-4 w-4 rounded border-slate-300 text-brand-600"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="nationality">
                Country of origin (nationality) *
              </label>
              <CountrySelect
                id="nationality"
                required
                value={form.nationality}
                onChange={set("nationality")}
                placeholder="Select your country of origin"
              />
              <p className="mt-1 text-xs text-slate-400">
                Must match the government ID you upload in the next step.
              </p>
            </div>
            <div>
              <label className="label" htmlFor="currentLocation">
                Where you currently live *
              </label>
              <CountrySelect
                id="currentLocation"
                required
                value={form.currentLocation}
                onChange={set("currentLocation")}
                placeholder="Select the country you live in"
              />
              <p className="mt-1 text-xs text-slate-400">
                Students see this and it helps us match your teaching hours.
              </p>
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="native">Native language(s) *</label>
              <input
                id="native"
                required
                className="input"
                placeholder="e.g. English, Spanish"
                value={form.nativeLanguages}
                onChange={set("nativeLanguages")}
              />
            </div>
            <div>
              <label className="label" htmlFor="rate">Hourly rate (USD) *</label>
              <input
                id="rate"
                type="number"
                min="5"
                max="500"
                step="1"
                required
                className="input"
                value={form.hourlyRate}
                onChange={set("hourlyRate")}
              />
              <p className="mt-1 text-xs text-slate-400">
                Students pay this per hour. GoTalkify takes a 20% commission on completed lessons.
              </p>
            </div>
          </div>

          <div>
            <label className="label" htmlFor="specialties">Specialties</label>
            <input
              id="specialties"
              className="input"
              placeholder="e.g. Business English, IELTS prep, Kids"
              value={form.specialties}
              onChange={set("specialties")}
            />
            <p className="mt-1 text-xs text-slate-400">Comma-separated.</p>
          </div>

          <div>
            <label className="label" htmlFor="bio">About you *</label>
            <textarea
              id="bio"
              required
              rows={5}
              className="input"
              placeholder="Tell students about your teaching style and experience…"
              value={form.bio}
              onChange={set("bio")}
            />
          </div>

          <div>
            <label className="label" htmlFor="qualifications">Qualifications *</label>
            <textarea
              id="qualifications"
              required
              rows={3}
              className="input"
              placeholder="Certifications, degrees, teaching experience…"
              value={form.qualifications}
              onChange={set("qualifications")}
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="photo">Profile photo</label>
              <input
                id="photo"
                type="file"
                accept="image/*"
                className="input"
                onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <div>
              <label className="label" htmlFor="video">Intro video (mp4/webm, max 200 MB)</label>
              <input
                id="video"
                type="file"
                accept="video/mp4,video/webm"
                className="input"
                onChange={(e) => setVideoFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>

          <Turnstile onToken={setTurnstileToken} />

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <button className="btn-primary w-full" disabled={busy}>
            {status === "account"
              ? "Creating your account…"
              : status === "uploading"
                ? "Uploading files…"
                : status === "submitting"
                  ? "Submitting…"
                  : "Continue to identity verification"}
          </button>
          <p className="text-center text-xs text-slate-400">
            {!loggedIn
              ? "We'll email you a 6-digit code to verify your email, then ask for a government ID and a quick face scan."
              : "Next you'll upload a government ID and take a quick face scan."}
          </p>
        </form>
      </div>
    </div>
  );
}
