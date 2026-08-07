"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { fmtMoney, fmtDateTime } from "@/lib/format";
import {
  PageHeader,
  SectionCard,
  EmptyState,
  LoadingRows,
  Avatar,
} from "@/components/dashboard/ui";
import { Banknote } from "lucide-react";

const STATUS_BADGE = {
  paid: "badge-green",
  pending: "badge-yellow",
  failed: "badge-red",
};

export default function AdminPayoutsPage() {
  const me = useQuery(api.users.me);
  const isAdmin = !!me && me.role === "admin";
  const payouts = useQuery(api.admin.payoutLog, isAdmin ? {} : "skip");

  if (me === undefined) return <LoadingRows rows={4} />;
  if (!isAdmin) {
    return (
      <div className="card">
        <p className="font-semibold text-slate-800">Admins only</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tutor payouts"
        description="Log of every Stripe Connect transfer made to tutors."
      />

      <SectionCard title="Payout history">
        {payouts === undefined ? (
          <LoadingRows rows={5} />
        ) : payouts.length === 0 ? (
          <EmptyState
            compact
            icon={Banknote}
            title="No payouts yet"
            message="Transfers to tutors will show up here once the first withdrawal is processed."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Tutor</th>
                  <th className="text-right">Amount</th>
                  <th>Status</th>
                  <th>Stripe transfer</th>
                </tr>
              </thead>
              <tbody>
                {payouts.map((payout) => (
                  <tr key={payout._id} className="transition-colors hover:bg-slate-50">
                    <td className="whitespace-nowrap">
                      {fmtDateTime(payout.createdAt, me.timezone)}
                    </td>
                    <td>
                      <span className="flex items-center gap-3 font-medium text-slate-800">
                        <Avatar name={payout.tutorName} size="h-8 w-8 text-xs" />
                        {payout.tutorName}
                      </span>
                    </td>
                    <td className="text-right font-semibold">
                      {fmtMoney(payout.amountCents)}
                    </td>
                    <td>
                      <span className={STATUS_BADGE[payout.status] ?? "badge-gray"}>
                        {payout.status}
                      </span>
                    </td>
                    <td className="font-mono text-xs text-slate-500">
                      {payout.stripeTransferId || "—"}
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
