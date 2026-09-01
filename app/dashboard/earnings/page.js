"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { fmtMoney, fmtDateTime } from "@/lib/format";
import {
  PageHeader,
  StatCard,
  SectionCard,
  EmptyState,
  LoadingRows,
  Avatar,
} from "@/components/dashboard/ui";
import { BadgeDollarSign, Landmark, Lock, TrendingUp } from "lucide-react";
import { useViewerTimezone } from "@/lib/useViewerTimezone";

function statusBadge(status) {
  if (status === "available") return <span className="badge-green">Available</span>;
  if (status === "locked") return <span className="badge-yellow">Locked</span>;
  if (status === "paid") return <span className="badge-gray">Paid</span>;
  return <span className="badge-gray">{status}</span>;
}

export default function EarningsPage() {
  const timezone = useViewerTimezone();
  const me = useQuery(api.users.me);
  const earnings = useQuery(api.wallet.earnings, me?.role === "tutor" ? {} : "skip");

  if (me && me.role !== "tutor") {
    return (
      <div className="space-y-6">
        <PageHeader title="Earnings" />
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
  if (me === undefined || !me || earnings === undefined) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Earnings"
          description="Every lesson you've been paid for, in one place."
        />
        <div className="card">
          <LoadingRows rows={4} />
        </div>
      </div>
    );
  }

  const totalEarned = earnings.reduce((sum, e) => sum + e.amountCents, 0);
  const totalPaidOut = earnings
    .filter((e) => e.status === "paid")
    .reduce((sum, e) => sum + e.amountCents, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Earnings"
        description="Every lesson you've been paid for, in one place."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Total earned"
          value={fmtMoney(totalEarned)}
          accent="text-green-600"
          icon={TrendingUp}
          note="Lifetime net earnings"
        />
        <StatCard
          label="Total paid out"
          value={fmtMoney(totalPaidOut)}
          icon={Landmark}
          note="Already withdrawn to your bank"
        />
      </div>

      <SectionCard title="Earnings history">
        {earnings.length === 0 ? (
          <EmptyState
            compact
            icon={BadgeDollarSign}
            title="No earnings yet"
            message="They will appear here after your first completed lesson."
            action="Edit availability"
            href="/dashboard/availability"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Lesson</th>
                  <th>Student</th>
                  <th>Gross</th>
                  <th>Commission</th>
                  <th>Net</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {earnings.map((e) => (
                  <tr key={e._id} className="transition-colors hover:bg-slate-50">
                    <td>
                      {e.lessonStartUTC
                        ? fmtDateTime(e.lessonStartUTC, timezone)
                        : fmtDateTime(e.createdAt ?? e._creationTime, timezone)}
                    </td>
                    <td>
                      <span className="flex items-center gap-3 font-medium text-slate-800">
                        <Avatar name={e.studentName} size="h-8 w-8 text-xs" />
                        {e.studentName}
                      </span>
                    </td>
                    <td>{fmtMoney(e.grossCents)}</td>
                    <td className="text-red-600">-{fmtMoney(e.commissionCents)}</td>
                    <td className="font-bold">{fmtMoney(e.amountCents)}</td>
                    <td>{statusBadge(e.status)}</td>
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
