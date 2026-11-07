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
import { useConfirm } from "@/components/DialogProvider";

const STATUS_BADGE = {
  paid: "badge-green",
  requested: "badge-yellow",
  processing: "badge-yellow",
  unclaimed: "badge-yellow",
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

function PayoutSummary({ payout, timezone, children }) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <Avatar name={payout.tutorName} size="h-10 w-10 text-sm" />
      <div className="min-w-0">
        <p className="font-semibold text-slate-800">{payout.tutorName}</p>
        <p className="flex items-center gap-1 text-sm text-slate-600">
          <span className="text-slate-400">To</span>
          <span className="truncate font-medium">{payout.paypalEmail}</span>
          {payout.paypalEmail ? <CopyButton value={payout.paypalEmail} /> : null}
        </p>
        <p className="text-xs text-slate-400">
          Requested {fmtDateTime(payout.createdAt, timezone)}
          {payout.tutorEmail ? ` · ${payout.tutorEmail}` : ""}
        </p>
        {children}
      </div>
    </div>
  );
}

export default function AdminPayoutsPage() {
  const timezone = useViewerTimezone();
  const me = useQuery(api.users.me);
  const isAdmin = !!me && me.role === "admin";
  const requests = useQuery(api.admin.pendingPayoutRequests, isAdmin ? {} : "skip");
  const attention = useQuery(api.admin.payoutsNeedingAttention, isAdmin ? {} : "skip");
  const payouts = useQuery(api.admin.payoutLog, isAdmin ? {} : "skip");
  const approve = useMutation(api.admin.approvePayout);
  const retry = useMutation(api.admin.retryPayout);
  const returnToTutor = useMutation(api.admin.returnPayoutToTutor);
  const cancelUnclaimed = useMutation(api.admin.cancelUnclaimedPayout);
  const dismissAlert = useMutation(api.admin.dismissPayoutAlert);
  const markPaid = useMutation(api.admin.markPayoutPaid);
  const cancelRequest = useMutation(api.admin.cancelPayoutRequest);
  const confirm = useConfirm();

  const [paying, setPaying] = useState(null);
  const [reference, setReference] = useState("");
  // { payout, kind: "cancel" | "return" }: both ask for a reason the tutor will see.
  const [reasonFor, setReasonFor] = useState(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [pageError, setPageError] = useState(null);

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
    setReasonFor(null);
    setReference("");
    setNote("");
    setError(null);
  };

  const run = async (mutate, args) => {
    setBusy(true);
    setPageError(null);
    try {
      await mutate(args);
    } catch (err) {
      setPageError(cleanError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleApprove = async (payout) => {
    const ok = await confirm({
      title: "Approve and send?",
      message: `${fmtMoney(payout.amountCents)} will be sent to ${payout.paypalEmail} through PayPal right away. If you already sent this by hand, choose "Already sent" instead, or the tutor will be paid twice.`,
      confirmLabel: "Send payout",
    });
    if (ok) await run(approve, { payoutId: payout._id });
  };

  const handleCancelUnclaimed = async (payout) => {
    const ok = await confirm({
      title: "Cancel this payout?",
      message: `PayPal will take back ${fmtMoney(payout.amountCents)} and it returns to ${payout.tutorName}'s balance. If they claim it first, the cancellation won't go through.`,
      confirmLabel: "Cancel payout",
      danger: true,
    });
    if (ok) await run(cancelUnclaimed, { payoutId: payout._id });
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

  const submitReason = async (e) => {
    e.preventDefault();
    if (!reasonFor || !note.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const mutate = reasonFor.kind === "return" ? returnToTutor : cancelRequest;
      await mutate({ payoutId: reasonFor.payout._id, note: note.trim() });
      closeModals();
    } catch (err) {
      setError(cleanError(err));
    } finally {
      setBusy(false);
    }
  };

  const attentionActions = (payout) => {
    if (payout.status === "unclaimed") {
      return (
        <>
          {payout.needsAttention ? (
            <button
              type="button"
              className="btn-secondary px-4 py-2 text-sm"
              disabled={busy}
              onClick={() => run(dismissAlert, { payoutId: payout._id })}
            >
              Dismiss
            </button>
          ) : null}
          <button
            type="button"
            className="btn-secondary px-4 py-2 text-sm"
            disabled={busy}
            onClick={() => handleCancelUnclaimed(payout)}
          >
            Cancel payout
          </button>
        </>
      );
    }
    if (payout.status !== "processing") {
      return (
        <button
          type="button"
          className="btn-secondary px-4 py-2 text-sm"
          disabled={busy}
          onClick={() => run(dismissAlert, { payoutId: payout._id })}
        >
          Dismiss
        </button>
      );
    }
    if (payout.paypalBatchId && !payout.paypalRejected) {
      return (
        <button
          type="button"
          className="btn-secondary px-4 py-2 text-sm"
          disabled={busy}
          onClick={() => run(retry, { payoutId: payout._id })}
        >
          Check with PayPal
        </button>
      );
    }
    return (
      <>
        <button
          type="button"
          className="btn-primary px-4 py-2 text-sm"
          disabled={busy}
          onClick={() => run(retry, { payoutId: payout._id })}
        >
          Retry
        </button>
        {payout.paypalRejected ? (
          <button
            type="button"
            className="btn-secondary px-4 py-2 text-sm"
            disabled={busy}
            onClick={() => setReasonFor({ payout, kind: "return" })}
          >
            Return to tutor
          </button>
        ) : null}
      </>
    );
  };

  const attentionMessage = (payout) => {
    if (payout.needsAttention && payout.paypalError) return payout.paypalError;
    return "Waiting for the tutor to claim this on PayPal. It returns to their balance after 30 days.";
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tutor payouts"
        description="PayPal withdrawals are sent automatically. Anything that needs a decision appears here, along with the log of every payout."
      />

      {pageError ? <ErrorBanner message={pageError} onDismiss={() => setPageError(null)} /> : null}

      {attention && attention.length > 0 ? (
        <SectionCard title="Needs attention">
          <ul className="divide-y divide-slate-100">
            {attention.map((payout) => (
              <li
                key={payout._id}
                className="flex flex-col gap-4 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <PayoutSummary payout={payout} timezone={timezone}>
                  <p className="mt-1 break-words text-sm text-red-700">
                    {attentionMessage(payout)}
                  </p>
                </PayoutSummary>
                <div className="flex flex-wrap items-center gap-3 sm:shrink-0 sm:justify-end">
                  <span className="text-lg font-bold text-slate-900">
                    {fmtMoney(payout.amountCents)}
                  </span>
                  {attentionActions(payout)}
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}

      <SectionCard title="Waiting for approval">
        {requests === undefined ? (
          <LoadingRows rows={2} />
        ) : requests.length === 0 ? (
          <EmptyState
            compact
            icon={Banknote}
            title="Nothing to approve"
            message="PayPal withdrawals above your approval limit will appear here."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {requests.map((payout) => (
              <li
                key={payout._id}
                className="flex flex-col gap-4 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <PayoutSummary payout={payout} timezone={timezone} />
                <div className="flex flex-wrap items-center gap-3 sm:shrink-0 sm:justify-end">
                  <span className="text-lg font-bold text-slate-900">
                    {fmtMoney(payout.amountCents)}
                  </span>
                  <button
                    type="button"
                    className="btn-primary px-4 py-2 text-sm"
                    disabled={busy}
                    onClick={() => handleApprove(payout)}
                  >
                    Approve and send
                  </button>
                  <button
                    type="button"
                    className="btn-secondary px-4 py-2 text-sm"
                    disabled={busy}
                    onClick={() => setPaying(payout)}
                  >
                    Already sent
                  </button>
                  <button
                    type="button"
                    className="btn-secondary px-4 py-2 text-sm"
                    disabled={busy}
                    onClick={() => setReasonFor({ payout, kind: "cancel" })}
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

      <Modal open={!!paying} onClose={closeModals} title="Mark as already sent">
        {paying ? (
          <form onSubmit={submitPaid} className="space-y-4">
            <p className="text-sm text-slate-600">
              Confirm that you have already sent{" "}
              <strong className="text-slate-900">{fmtMoney(paying.amountCents)}</strong> to{" "}
              <strong className="text-slate-900">{paying.paypalEmail}</strong> by hand from PayPal.
              This doesn&apos;t send any money. The tutor will be emailed that their payout is on
              the way.
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

      <Modal
        open={!!reasonFor}
        onClose={closeModals}
        title={reasonFor?.kind === "return" ? "Return to tutor's balance" : "Cancel withdrawal request"}
      >
        {reasonFor ? (
          <form onSubmit={submitReason} className="space-y-4">
            <p className="text-sm text-slate-600">
              {fmtMoney(reasonFor.payout.amountCents)} goes back to {reasonFor.payout.tutorName}&apos;s
              available balance and they receive an email with the reason below.
            </p>
            <div>
              <label className="label" htmlFor="payout-note">Reason</label>
              <textarea
                id="payout-note"
                className="input min-h-[96px]"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. PayPal rejected this email address. Please check it and request again."
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
                {busy
                  ? "Saving…"
                  : reasonFor.kind === "return"
                    ? "Return to balance"
                    : "Cancel request"}
              </button>
            </div>
          </form>
        ) : null}
      </Modal>
    </div>
  );
}
