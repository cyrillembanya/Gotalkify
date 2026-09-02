"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthActions } from "@convex-dev/auth/react";
import { KeyRound } from "lucide-react";

function cleanError(error) {
  const message = String(error?.message ?? error ?? "");
  if (message.includes("InvalidSecret") || message.toLowerCase().includes("invalid code")) {
    return "Invalid or expired code. Please try again.";
  }
  if (message.toLowerCase().includes("password")) {
    return "Password must be at least 8 characters.";
  }
  return "Could not reset your password. Please try again.";
}

export default function ForgotPasswordPage() {
  const { signIn } = useAuthActions();
  const router = useRouter();
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  // step: "request" → "reset"
  const [step, setStep] = useState("request");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [resent, setResent] = useState(false);

  async function sendCode(address) {
    await signIn("password", { email: address, flow: "reset" });
  }

  async function onRequest(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const address = String(new FormData(e.target).get("email")).trim().toLowerCase();
    try {
      await sendCode(address);
    } catch (err) {
      // Unknown email: fall through anyway so this page can't be used to
      // check which addresses have an account.
      const message = String(err?.message ?? err ?? "");
      if (!message.includes("InvalidAccountId")) {
        setError(cleanError(err));
        setLoading(false);
        return;
      }
    }
    setEmail(address);
    setStep("reset");
    setLoading(false);
  }

  async function onReset(e) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    try {
      await signIn("password", {
        email,
        code: code.trim(),
        newPassword: password,
        flow: "reset-verification",
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
      await sendCode(email);
      setResent(true);
    } catch (err) {
      const message = String(err?.message ?? err ?? "");
      if (message.includes("InvalidAccountId")) setResent(true);
      else setError(cleanError(err));
    }
  }

  if (step === "reset") {
    return (
      <div className="flex min-h-[70vh] items-center justify-center bg-slate-50 px-4 py-12">
        <div className="card w-full max-w-md text-center">
          <div className="mx-auto mb-4 w-fit rounded-2xl bg-brand-50 p-4 text-brand-600">
            <KeyRound className="h-8 w-8" strokeWidth={1.75} />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Choose a new password</h1>
          <p className="mt-2 text-sm text-slate-500">
            If an account exists for <strong className="text-slate-700">{email}</strong>, we sent it
            a 6-digit code. Enter it below with your new password.
          </p>

          <form onSubmit={onReset} className="mt-6 space-y-4">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="••••••"
              required
              className="input text-center text-2xl font-bold tracking-[0.5em]"
              aria-label="Reset code"
              autoFocus
            />
            <div className="text-left">
              <label className="label" htmlFor="newPassword">New password</label>
              <input
                id="newPassword"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="input"
                autoComplete="new-password"
              />
              <p className="mt-1 text-xs text-slate-400">At least 8 characters.</p>
            </div>
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            {resent && !error ? (
              <p className="text-sm text-green-600">A new code is on its way.</p>
            ) : null}
            <button className="btn-primary w-full" disabled={loading || code.length !== 6}>
              {loading ? "Resetting…" : "Reset password & log in"}
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
        <h1 className="text-2xl font-bold text-slate-900">Forgot your password?</h1>
        <p className="mt-1 text-sm text-slate-500">
          Enter your email and we&apos;ll send you a code to set a new one.
        </p>

        <form onSubmit={onRequest} className="mt-6 space-y-4">
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" name="email" type="email" required className="input" autoComplete="email" />
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button className="btn-primary w-full" disabled={loading}>
            {loading ? "Sending code…" : "Send reset code"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          Remembered it?{" "}
          <Link href="/login" className="font-semibold text-brand-600 hover:underline">
            Back to log in
          </Link>
        </p>
      </div>
    </div>
  );
}
