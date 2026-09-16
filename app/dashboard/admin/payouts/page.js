"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { fmtMoney, fmtDateTime } from "@/lib/format";
import {
  PageHeader,
  SectionCard,
  EmptyState,
  LoadingRows,
  Avatar,
  ErrorBanner,
} from "@/components/dashboard/ui";
import Modal from "@/components/Modal";
import { Banknote, Copy, Check } from "lucide-react";
import { useViewerTimezone } from "@/lib/useViewerTimezone";
import { cleanError } from "@/lib/errors";

const STATUS_BADGE = {
  paid: "badge-green",
  requested: "badge-yellow",
  processing: "badge-yellow",
  failed: "badge-red",
  cancelled: "badge-gray",
};

function methodLabel(payout) {
  if (payout.method === "paypal") return "PayPal";
  if (payout.method === "stripe" || payout.stripeTransferId) return "Stripe";
  return "—";
}

function CopyButton({ value }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };
  const Icon = copied ? Check : Copy;
  return (
    <button
      type="button"
      onClick={copy}
      className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
      aria-label={copied ? "Copied" : "Copy"}
      title={copied ? "Copied" : "Copy"}
    >
      <Icon className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
    </button>
  );
}

export default function AdminPayoutsPage() {
  const timezone = useViewerTimezone();
  const me = useQuery(api.users.me);
  const isAdmin = !!me && me.role === "admin";
  const requests = useQuery(api.admin.pendingPayoutRequests, isAdmin ? {} : "skip");
  const payouts = useQuery(api.admin.payoutLog, isAdmin ? {} : "skip");
  const markPaid = useMutation(api.admin.markPayoutPaid);
  const cancelRequest = useMutation(api.admin.cancelPayoutRequest);

  const [paying, setPaying] = useState(null);
  const [reference, setReference] = useState("");
  const [cancelling, setCancelling] = useState(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (me === undefined) return <LoadingRows rows={4} />;
  if (!isAdmin) {
    return (
      <div className="card">
        <p className="font-semibold text-slate-800">Admins only</p>
      </div>
    );
  }

  const closeModals = () => {
    setPaying(null);
    setCancelling(null);
    setReference("");
    setNote("");
    setError(null);
  };

  const submitPaid = async (e) => {
    e.preventDefault();
    if (!paying) return;
    setBusy(true);
    setError(null);
    try {
      await markPaid({ payoutId: paying._id, reference: reference.trim() || undefined });
      closeModals();
    } catch (err) {
      setError(cleanError(err));
    } finally {
      setBusy(false);
    }
  };

  const submitCancel = async (e) => {
    e.preventDefault();
    if (!cancelling || !note.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await cancelRequest({ payoutId: cancelling._id, note: note.trim() });
      closeModals();
    } catch (err) {
      setError(cleanError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tutor payouts"
        description="PayPal withdrawals to send by hand, plus the log of every payout made."
      />

      <SectionCard title="Pending PayPal requests">
        {requests === undefined ? (
          <LoadingRows rows={2} />
        ) : requests.length === 0 ? (
          <EmptyState
            compact
            icon={Banknote}
            title="Nothing to send"
            message="When a tutor requests a PayPal withdrawal it will appear here."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {requests.map((payout) => (
              <li
                key={payout._id}
                className="flex flex-col gap-4 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <Avatar name={payout.tutorName} size="h-10 w-10 text-sm" />
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-800">{payout.tutorName}</p>
                    <p className="flex items-center gap-1 text-sm text-slate-600">
                      <span className="text-slate-400">Send to</span>
                      <span className="truncate font-medium">{payout.paypalEmail}</span>
                      {payout.paypalEmail ? <CopyButton value={payout.paypalEmail} /> : null}
                    </p>
                    <p className="text-xs text-slate-400">
                      Requested {fmtDateTime(payout.createdAt, timezone)}
                      {payout.tutorEmail ? ` · ${payout.tutorEmail}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                  <span className="text-lg font-bold text-slate-900">
                    {fmtMoney(payout.amountCents)}
                  </span>
                  <button
                    type="button"
                    className="btn-primary px-4 py-2 text-sm"
                    onClick={() => setPaying(payout)}
                  >
                    Mark as paid
                  </button>
                  <button
                    type="button"
                    className="btn-secondary px-4 py-2 text-sm"
                    onClick={() => setCancelling(payout)}
                  >
                    Cancel
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Payout history">
        {payouts === undefined ? (
          <LoadingRows rows={5} />
        ) : payouts.length === 0 ? (
          <EmptyState
            compact
            icon={Banknote}
            title="No payouts yet"
            message="Payouts to tutors will show up here once the first withdrawal is processed."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Tutor</th>
                  <th className="text-right">Amount</th>
                  <th>Method</th>
                  <th>Status</th>
                  <th>Reference</th>
                </tr>
              </thead>
              <tbody>
                {payouts.map((payout) => (
                  <tr key={payout._id} className="transition-colors hover:bg-slate-50">
                    <td data-label="Date" className="whitespace-nowrap">
                      {fmtDateTime(payout.createdAt, timezone)}
                    </td>
                    <td data-primary>
                      <span className="flex items-center gap-3 font-medium text-slate-800">
                        <Avatar name={payout.tutorName} size="h-8 w-8 text-xs" />
                        {payout.tutorName}
                      </span>
                    </td>
                    <td data-label="Amount" className="text-right font-semibold">
                      {fmtMoney(payout.amountCents)}
                    </td>
                    <td data-label="Method" className="text-sm text-slate-600">
                      {methodLabel(payout)}
                      {payout.paypalEmail ? (
                        <span className="block text-xs text-slate-400">{payout.paypalEmail}</span>
                      ) : null}
                    </td>
                    <td data-label="Status">
                      <span className={STATUS_BADGE[payout.status] ?? "badge-gray"}>
                        {payout.status}
                      </span>
                      {payout.note ? (
                        <span className="mt-1 block text-xs text-slate-500">{payout.note}</span>
                      ) : null}
                    </td>
                    <td data-label="Reference" className="break-all font-mono text-xs text-slate-500">
                      {payout.stripeTransferId || payout.reference || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <Modal open={!!paying} onClose={closeModals} title="Mark payout as paid">
        {paying ? (
          <form onSubmit={submitPaid} className="space-y-4">
            <p className="text-sm text-slate-600">
              Confirm that you have sent{" "}
              <strong className="text-slate-900">{fmtMoney(paying.amountCents)}</strong> to{" "}
              <strong className="text-slate-900">{paying.paypalEmail}</strong> from PayPal. The
              tutor will be emailed that their payout is on the way.
            </p>
            <div>
              <label className="label" htmlFor="payout-reference">
                PayPal transaction ID (optional)
              </label>
              <input
                id="payout-reference"
                className="input"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="e.g. 1AB23456CD789012E"
                autoFocus
              />
            </div>
            {error ? <ErrorBanner message={error} onDismiss={() => setError(null)} /> : null}
            <div className="flex justify-end gap-3">
              <button type="button" className="btn-secondary" onClick={closeModals} disabled={busy}>
                Back
              </button>
              <button type="submit" className="btn-primary" disabled={busy}>
                {busy ? "Saving…" : "Yes, it's been sent"}
              </button>
            </div>
          </form>
        ) : null}
      </Modal>

      <Modal open={!!cancelling} onClose={closeModals} title="Cancel withdrawal request">
        {cancelling ? (
          <form onSubmit={submitCancel} className="space-y-4">
            <p className="text-sm text-slate-600">
              {fmtMoney(cancelling.amountCents)} goes back to {cancelling.tutorName}&apos;s
              available balance and they receive an email with the reason below.
            </p>
            <div>
              <label className="label" htmlFor="payout-note">Reason</label>
              <textarea
                id="payout-note"
                className="input min-h-[96px]"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. PayPal rejected this email address — please check it and request again."
                required
                autoFocus
              />
            </div>
            {error ? <ErrorBanner message={error} onDismiss={() => setError(null)} /> : null}
            <div className="flex justify-end gap-3">
              <button type="button" className="btn-secondary" onClick={closeModals} disabled={busy}>
                Back
              </button>
              <button type="submit" className="btn-danger" disabled={busy || !note.trim()}>
                {busy ? "Cancelling…" : "Cancel request"}
              </button>
            </div>
          </form>
        ) : null}
      </Modal>
    </div>
  );
}
