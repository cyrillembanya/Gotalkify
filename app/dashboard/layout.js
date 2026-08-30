"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "@/convex/_generated/api";
import TimezoneSelector from "@/components/TimezoneSelector";
import { Avatar } from "@/components/dashboard/ui";
import {
  LayoutDashboard,
  CalendarDays,
  CalendarClock,
  MessageSquare,
  RefreshCcw,
  CreditCard,
  Settings,
  UserRound,
  Wallet,
  TrendingUp,
  GraduationCap,
  ClipboardCheck,
  Users,
  BookOpenCheck,
  Banknote,
  BarChart3,
  Inbox,
  Quote,
  MessagesSquare,
  Search,
  FileText,
  Newspaper,
  Mail,
  LogOut,
} from "lucide-react";

const NAV = {
  student: [
    { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
    { href: "/dashboard/tutors", label: "Find Tutors", icon: Search },
    { href: "/dashboard/lessons", label: "My Lessons", icon: CalendarDays },
    { href: "/dashboard/messages", label: "Messages", icon: MessageSquare },
    { href: "/dashboard/subscriptions", label: "Subscriptions", icon: RefreshCcw },
    { href: "/dashboard/payments", label: "Payments", icon: CreditCard },
    { href: "/dashboard/settings", label: "Settings", icon: Settings },
  ],
  tutor_applicant: [
    { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
    { href: "/dashboard/settings", label: "Settings", icon: Settings },
  ],
  tutor: [
    { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
    { href: "/dashboard/lessons", label: "Lessons", icon: CalendarDays },
    { href: "/dashboard/availability", label: "Availability", icon: CalendarClock },
    { href: "/dashboard/profile", label: "My Profile", icon: UserRound },
    { href: "/dashboard/wallet", label: "Wallet", icon: Wallet },
    { href: "/dashboard/earnings", label: "Earnings", icon: TrendingUp },
    { href: "/dashboard/students", label: "My Students", icon: GraduationCap },
    { href: "/dashboard/messages", label: "Messages", icon: MessageSquare },
    { href: "/dashboard/settings", label: "Settings", icon: Settings },
  ],
  admin: [
    { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
    { href: "/dashboard/admin/applications", label: "Applications", icon: ClipboardCheck },
    { href: "/dashboard/admin/users", label: "Users", icon: Users },
    { href: "/dashboard/admin/bookings", label: "Bookings", icon: BookOpenCheck },
    { href: "/dashboard/admin/payments", label: "Payments", icon: CreditCard },
    { href: "/dashboard/admin/payouts", label: "Payouts", icon: Banknote },
    { href: "/dashboard/admin/reports", label: "Reports", icon: BarChart3 },
    { href: "/dashboard/admin/inquiries", label: "Inquiries", icon: Inbox },
    { href: "/dashboard/admin/testimonials", label: "Testimonials", icon: Quote },
    { href: "/dashboard/admin/blog", label: "Blog", icon: Newspaper },
    { href: "/dashboard/admin/content", label: "Site Content", icon: FileText },
    { href: "/dashboard/admin/emails", label: "Emails", icon: Mail },
    { href: "/dashboard/admin/conversations", label: "Conversations", icon: MessagesSquare },
    { href: "/dashboard/admin/settings", label: "Settings", icon: Settings },
  ],
};

const ROLE_LABEL = {
  admin: "Admin",
  tutor: "Tutor",
  tutor_applicant: "Applicant",
  student: "Student",
};

function NavLinks({ links, pathname, unread, onNavigate, orientation = "vertical" }) {
  const vertical = orientation === "vertical";
  return links.map((link) => {
    const active =
      link.href === "/dashboard"
        ? pathname === "/dashboard"
        : pathname.startsWith(link.href);
    const Icon = link.icon;
    return (
      <Link
        key={link.href}
        href={link.href}
        onClick={onNavigate}
        className={`flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
          vertical ? "" : "px-4"
        } ${
          active
            ? "bg-brand-600 text-white shadow-sm"
            : "text-slate-600 hover:bg-slate-100 hover:text-brand-700"
        }`}
      >
        <Icon className={`h-[18px] w-[18px] ${active ? "" : "text-slate-400"}`} strokeWidth={2} />
        <span className={vertical ? "flex-1" : ""}>{link.label}</span>
        {link.label === "Messages" && unread ? (
          <span
            className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold leading-none ${
              active ? "bg-white/20 text-white" : "bg-red-500 text-white"
            }`}
          >
            {unread}
          </span>
        ) : null}
      </Link>
    );
  });
}

export default function DashboardLayout({ children }) {
  const me = useQuery(api.users.me);
  const unread = useQuery(api.messages.unreadCount);
  const { signOut } = useAuthActions();
  const pathname = usePathname();

  if (me === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-400">
        Loading…
      </div>
    );
  }
  if (me === null) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 px-4 text-center">
        <p className="text-slate-600">Please log in to access your dashboard.</p>
        <Link href="/login" className="btn-primary">Log in</Link>
      </div>
    );
  }

  const links = NAV[me.role] ?? NAV.student;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="flex h-16 items-center border-b border-slate-100 px-5">
          <Link href="/">
            <Image
              src="/logo.avif"
              alt="GoTalkify"
              width={126}
              height={42}
              priority
              className="h-8 w-auto"
            />
          </Link>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-4">
          <NavLinks links={links} pathname={pathname} unread={unread} />
        </nav>
        <div className="border-t border-slate-100 p-4">
          <div className="flex items-center gap-3">
            <Avatar name={me.name ?? me.email} src={me.avatar} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-800">
                {me.name ?? me.email}
              </p>
              <p className="text-xs text-slate-400">{ROLE_LABEL[me.role] ?? "Member"}</p>
            </div>
            <button
              onClick={() => signOut()}
              title="Sign out"
              className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-red-600"
            >
              <LogOut className="h-[18px] w-[18px]" strokeWidth={2} />
            </button>
          </div>
        </div>
      </aside>

      {/* Content column */}
      <div className="flex min-h-screen flex-col lg:pl-64">
        {/* Top bar */}
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
          <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <Link href="/" className="lg:hidden">
                <Image
                  src="/logo.avif"
                  alt="GoTalkify"
                  width={126}
                  height={42}
                  className="h-7 w-auto"
                />
              </Link>
              <div className="hidden min-w-0 lg:block">
                <p className="truncate text-sm text-slate-500">
                  Welcome back,{" "}
                  <span className="font-semibold text-slate-800">
                    {(me.name ?? me.email ?? "").split(" ")[0]}
                  </span>
                  {me.role === "tutor_applicant" ? " · application under review" : ""}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <TimezoneSelector timezone={me.timezone} />
              <button
                onClick={() => signOut()}
                title="Sign out"
                className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-red-600 lg:hidden"
              >
                <LogOut className="h-[18px] w-[18px]" strokeWidth={2} />
              </button>
            </div>
          </div>
          {/* Mobile nav */}
          <nav className="flex gap-1.5 overflow-x-auto border-t border-slate-100 px-4 py-2 lg:hidden">
            <NavLinks links={links} pathname={pathname} unread={unread} orientation="horizontal" />
          </nav>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
