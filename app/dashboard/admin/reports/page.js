"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { fmtMoney } from "@/lib/format";
import { PageHeader, StatCard, Skeleton, LoadingRows } from "@/components/dashboard/ui";
import {
  Landmark,
  TrendingUp,
  PiggyBank,
  Wallet,
  BadgeDollarSign,
  CalendarDays,
  Banknote,
  Receipt,
  GraduationCap,
} from "lucide-react";

export default function AdminReportsPage() {
  const me = useQuery(api.users.me);
  const isAdmin = !!me && me.role === "admin";
  const report = useQuery(api.admin.revenueReport, isAdmin ? {} : "skip");

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
        title="Revenue report"
        description="Where the platform's money is: earned, held in escrow, and owed to tutors."
      />

      {report === undefined ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Gross revenue"
              value={fmtMoney(report.grossCents)}
              note="Everything students have paid (trials, packages, subscription cycles)."
              accent="text-brand-600"
              icon={Landmark}
            />
            <StatCard
              label="Trial revenue (100% platform)"
              value={fmtMoney(report.trialCents)}
              note="Trial lessons are kept entirely by the platform — tutors earn nothing from trials."
              icon={BadgeDollarSign}
            />
            <StatCard
              label="Commission earned"
              value={fmtMoney(report.commissionCents)}
              note="The platform's cut taken on confirmed regular lessons."
              accent="text-green-600"
              icon={TrendingUp}
            />
            <StatCard
              label="Currently in escrow"
              value={fmtMoney(report.escrowCents)}
              note="Student money held for lessons not yet confirmed — will become tutor earnings."
              accent="text-yellow-600"
              icon={PiggyBank}
            />
            <StatCard
              label="Owed to tutors (available)"
              value={fmtMoney(report.owedCents)}
              note="Confirmed lesson earnings tutors can withdraw but have not been paid out yet."
              icon={Wallet}
            />
            <StatCard
              label="Paid out to tutors"
              value={fmtMoney(report.paidOutCents)}
              note="Total already transferred to tutors via Stripe Connect."
              icon={Banknote}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Paid purchases"
              value={report.purchaseCount}
              note="Successful checkouts (includes conflict-flagged payments)."
              icon={Receipt}
            />
            <StatCard
              label="Total lessons"
              value={report.lessonCount}
              note="All lessons ever created, any status."
              icon={CalendarDays}
            />
            <StatCard
              label="Confirmed lessons"
              value={report.confirmedLessons}
              note="Lessons whose payout has been released to the tutor."
              icon={GraduationCap}
            />
          </div>
        </>
      )}
    </div>
  );
}
