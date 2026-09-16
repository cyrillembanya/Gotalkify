"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useAction, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { fmtMoney, fmtDateTime } from "@/lib/format";
import {
  PageHeader,
  StatCard,
  SectionCard,
  EmptyState,
  LoadingRows,
  ErrorBanner,
} from "@/components/dashboard/ui";
import { Hourglass, Landmark, Lock, Wallet, CreditCard, Mail } from "lucide-react";
import { useViewerTimezone } from "@/lib/useViewerTimezone";
import { cleanError } from "@/lib/errors";
import { useConfirm } from "@/components/DialogProvider";


function payoutBadge(status) {
  if (status === "paid") return <span className="badge-green">Paid</span>;
  if (status === "requested") return <span className="badge-yellow">Requested</span>;
  if (status === "processing") return <span className="badge-yellow">Processing</span>;
  if (status === "failed") return <span className="badge-red">Failed</span>;
  if (status === "cancelled") return <span className="badge-gray">Cancelled</span>;
  return <span className="badge-gray">{status}</span>;
}

function payoutMethodLabel(payout) {
  if (payout.method === "paypal") return `PayPal · ${payout.paypalEmail ?? ""}`;
  if (payout.method === "stripe" || payout.stripeTransferId) return "Stripe";
  return "—";
}

function MethodOption({ selected, onSelect, icon: Icon, title, description }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex flex-1 items-start gap-3 rounded-2xl border p-4 text-left transition-colors ${
        selected
          ? "border-brand-600 bg-brand-50"
          : "border-slate-200 bg-white hover:border-slate-300"
      }`}
    >
      <span
        className={`mt-0.5 rounded-xl p-2 ${
          selected ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-500"
        }`}
      >
        <Icon className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
      </span>
      <span>
        <span className="block font-semibold text-slate-800">{title}</span>
        <span className="mt-0.5 block text-xs text-slate-500">{description}</span>
      </span>
    </button>
  );
}

function ConnectBanner() {
  const searchParams = useSearchParams();
  const connect = searchParams.get("connect");
  if (connect === "done") {
    return (
      <div className="rounded-2xl border border-green-200 bg-green-50 px-5 py-4 text-sm text-green-800">
        Stripe onboarding complete. It may take a moment for your payout status
        to update.
      </div>
    );
  }
  if (connect === "refresh") {
    return (
      <div className="rounded-2xl border border-yellow-200 bg-yellow-50 px-5 py-4 text-sm text-yellow-800">
        Stripe onboarding was interrupted. Please try again below.
      </div>
    );
  }
  return null;
}

export default function WalletPage() {
  const timezone = useViewerTimezone();
  const me = useQuery(api.users.me);
  const wallet = useQuery(api.wallet.mine, me?.role === "tutor" ? {} : "skip");
  const createOnboardingLink = useAction(api.stripe.createConnectOnboardingLink);
  const requestWithdrawal = useAction(api.stripe.requestWithdrawal);
  const requestPaypalPayout = useMutation(api.wallet.requestPaypalPayout);
  const setPayoutMethod = useMutation(api.wallet.setPayoutMethod);
  const confirm = useConfirm();

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null); // { kind: "ok"|"err", text }
  const [method, setMethod] = useState(null);
  const [paypalEmail, setPaypalEmail] = useState(null);

  if (me && me.role !== "tutor") {
    return (
      <div className="space-y-6">
        <PageHeader title="Wallet" />
        <div className="card">
          <EmptyState
            compact
            icon={Lock}
            title="Tutors only"
            message="This page is for tutors only."
          />
        </div>
      </div>
    );
  }
  if (me === undefined || !me || wallet === undefined) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Wallet"
          description="Your balance, payout setup and withdrawal history."
        />
        <div className="card">
          <LoadingRows rows={3} />
        </div>
      </div>
    );
  }

  const handleOnboard = async () => {
    setMessage(null);
    setBusy(true);
    try {
      const result = await createOnboardingLink();
      window.location.href = result.url;
    } catch (err) {
      setMessage({ kind: "err", text: cleanError(err) });
      setBusy(false);
    }
  };

  const handleWithdraw = async () => {
    setMessage(null);
    const ok = await confirm({
      title: "Withdraw to Stripe?",
      message: `${fmtMoney(wallet.availableCents)} will be transferred to your connected Stripe account.`,
      confirmLabel: "Withdraw",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const result = await requestWithdrawal();
      setMessage({
        kind: "ok",
        text: `Withdrawal of ${fmtMoney(result.amountCents)} initiated. It will arrive in your bank account shortly.`,
      });
    } catch (err) {
      setMessage({ kind: "err", text: cleanError(err) });
    } finally {
      setBusy(false);
    }
  };

  const selectedMethod = method ?? wallet.payoutMethod ?? (wallet.connectOnboarded ? "stripe" : null);
  const paypalDraft = paypalEmail ?? wallet.paypalEmail ?? "";
  const paypalSaved = wallet.payoutMethod === "paypal" && !!wallet.paypalEmail;
  const paypalDirty = paypalDraft.trim().toLowerCase() !== (wallet.paypalEmail ?? "");
  const hasRequest = wallet.payouts.some((p) => p.status === "requested");

  const handleSelectMethod = async (next) => {
    setMessage(null);
    setMethod(next);
    if (next === "stripe" && wallet.payoutMethod !== "stripe") {
      try {
        await setPayoutMethod({ method: "stripe" });
      } catch (err) {
        setMessage({ kind: "err", text: cleanError(err) });
      }
    }
  };

  const handleSavePaypal = async (e) => {
    e.preventDefault();
    setMessage(null);
    setBusy(true);
    try {
      await setPayoutMethod({ method: "paypal", paypalEmail: paypalDraft });
      setPaypalEmail(null);
      setMessage({ kind: "ok", text: "PayPal account saved. You can now request withdrawals." });
    } catch (err) {
      setMessage({ kind: "err", text: cleanError(err) });
    } finally {
      setBusy(false);
    }
  };

  const handlePaypalWithdraw = async () => {
    setMessage(null);
    const ok = await confirm({
      title: "Request PayPal withdrawal?",
      message: `${fmtMoney(wallet.availableCents)} will be sent to ${wallet.paypalEmail}. It will take 3 days to get the amount.`,
      confirmLabel: "Request withdrawal",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const result = await requestPaypalPayout();
      setMessage({
        kind: "ok",
        text: `Withdrawal of ${fmtMoney(result.amountCents)} requested. We'll email you once it has been sent to ${wallet.paypalEmail}.`,
      });
    } catch (err) {
      setMessage({ kind: "err", text: cleanError(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Wallet"
        description="Your balance, payout setup and withdrawal history."
      />

      <Suspense fallback={null}>
        <ConnectBanner />
      </Suspense>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <StatCard
          label="Available"
          value={fmtMoney(wallet.availableCents)}
          accent="text-green-600"
          icon={Wallet}
          note="Ready to withdraw"
        />
        <StatCard
          label="Pending escrow"
          value={fmtMoney(wallet.pendingCents)}
          accent="text-yellow-600"
          icon={Hourglass}
          note="Released after students confirm lessons; auto-confirms 72h after each lesson."
        />
      </div>

      <SectionCard title="Payouts">
        <p className="mb-3 text-sm text-slate-500">How would you like to receive your earnings?</p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <MethodOption
            selected={selectedMethod === "stripe"}
            onSelect={() => handleSelectMethod("stripe")}
            icon={CreditCard}
            title="Bank account via Stripe"
            description="Automatic transfers to your bank. Available in supported countries only."
          />
          <MethodOption
            selected={selectedMethod === "paypal"}
            onSelect={() => handleSelectMethod("paypal")}
            icon={Mail}
            title="PayPal"
            description="Sent to your PayPal email. It takes 3 days to get the amount."
          />
        </div>

        {selectedMethod === "stripe" ? (
          <div className="mt-5">
            {wallet.connectOnboarded ? (
              <div className="flex flex-wrap items-center gap-4">
                <span className="badge-green">Payouts enabled</span>
                <button
                  className="btn-primary w-full sm:w-auto"
                  onClick={handleWithdraw}
                  disabled={busy || wallet.availableCents === 0}
                >
                  {busy ? "Working…" : "Withdraw available balance"}
                </button>
              </div>
            ) : (
              <div>
                <p className="mb-3 text-sm text-slate-500">
                  {wallet.hasConnectAccount
                    ? "Finish setting up your Stripe account to receive payouts."
                    : "Connect a Stripe account to withdraw your earnings."}
                </p>
                <button className="btn-primary w-full sm:w-auto" onClick={handleOnboard} disabled={busy}>
                  {busy ? "Redirecting…" : "Set up payouts with Stripe"}
                </button>
              </div>
            )}
          </div>
        ) : selectedMethod === "paypal" ? (
          <div className="mt-5 space-y-4">
            <form onSubmit={handleSavePaypal} className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label className="label" htmlFor="paypal-email">PayPal email address</label>
                <input
                  id="paypal-email"
                  type="email"
                  required
                  className="input"
                  placeholder="you@example.com"
                  autoComplete="email"
                  value={paypalDraft}
                  onChange={(e) => setPaypalEmail(e.target.value)}
                />
              </div>
              <button
                type="submit"
                className="btn-secondary w-full sm:w-auto"
                disabled={busy || (!paypalDirty && paypalSaved)}
              >
                {paypalSaved && !paypalDirty ? "Saved" : "Save PayPal account"}
              </button>
            </form>
            {paypalSaved ? (
              <div className="flex flex-wrap items-center gap-4">
                {hasRequest ? (
                  <span className="badge-yellow">Withdrawal request pending</span>
                ) : (
                  <span className="badge-green">Payouts enabled</span>
                )}
                <button
                  className="btn-primary w-full sm:w-auto"
                  onClick={handlePaypalWithdraw}
                  disabled={busy || paypalDirty || wallet.availableCents === 0}
                >
                  {busy ? "Working…" : "Request withdrawal to PayPal"}
                </button>
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                Save the PayPal email address you want your earnings sent to. Double-check it — payouts sent to the wrong account can&apos;t be recovered.
              </p>
            )}
          </div>
        ) : null}

        {message?.kind === "err" ? (
          <div className="mt-4">
            <ErrorBanner message={message.text} onDismiss={() => setMessage(null)} />
          </div>
        ) : message ? (
          <p className="mt-3 text-sm font-medium text-green-600">{message.text}</p>
        ) : null}
      </SectionCard>

      <SectionCard title="Payout history">
        {wallet.payouts.length === 0 ? (
          <EmptyState
            compact
            icon={Landmark}
            title="No payouts yet"
            message="Withdrawals you make will show up here."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Status</th>
                  <th>Reference</th>
                </tr>
              </thead>
              <tbody>
                {wallet.payouts.map((p) => (
                  <tr key={p._id} className="transition-colors hover:bg-slate-50">
                    <td data-label="Date">{fmtDateTime(p.createdAt ?? p._creationTime, timezone)}</td>
                    <td data-label="Amount" className="font-semibold text-slate-800">
                      {fmtMoney(p.amountCents)}
                    </td>
                    <td data-label="Method" className="text-sm text-slate-600">{payoutMethodLabel(p)}</td>
                    <td data-label="Status">
                      {payoutBadge(p.status)}
                      {p.status === "cancelled" && p.note ? (
                        <span className="mt-1 block text-xs text-slate-500">{p.note}</span>
                      ) : null}
                    </td>
                    <td data-label="Reference" className="font-mono text-xs text-slate-500">
                      {p.stripeTransferId
                        ? `${p.stripeTransferId.slice(0, 14)}…`
                        : p.reference || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
