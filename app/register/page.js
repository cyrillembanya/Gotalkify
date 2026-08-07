"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthActions } from "@convex-dev/auth/react";
import { MailCheck } from "lucide-react";

function cleanError(error) {
  const message = String(error?.message ?? error ?? "");
  if (message.toLowerCase().includes("already")) {
    return "An account with this email already exists — try logging in.";
  }
  if (message.includes("password")) {
    return "Password must be at least 8 characters.";
  }
  if (message.toLowerCase().includes("verification") || message.toLowerCase().includes("code")) {
    return "Invalid or expired code. Please try again.";
  }
  return "Could not create your account. Please try again.";
}

export default function RegisterPage() {
  const { signIn } = useAuthActions();
  const router = useRouter();
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  // step: "form" → "verify"
  const [step, setStep] = useState("form");
  const [signupData, setSignupData] = useState(null); // { name, email, password }
  const [code, setCode] = useState("");
  const [resent, setResent] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.target);
    const values = {
      name: String(formData.get("name")),
      email: String(formData.get("email")).trim().toLowerCase(),
      password: String(formData.get("password")),
    };
    if (values.password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    try {
      const result = await signIn("password", { ...values, flow: "signUp" });
      if (result?.signingIn) {
        router.push("/dashboard");
      } else {
        // Email verification required — a code was just sent.
        setSignupData(values);
        setStep("verify");
        setLoading(false);
      }
    } catch (err) {
      setError(cleanError(err));
      setLoading(false);
    }
  }

  async function onVerify(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signIn("password", {
        email: signupData.email,
        code: code.trim(),
        flow: "email-verification",
      });
      router.push("/dashboard");
    } catch (err) {
      setError(cleanError(err));
      setLoading(false);
    }
  }

  async function onResend() {
    setError(null);
    setResent(false);
    try {
      await signIn("password", { ...signupData, flow: "signUp" });
      setResent(true);
    } catch (err) {
      setError(cleanError(err));
    }
  }

  if (step === "verify") {
    return (
      <div className="flex min-h-[70vh] items-center justify-center bg-slate-50 px-4 py-12">
        <div className="card w-full max-w-md text-center">
          <div className="mx-auto mb-4 w-fit rounded-2xl bg-brand-50 p-4 text-brand-600">
            <MailCheck className="h-8 w-8" strokeWidth={1.75} />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Check your email</h1>
          <p className="mt-2 text-sm text-slate-500">
            We sent a 6-digit code to <strong className="text-slate-700">{signupData?.email}</strong>.
            Enter it below to activate your account.
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
            <button className="btn-primary w-full" disabled={loading || code.length !== 6}>
              {loading ? "Verifying…" : "Verify & create account"}
            </button>
          </form>

          <p className="mt-6 text-sm text-slate-500">
            Didn&apos;t get it?{" "}
            <button onClick={onResend} className="font-semibold text-brand-600 hover:underline">
              Resend code
            </button>
          </p>
          <p className="mt-2 text-xs text-slate-400">
            Check your spam folder too. The code expires in 15 minutes.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center bg-slate-50 px-4 py-12">
      <div className="card w-full max-w-md">
        <h1 className="text-2xl font-bold text-slate-900">Create your account</h1>
        <p className="mt-1 text-sm text-slate-500">
          Join GoTalkify and start learning with native tutors.
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label className="label" htmlFor="name">Full name</label>
            <input id="name" name="name" type="text" required className="input" autoComplete="name" />
          </div>
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" name="email" type="email" required className="input" autoComplete="email" />
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input id="password" name="password" type="password" required minLength={8} className="input" autoComplete="new-password" />
            <p className="mt-1 text-xs text-slate-400">At least 8 characters.</p>
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button className="btn-primary w-full" disabled={loading}>
            {loading ? "Creating account…" : "Sign up"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-brand-600 hover:underline">
            Log in
          </Link>
        </p>
        <p className="mt-2 text-center text-xs text-slate-400">
          Want to teach on GoTalkify?{" "}
          <Link href="/apply" className="text-brand-600 hover:underline">
            Apply as a tutor
          </Link>
        </p>
      </div>
    </div>
  );
}
