"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import SlotPicker from "@/components/SlotPicker";
import StarRating from "@/components/StarRating";
import { fmtMoney, browserTimezone } from "@/lib/format";

function cleanError(error) {
  if (typeof error?.data === "string" && error.data.trim()) return error.data.trim();
  return String(error?.message ?? error ?? "")
    .replace(/^.*Uncaught (?:ConvexError|Error):\s*/, "")
    .split("\n")[0] || "Something went wrong. Please try again.";
}

export default function BookTrialPage() {
  const router = useRouter();
  const tutors = useQuery(api.tutors.list, {});
  const me = useQuery(api.users.me);
  const createTrialCheckout = useAction(api.stripe.createTrialCheckout);

  const [selectedTutor, setSelectedTutor] = useState(null);
  const [slot, setSlot] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const timezone = me?.timezone ?? browserTimezone();

  async function pay() {
    if (!me) {
      router.push("/register");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { url } = await createTrialCheckout({
        tutorId: selectedTutor.userId,
        startUTC: slot,
      });
      window.location.href = url;
    } catch (err) {
      setError(cleanError(err));
      setBusy(false);
    }
  }

  return (
    <div className="bg-slate-50 py-10">
      <div className="container-page max-w-4xl">
        <h1 className="section-title">Book a trial lesson</h1>
        <p className="section-subtitle">
          Pick a tutor, choose a time and pay — your 60-minute one-on-one trial
          is charged at the tutor&apos;s regular hourly rate.
        </p>

        {/* Step 1: pick tutor */}
        <div className="mt-8">
          <h2 className="mb-3 font-bold text-slate-900">1 · Choose your tutor</h2>
          {tutors === undefined ? (
            <p className="text-sm text-slate-500">Loading tutors…</p>
          ) : tutors.length === 0 ? (
            <div className="card text-center text-sm text-slate-500">
              No tutors are available yet — check back soon!
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {tutors.map((tutor) => (
                <button
                  key={tutor._id}
                  onClick={() => {
                    setSelectedTutor(tutor);
                    setSlot(null);
                    setError(null);
                  }}
                  disabled={!tutor.userId}
                  className={`card p-4 text-left transition-all ${
                    selectedTutor?._id === tutor._id
                      ? "ring-2 ring-brand-600"
                      : "hover:shadow-lg"
                  } ${!tutor.userId ? "opacity-50" : ""}`}
                >
                  <div className="flex items-center gap-3">
                    {tutor.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={tutor.photoUrl}
                        alt={tutor.name}
                        className="h-12 w-12 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-brand-100 font-bold text-brand-700">
                        {tutor.name.charAt(0)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-900">{tutor.name}</p>
                      <div className="flex items-center gap-1">
                        <StarRating value={tutor.rating ?? 0} size="h-3 w-3" />
                        <span className="text-xs font-semibold text-slate-700">
                          {fmtMoney(tutor.hourlyRateCents)}/h
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Step 2: pick slot */}
        {selectedTutor ? (
          <div className="mt-8">
            <h2 className="mb-3 font-bold text-slate-900">
              2 · Pick a time with {selectedTutor.name}
            </h2>
            <div className="card">
              <SlotPicker
                tutorUserId={selectedTutor.userId}
                timezone={timezone}
                selected={slot}
                onSelect={setSlot}
              />
            </div>
          </div>
        ) : null}

        {/* Step 3: pay */}
        {selectedTutor && slot ? (
          <div className="mt-8">
            <h2 className="mb-3 font-bold text-slate-900">3 · Confirm and pay</h2>
            <div className="card flex flex-wrap items-center justify-between gap-4">
              <p className="text-sm text-slate-600">
                Trial lesson with <strong>{selectedTutor.name}</strong> —{" "}
                <strong>{fmtMoney(selectedTutor.hourlyRateCents)}</strong>
              </p>
              <button className="btn-primary" onClick={pay} disabled={busy}>
                {busy ? "Redirecting…" : me ? "Pay & book trial" : "Create account to book"}
              </button>
            </div>
            {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
          </div>
        ) : null}

        <p className="mt-10 text-center text-sm text-slate-500">
          Prefer to browse full profiles with videos and reviews first?{" "}
          <Link href="/tutors" className="text-brand-600 hover:underline">
            Explore all tutors
          </Link>
        </p>
      </div>
    </div>
  );
}
