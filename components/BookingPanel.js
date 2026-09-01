"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import SlotPicker from "@/components/SlotPicker";
import { fmtMoney, fmtDateTime } from "@/lib/format";
import { useViewerTimezone } from "@/lib/useViewerTimezone";

function cleanError(error) {
  if (typeof error?.data === "string" && error.data.trim()) return error.data.trim();
  return String(error?.message ?? error ?? "")
    .replace(/^.*Uncaught (?:ConvexError|Error):\s*/, "")
    .split("\n")[0] || "Something went wrong. Please try again.";
}

export function BookingPanel({ profile }) {
  const router = useRouter();
  const timezone = useViewerTimezone();
  const me = useQuery(api.users.me);
  const balances = useQuery(api.balances.mine, me ? {} : "skip");
  const createTrialCheckout = useAction(api.stripe.createTrialCheckout);
  const createPackageCheckout = useAction(api.stripe.createPackageCheckout);
  const createSubscriptionCheckout = useAction(api.stripe.createSubscriptionCheckout);
  const book = useMutation(api.booking.book);

  const [tab, setTab] = useState("trial");
  const [slot, setSlot] = useState(null);
  const [recurring, setRecurring] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [booked, setBooked] = useState(null);

  const tutorUserId = profile.userId;
  const balance = (balances ?? []).find((b) => b.tutorId === tutorUserId);
  const hoursLeft = balance ? balance.minutesRemaining / 60 : 0;

  if (!tutorUserId) {
    return (
      <div className="card">
        <p className="text-sm text-slate-600">
          This tutor is finishing their account setup. Check back soon to book a lesson.
        </p>
      </div>
    );
  }

  async function requireLogin() {
    router.push("/register");
  }

  async function run(fn) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(cleanError(err));
    } finally {
      setBusy(false);
    }
  }

  const tabs = [
    { id: "trial", label: "Trial lesson" },
    { id: "book", label: `Book a lesson${balance ? ` (${hoursLeft.toFixed(1)}h left)` : ""}` },
    { id: "buy", label: "Buy hours" },
  ];

  return (
    <div className="card">
      <div className="mb-4 flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); setError(null); setBooked(null); }}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              tab === t.id ? "bg-white text-brand-700 shadow-sm" : "text-slate-500"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {booked ? (
        <div className="rounded-lg bg-green-50 p-4 text-sm text-green-800">
          <p className="font-semibold">Lesson booked! 🎉</p>
          <p className="mt-1">
            {booked.count} lesson{booked.count > 1 ? "s" : ""} scheduled, starting{" "}
            <strong>{fmtDateTime(booked.times[0], timezone, { withZone: true })}</strong>{" "}
            your time. Class links and details are on your dashboard.
          </p>
          <Link href="/dashboard/lessons" className="btn-primary mt-3">
            View my lessons
          </Link>
        </div>
      ) : null}

      {tab === "trial" && !booked ? (
        <div>
          <p className="mb-3 text-sm text-slate-600">
            A trial is a full 60-minute one-on-one lesson at {profile.name}&apos;s
            regular rate of <strong>{fmtMoney(profile.hourlyRateCents)}</strong>.
            One trial per tutor.
          </p>
          <SlotPicker
            tutorUserId={tutorUserId}
            tutorName={profile.name}
            selected={slot}
            onSelect={setSlot}
          />
          <button
            className="btn-primary mt-4 w-full"
            disabled={!slot || busy}
            onClick={() =>
              !me
                ? requireLogin()
                : run(async () => {
                    const { url } = await createTrialCheckout({
                      tutorId: tutorUserId,
                      startUTC: slot,
                    });
                    window.location.href = url;
                  })
            }
          >
            {busy
              ? "Redirecting to payment…"
              : `Book trial — ${fmtMoney(profile.hourlyRateCents)}`}
          </button>
          {!me ? (
            <p className="mt-2 text-center text-xs text-slate-400">
              You&apos;ll be asked to create an account first.
            </p>
          ) : null}
        </div>
      ) : null}

      {tab === "book" && !booked ? (
        <div>
          {!me ? (
            <p className="text-sm text-slate-600">
              <Link href="/login" className="text-brand-600 underline">Log in</Link>{" "}
              to book lessons with your prepaid hours.
            </p>
          ) : !balance || hoursLeft < 1 ? (
            <p className="text-sm text-slate-600">
              You need prepaid hours with {profile.name} to book a lesson. Start
              with a <button className="text-brand-600 underline" onClick={() => setTab("trial")}>trial</button>{" "}
              or <button className="text-brand-600 underline" onClick={() => setTab("buy")}>buy hours</button>.
            </p>
          ) : (
            <>
              <p className="mb-3 text-sm text-slate-600">
                You have <strong>{hoursLeft.toFixed(1)} hours</strong> with {profile.name}.
                Booking uses 1 hour per lesson.
              </p>
              <SlotPicker
                tutorUserId={tutorUserId}
                tutorName={profile.name}
                selected={slot}
                onSelect={setSlot}
              />
              <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={recurring}
                  onChange={(e) => setRecurring(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-brand-600"
                />
                Repeat weekly at this time (books as many weeks as your hours cover)
              </label>
              <button
                className="btn-primary mt-4 w-full"
                disabled={!slot || busy}
                onClick={() =>
                  run(async () => {
                    const result = await book({
                      tutorId: tutorUserId,
                      startUTC: slot,
                      recurring,
                    });
                    setBooked({ count: result.booked, times: result.times });
                    setSlot(null);
                  })
                }
              >
                {busy ? "Booking…" : recurring ? "Book weekly lessons" : "Book lesson"}
              </button>
            </>
          )}
        </div>
      ) : null}

      {tab === "buy" && !booked ? (
        <div className="space-y-5">
          <div>
            <p className="mb-2 text-sm font-semibold text-slate-800">One-time packages</p>
            <div className="grid grid-cols-2 gap-2">
              {[5, 10].map((hours) => (
                <button
                  key={hours}
                  className="btn-secondary flex-col py-3"
                  disabled={busy}
                  onClick={() =>
                    !me
                      ? requireLogin()
                      : run(async () => {
                          const { url } = await createPackageCheckout({
                            tutorId: tutorUserId,
                            hours,
                          });
                          window.location.href = url;
                        })
                  }
                >
                  <span className="text-base font-bold">{hours} hours</span>
                  <span className="text-xs text-slate-500">
                    {fmtMoney(profile.hourlyRateCents * hours)}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1 text-sm font-semibold text-slate-800">Monthly subscription</p>
            <p className="mb-2 text-xs text-slate-500">
              Renews every 28 days. Unused hours roll over while active. Cancel anytime.
            </p>
            <div className="grid grid-cols-3 gap-2">
              {[2, 4, 8].map((hours) => (
                <button
                  key={hours}
                  className="btn-secondary flex-col py-3"
                  disabled={busy}
                  onClick={() =>
                    !me
                      ? requireLogin()
                      : run(async () => {
                          const { url } = await createSubscriptionCheckout({
                            tutorId: tutorUserId,
                            hoursPerCycle: hours,
                          });
                          window.location.href = url;
                        })
                  }
                >
                  <span className="text-base font-bold">{hours}h</span>
                  <span className="text-xs text-slate-500">
                    {fmtMoney(profile.hourlyRateCents * hours)}/cycle
                  </span>
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-slate-400">
            Hours are tied to {profile.name} and priced at their current rate.
            Payments are held by GoTalkify and released to the tutor after each
            confirmed lesson.
          </p>
        </div>
      ) : null}

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}

export function MessageButton({ profile }) {
  const router = useRouter();
  const me = useQuery(api.users.me);
  const start = useMutation(api.messages.startWithTutor);
  const [error, setError] = useState(null);
  if (!me || !profile.userId || me._id === profile.userId) return null;
  return (
    <div>
      <button
        className="btn-secondary w-full"
        onClick={async () => {
          try {
            const conversationId = await start({ tutorId: profile.userId });
            router.push(`/dashboard/messages?c=${conversationId}`);
          } catch (err) {
            setError(cleanError(err));
          }
        }}
      >
        Message {profile.name.split(" ")[0]}
      </button>
      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
