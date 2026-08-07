"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useAction } from "convex/react";
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
import { Hourglass, Landmark, Lock, Wallet } from "lucide-react";

function cleanError(err) {
  if (typeof err?.data === "string" && err.data.trim()) return err.data.trim();
  return String(err?.message ?? err)
    .replace(/^.*Uncaught (?:ConvexError|Error):\s*/, "")
    .split("\n")[0];
}

function payoutBadge(status) {
  if (status === "paid") return <span className="badge-green">Paid</span>;
  if (status === "processing") return <span className="badge-yellow">Processing</span>;
  if (status === "failed") return <span className="badge-red">Failed</span>;
  return <span className="badge-gray">{status}</span>;
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
  const me = useQuery(api.users.me);
  const wallet = useQuery(api.wallet.mine, me?.role === "tutor" ? {} : "skip");
  const createOnboardingLink = useAction(api.stripe.createConnectOnboardingLink);
  const requestWithdrawal = useAction(api.stripe.requestWithdrawal);

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null); // { kind: "ok"|"err", text }

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
    if (
      !window.confirm(
        `Withdraw ${fmtMoney(wallet.availableCents)} to your Stripe account?`
      )
    ) {
      return;
    }
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Wallet"
        description="Your balance, payout setup and withdrawal history."
      />

      <Suspense fallback={null}>
        <ConnectBanner />
      </Suspense>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
        {wallet.connectOnboarded ? (
          <div className="flex flex-wrap items-center gap-4">
            <span className="badge-green">Payouts enabled</span>
            <button
              className="btn-primary"
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
            <button className="btn-primary" onClick={handleOnboard} disabled={busy}>
              {busy ? "Redirecting…" : "Set up payouts with Stripe"}
            </button>
          </div>
        )}
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
                  <th>Status</th>
                  <th>Transfer</th>
                </tr>
              </thead>
              <tbody>
                {wallet.payouts.map((p) => (
                  <tr key={p._id} className="transition-colors hover:bg-slate-50">
                    <td>{fmtDateTime(p.createdAt ?? p._creationTime, me.timezone)}</td>
                    <td className="font-semibold text-slate-800">
                      {fmtMoney(p.amountCents)}
                    </td>
                    <td>{payoutBadge(p.status)}</td>
                    <td className="font-mono text-xs text-slate-500">
                      {p.stripeTransferId
                        ? `${p.stripeTransferId.slice(0, 14)}…`
                        : "—"}
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
