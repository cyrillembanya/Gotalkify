"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthActions } from "@convex-dev/auth/react";

function cleanError(error) {
  const message = String(error?.message ?? error ?? "");
  if (message.includes("InvalidSecret") || message.includes("InvalidAccountId")) {
    return "Invalid email or password.";
  }
  return "Could not sign you in. Please check your details and try again.";
}

export default function LoginPage() {
  const { signIn } = useAuthActions();
  const router = useRouter();
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  // Set when the account still needs email verification (code auto-sent).
  const [verifyEmail, setVerifyEmail] = useState(null);
  const [code, setCode] = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const formData = new FormData(e.target);
    formData.set("flow", "signIn");
    try {
      const result = await signIn("password", formData);
      if (result?.signingIn === false) {
        // Unverified account — Convex Auth just emailed a code.
        setVerifyEmail(String(formData.get("email")).trim().toLowerCase());
        setLoading(false);
        return;
      }
      router.push("/dashboard");
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
        email: verifyEmail,
        code: code.trim(),
        flow: "email-verification",
      });
      router.push("/dashboard");
    } catch {
      setError("Invalid or expired code. Please try again.");
      setLoading(false);
    }
  }

  if (verifyEmail) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center bg-slate-50 px-4 py-12">
        <div className="card w-full max-w-md text-center">
          <h1 className="text-2xl font-bold text-slate-900">Verify your email</h1>
          <p className="mt-2 text-sm text-slate-500">
            Your email isn&apos;t verified yet. We sent a 6-digit code to{" "}
            <strong className="text-slate-700">{verifyEmail}</strong>.
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
            <button className="btn-primary w-full" disabled={loading || code.length !== 6}>
              {loading ? "Verifying…" : "Verify & log in"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center bg-slate-50 px-4 py-12">
      <div className="card w-full max-w-md">
        <h1 className="text-2xl font-bold text-slate-900">Welcome back</h1>
        <p className="mt-1 text-sm text-slate-500">Log in to your GoTalkify account.</p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" name="email" type="email" required className="input" autoComplete="email" />
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input id="password" name="password" type="password" required className="input" autoComplete="current-password" />
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button className="btn-primary w-full" disabled={loading}>
            {loading ? "Signing in…" : "Log in"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          New to GoTalkify?{" "}
          <Link href="/register" className="font-semibold text-brand-600 hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
