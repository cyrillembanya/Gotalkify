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
import { Receipt } from "lucide-react";

const KIND = {
  trial: ["badge-blue", "Trial lesson"],
  package: ["badge-green", "Hour package"],
  subscription_cycle: ["badge-gray", "Subscription"],
};

const STATUS = {
  paid: ["badge-green", "Paid"],
  pending: ["badge-yellow", "Pending"],
  conflict: ["badge-red", "Needs attention"],
  failed: ["badge-gray", "Failed"],
};

export default function PaymentsPage() {
  const me = useQuery(api.users.me);
  const purchases = useQuery(api.balances.myPurchases);

  if (!me) return <LoadingRows rows={4} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments"
        description="Every purchase you've made on GoTalkify."
      />

      <SectionCard title="Payment history">
        {purchases === undefined ? (
          <LoadingRows rows={3} />
        ) : purchases.length === 0 ? (
          <EmptyState
            compact
            icon={Receipt}
            title="No payments yet"
            message="Trial lessons, hour packages and subscription charges will show up here."
            action="Browse tutors"
            href="/dashboard/tutors"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Tutor</th>
                  <th>Hours</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {purchases.map((purchase) => {
                  const [kindCls, kindLabel] = KIND[purchase.kind] ?? ["badge-gray", purchase.kind];
                  const [statusCls, statusLabel] = STATUS[purchase.status] ?? ["badge-gray", purchase.status];
                  return (
                    <tr key={purchase._id} className="transition-colors hover:bg-slate-50">
                      <td>{fmtDateTime(purchase.createdAt, me.timezone)}</td>
                      <td><span className={kindCls}>{kindLabel}</span></td>
                      <td>
                        <span className="flex items-center gap-3 font-medium text-slate-800">
                          <Avatar name={purchase.tutorName} size="h-8 w-8 text-xs" />
                          {purchase.tutorName}
                        </span>
                      </td>
                      <td>{purchase.hours} h</td>
                      <td className="font-semibold">{fmtMoney(purchase.amountCents)}</td>
                      <td><span className={statusCls}>{statusLabel}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
