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

const STATUS_BADGE = {
  paid: "badge-green",
  pending: "badge-yellow",
  conflict: "badge-red",
  failed: "badge-gray",
};

const KIND_BADGE = {
  trial: "badge-blue",
  package: "badge-green",
  subscription_cycle: "badge-gray",
};

const KIND_LABEL = {
  trial: "Trial",
  package: "Package",
  subscription_cycle: "Subscription",
};

export default function AdminPaymentsPage() {
  const me = useQuery(api.users.me);
  const isAdmin = !!me && me.role === "admin";
  const payments = useQuery(api.admin.payments, isAdmin ? {} : "skip");

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
        title="Payments"
        description="Every student purchase across the platform — trials, packages and subscription cycles."
      />

      <SectionCard title="All payments">
        {payments === undefined ? (
          <LoadingRows rows={5} />
        ) : payments.length === 0 ? (
          <EmptyState
            compact
            icon={Receipt}
            title="No payments yet"
            message="Student purchases will appear here as soon as the first checkout completes."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Student</th>
                  <th>Tutor</th>
                  <th>Kind</th>
                  <th>Hours</th>
                  <th className="text-right">Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((purchase) => (
                  <tr
                    key={purchase._id}
                    className={
                      purchase.status === "conflict"
                        ? "bg-red-50 transition-colors hover:bg-red-100/60"
                        : "transition-colors hover:bg-slate-50"
                    }
                  >
                    <td className="whitespace-nowrap">
                      {fmtDateTime(purchase.createdAt, me.timezone)}
                    </td>
                    <td>
                      <span className="flex items-center gap-3 font-medium text-slate-800">
                        <Avatar name={purchase.studentName} size="h-8 w-8 text-xs" />
                        {purchase.studentName}
                      </span>
                    </td>
                    <td>
                      <span className="flex items-center gap-3 font-medium text-slate-800">
                        <Avatar name={purchase.tutorName} size="h-8 w-8 text-xs" />
                        {purchase.tutorName}
                      </span>
                    </td>
                    <td>
                      <span className={KIND_BADGE[purchase.kind] ?? "badge-gray"}>
                        {KIND_LABEL[purchase.kind] ?? purchase.kind}
                      </span>
                    </td>
                    <td>{purchase.hours ?? "—"}</td>
                    <td className="text-right font-semibold">
                      {fmtMoney(purchase.amountCents)}
                    </td>
                    <td>
                      <span className={STATUS_BADGE[purchase.status] ?? "badge-gray"}>
                        {purchase.status}
                      </span>
                      {purchase.status === "conflict" ? (
                        <p className="mt-1 text-xs text-red-600">
                          Paid but slot was taken — refund via Stripe dashboard
                        </p>
                      ) : null}
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
