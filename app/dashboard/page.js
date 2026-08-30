"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { fmtDateTime, fmtMoney } from "@/lib/format";
import JoinClassButton from "@/components/JoinClassButton";
import {
  PageHeader,
  StatCard,
  SectionCard,
  EmptyState,
  LoadingRows,
  Avatar,
} from "@/components/dashboard/ui";
import {
  Clock,
  Users,
  CalendarDays,
  Wallet,
  Hourglass,
  BadgeDollarSign,
  TrendingUp,
  Landmark,
  PiggyBank,
  GraduationCap,
  ClipboardCheck,
  ShieldCheck,
  ArrowRight,
} from "lucide-react";

function UpcomingLessons({ me }) {
  const upcoming = useQuery(api.lessons.myUpcoming);
  return (
    <SectionCard
      title="Upcoming lessons"
      action={
        <Link
          href="/dashboard/lessons"
          className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-700"
        >
          View all <ArrowRight className="h-4 w-4" />
        </Link>
      }
    >
      {upcoming === undefined ? (
        <LoadingRows rows={3} />
      ) : upcoming.length === 0 ? (
        <EmptyState
          compact
          icon={CalendarDays}
          title="No upcoming lessons"
          message={
            me.role === "student"
              ? "Find a tutor you like and book your next lesson."
              : "Lessons students book with you will appear here."
          }
          action={me.role === "student" ? "Find a tutor" : null}
          href="/dashboard/tutors"
        />
      ) : (
        <ul className="divide-y divide-slate-100">
          {upcoming.slice(0, 5).map((lesson) => {
            const otherName = me.role === "tutor" ? lesson.studentName : lesson.tutorName;
            return (
              <li
                key={lesson._id}
                className="flex flex-wrap items-center justify-between gap-3 py-3.5 first:pt-0 last:pb-0"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={otherName} />
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 truncate text-sm font-semibold text-slate-800">
                      {otherName}
                      {lesson.type === "trial" ? (
                        <span className="badge-blue">Trial</span>
                      ) : null}
                    </p>
                    <p className="text-xs text-slate-500">
                      {fmtDateTime(lesson.startUTC, me.timezone)}
                    </p>
                  </div>
                </div>
                <JoinClassButton lesson={lesson} />
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}

function StudentOverview({ me }) {
  const balances = useQuery(api.balances.mine);
  const totalMinutes = (balances ?? []).reduce((s, b) => s + b.minutesRemaining, 0);
  return (
    <div className="space-y-6">
      <PageHeader title="Overview" description="Your lessons and balances at a glance.">
        <Link href="/dashboard/tutors" className="btn-primary">Find tutors</Link>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Prepaid hours"
          value={balances ? `${(totalMinutes / 60).toFixed(1)} h` : undefined}
          accent="text-brand-600"
          icon={Clock}
        />
        <StatCard label="My tutors" value={balances?.length} icon={Users} />
        <StatCard
          label="Next lesson"
          value={<NextLessonValue me={me} />}
          icon={CalendarDays}
        />
      </div>

      <UpcomingLessons me={me} />

      <SectionCard title="Hour balances">
        {balances === undefined ? (
          <LoadingRows rows={2} />
        ) : balances.length === 0 ? (
          <EmptyState
            compact
            icon={Hourglass}
            title="No prepaid hours yet"
            message="Book a trial lesson first, then buy a package or subscription with the tutor you like."
            action="Browse tutors"
            href="/dashboard/tutors"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Tutor</th>
                  <th>Hours left</th>
                  <th>Purchased at</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {balances.map((balance) => (
                  <tr key={balance._id} className="transition-colors hover:bg-slate-50">
                    <td>
                      <span className="flex items-center gap-3 font-medium text-slate-800">
                        <Avatar name={balance.tutorName} size="h-8 w-8 text-xs" />
                        {balance.tutorName}
                      </span>
                    </td>
                    <td className="font-semibold text-brand-600">
                      {(balance.minutesRemaining / 60).toFixed(1)} h
                    </td>
                    <td>{fmtMoney(balance.purchaseRateCents)}/h</td>
                    <td className="text-right">
                      {balance.tutorProfileId ? (
                        <Link
                          href={`/dashboard/tutors/${balance.tutorProfileId}`}
                          className="text-sm font-semibold text-brand-600 hover:text-brand-700"
                        >
                          Book / buy more →
                        </Link>
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

function NextLessonValue({ me }) {
  const upcoming = useQuery(api.lessons.myUpcoming);
  if (upcoming === undefined) return "…";
  if (upcoming.length === 0) return "—";
  return (
    <span className="text-lg">{fmtDateTime(upcoming[0].startUTC, me.timezone)}</span>
  );
}

function TutorOverview({ me }) {
  const wallet = useQuery(api.wallet.mine);
  const profile = me.tutorProfile;
  return (
    <div className="space-y-6">
      <PageHeader title="Overview" description="Your schedule and earnings at a glance.">
        <Link href="/dashboard/availability" className="btn-secondary">Edit availability</Link>
      </PageHeader>

      {profile && !profile.stripeConnectOnboarded ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-yellow-200 bg-yellow-50 px-5 py-4 text-sm text-yellow-800">
          <p className="font-medium">Connect your payout account to withdraw earnings.</p>
          <Link href="/dashboard/wallet" className="btn-primary px-4 py-2 text-sm">
            Set up payouts
          </Link>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Available balance"
          value={wallet ? fmtMoney(wallet.availableCents) : undefined}
          accent="text-green-600"
          icon={Wallet}
          note="Ready to withdraw"
        />
        <StatCard
          label="Pending (escrow)"
          value={wallet ? fmtMoney(wallet.pendingCents) : undefined}
          accent="text-yellow-600"
          icon={Hourglass}
          note="Released after lesson confirmation"
        />
        <StatCard
          label="Hourly rate"
          value={profile ? `${fmtMoney(profile.hourlyRateCents)}/h` : "—"}
          icon={BadgeDollarSign}
        />
      </div>

      <UpcomingLessons me={me} />
    </div>
  );
}

function ApplicantOverview() {
  const status = useQuery(api.verification.myStatus);
  const verification = status?.verification ?? null;
  const needsVerification =
    status !== undefined && (!verification || verification.status === "rejected");

  return (
    <div className="space-y-6">
      <PageHeader title="Overview" />
      {needsVerification ? (
        <div className="card">
          <EmptyState
            icon={ShieldCheck}
            title={
              verification?.status === "rejected"
                ? "We need new identity documents"
                : "Finish verifying your identity"
            }
            message={
              verification?.rejectionReason ||
              "Your application is saved. Upload a government ID and take a quick face scan so our team can confirm you're who you say you are — reviews only start once this is done."
            }
            action="Verify my identity"
            href="/apply/verify"
          />
        </div>
      ) : (
        <div className="card">
          <EmptyState
            icon={ClipboardCheck}
            title="Application under review"
            message="Thanks for applying to teach on GoTalkify. Your ID and face scan are with our team — you'll get an email as soon as your application is approved."
          />
        </div>
      )}
    </div>
  );
}

function AdminOverview() {
  const report = useQuery(api.admin.revenueReport);
  const applications = useQuery(api.admin.pendingApplications);
  return (
    <div className="space-y-6">
      <PageHeader title="Overview" description="Platform health at a glance." />

      {applications && applications.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand-200 bg-brand-50 px-5 py-4 text-sm text-brand-800">
          <p className="font-medium">
            {applications.length} tutor application{applications.length > 1 ? "s" : ""} awaiting
            review.
          </p>
          <Link href="/dashboard/admin/applications" className="btn-primary px-4 py-2 text-sm">
            Review now
          </Link>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Gross revenue"
          value={report ? fmtMoney(report.grossCents) : undefined}
          icon={Landmark}
        />
        <StatCard
          label="Commission earned"
          value={report ? fmtMoney(report.commissionCents) : undefined}
          accent="text-green-600"
          icon={TrendingUp}
        />
        <StatCard
          label="In escrow"
          value={report ? fmtMoney(report.escrowCents) : undefined}
          accent="text-yellow-600"
          icon={PiggyBank}
        />
        <StatCard
          label="Owed to tutors"
          value={report ? fmtMoney(report.owedCents) : undefined}
          icon={Wallet}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Trial revenue (100%)"
          value={report ? fmtMoney(report.trialCents) : undefined}
          icon={BadgeDollarSign}
        />
        <StatCard label="Lessons" value={report?.lessonCount} icon={CalendarDays} />
        <StatCard
          label="Confirmed lessons"
          value={report?.confirmedLessons}
          icon={GraduationCap}
        />
      </div>
    </div>
  );
}

export default function DashboardHome() {
  const me = useQuery(api.users.me);
  if (!me) return null;
  if (me.role === "admin") return <AdminOverview />;
  if (me.role === "tutor") return <TutorOverview me={me} />;
  if (me.role === "tutor_applicant") return <ApplicantOverview />;
  return <StudentOverview me={me} />;
}
