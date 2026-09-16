"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useConvexAuth, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "@/convex/_generated/api";
import { Avatar } from "@/components/dashboard/ui";
import { DashboardHeaderContext } from "@/components/dashboard/header";
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
  Video,
  Bot,
  Search,
  FileText,
  Newspaper,
  Mail,
  LogOut,
  Menu,
  X,
} from "lucide-react";

const NAV = {
  student: [
    { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
    { href: "/dashboard/tutors", label: "Find Tutors", icon: Search },
    { href: "/dashboard/lessons", label: "My Lessons", icon: CalendarDays },
    { href: "/dashboard/messages", label: "Messages", icon: MessageSquare },
    {
      href: "/dashboard/subscriptions",
      label: "Subscriptions",
      icon: RefreshCcw,
    },
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
    {
      href: "/dashboard/availability",
      label: "Availability",
      icon: CalendarClock,
    },
    { href: "/dashboard/profile", label: "My Profile", icon: UserRound },
    { href: "/dashboard/wallet", label: "Wallet", icon: Wallet },
    { href: "/dashboard/earnings", label: "Earnings", icon: TrendingUp },
    { href: "/dashboard/students", label: "My Students", icon: GraduationCap },
    { href: "/dashboard/messages", label: "Messages", icon: MessageSquare },
    { href: "/dashboard/settings", label: "Settings", icon: Settings },
  ],
  admin: [
    { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
    {
      href: "/dashboard/admin/applications",
      label: "Applications",
      icon: ClipboardCheck,
    },
    { href: "/dashboard/admin/users", label: "Users", icon: Users },
    {
      href: "/dashboard/admin/bookings",
      label: "Bookings",
      icon: BookOpenCheck,
    },
    { href: "/dashboard/admin/ai-support", label: "AI Support", icon: Bot },
    { href: "/dashboard/admin/payments", label: "Payments", icon: CreditCard },
    { href: "/dashboard/admin/payouts", label: "Payouts", icon: Banknote },
    { href: "/dashboard/admin/reports", label: "Reports", icon: BarChart3 },
    { href: "/dashboard/admin/inquiries", label: "Inquiries", icon: Inbox },
    {
      href: "/dashboard/admin/testimonials",
      label: "Testimonials",
      icon: Quote,
    },
    { href: "/dashboard/admin/blog", label: "Blog", icon: Newspaper },
    { href: "/dashboard/admin/content", label: "Site Content", icon: FileText },
    { href: "/dashboard/admin/emails", label: "Emails", icon: Mail },
    {
      href: "/dashboard/admin/conversations",
      label: "Conversations",
      icon: MessagesSquare,
    },
    {
      href: "/dashboard/admin/classroom-chats",
      label: "Classroom Chats",
      icon: Video,
    },
    { href: "/dashboard/admin/settings", label: "Settings", icon: Settings },
  ],
};

/** Links that get a slot in the phone bottom bar (max four); the rest live under "More". */
const PRIMARY = {
  student: [
    "/dashboard",
    "/dashboard/tutors",
    "/dashboard/lessons",
    "/dashboard/messages",
  ],
  tutor_applicant: ["/dashboard", "/dashboard/settings"],
  tutor: [
    "/dashboard",
    "/dashboard/lessons",
    "/dashboard/availability",
    "/dashboard/messages",
  ],
  admin: [
    "/dashboard",
    "/dashboard/admin/applications",
    "/dashboard/admin/users",
    "/dashboard/admin/bookings",
  ],
};

const ROLE_LABEL = {
  admin: "Admin",
  tutor: "Tutor",
  tutor_applicant: "Applicant",
  student: "Student",
};

function isActive(link, pathname) {
  return link.href === "/dashboard"
    ? pathname === "/dashboard"
    : pathname.startsWith(link.href);
}

function NavLinks({ links, pathname, badges, onNavigate }) {
  return links.map((link) => {
    const active = isActive(link, pathname);
    const Icon = link.icon;
    return (
      <Link
        key={link.href}
        href={link.href}
        onClick={onNavigate}
        className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
          active
            ? "bg-brand-600 text-white shadow-sm"
            : "text-slate-600 hover:bg-slate-100 hover:text-brand-700"
        }`}
      >
        <Icon
          className={`h-[18px] w-[18px] ${active ? "" : "text-slate-400"}`}
          strokeWidth={2}
        />
        <span className="flex-1">{link.label}</span>
        {badges?.[link.label] ? (
          <span
            className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold leading-none ${
              active ? "bg-white/20 text-white" : "bg-red-500 text-white"
            }`}
          >
            {badges[link.label]}
          </span>
        ) : null}
      </Link>
    );
  });
}

/** One slot in the phone bottom bar — a link, or a button for "More". */
function BottomTab({ href, label, icon: Icon, active, badge, onClick }) {
  const className = `relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium leading-none transition-colors ${
    active ? "text-brand-700" : "text-slate-500 hover:text-brand-700"
  }`;
  const body = (
    <>
      <span className={`rounded-xl px-3 py-1 ${active ? "bg-brand-100" : ""}`}>
        <Icon className="h-5 w-5" strokeWidth={active ? 2.25 : 2} />
        {badge ? (
          <span className="absolute left-1/2 top-1.5 ml-1.5 min-w-[16px] rounded-full bg-red-500 px-1 text-center text-[10px] font-bold leading-4 text-white">
            {badge}
          </span>
        ) : null}
      </span>
      <span className="max-w-full truncate">{label}</span>
    </>
  );
  return href ? (
    <Link
      href={href}
      className={className}
      aria-current={active ? "page" : undefined}
    >
      {body}
    </Link>
  ) : (
    <button
      type="button"
      onClick={onClick}
      className={className}
      aria-expanded={active}
    >
      {body}
    </button>
  );
}

function UserFooter({ me, onSignOut }) {
  return (
    <div className="space-y-3 border-t border-slate-100 p-4">
      <div className="flex items-center gap-3">
        <Avatar name={me.name ?? me.email} src={me.avatar} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-800">
            {me.name ?? me.email}
          </p>
          <p className="text-xs text-slate-400">
            {ROLE_LABEL[me.role] ?? "Member"}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onSignOut}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-700"
      >
        <LogOut className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        Log out
      </button>
    </div>
  );
}

export default function DashboardLayout({ children }) {
  // Queries only run once the Convex socket is authenticated: before that they
  // resolve as anonymous, which would flash the "please log in" screen.
  const { isLoading: authLoading, isAuthenticated } = useConvexAuth();
  const args = isAuthenticated ? {} : "skip";
  const me = useQuery(api.users.me, args);
  const unread = useQuery(api.messages.unreadCount, args);
  const supportUnread = useQuery(api.support.adminUnreadTotal, args);
  const payoutRequests = useQuery(api.admin.pendingPayoutCount, args);
  const badges = { Messages: unread, "AI Support": supportUnread, Payouts: payoutRequests };
  const { signOut } = useAuthActions();
  const pathname = usePathname();
  const [sheetOpen, setSheetOpen] = useState(false);
  // Page title for the top bar, published by <PageHeader>; the nav label
  // covers pages without one (a tutor's profile, for instance).
  const [pageTitle, setPageTitle] = useState(null);
  const setTitle = useCallback((title) => setPageTitle(title ?? null), []);
  const headerContext = useMemo(() => ({ setTitle }), [setTitle]);

  // Close the sheet on navigation and keep the page from scrolling behind it.
  useEffect(() => setSheetOpen(false), [pathname]);
  useEffect(() => {
    if (!sheetOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event) => event.key === "Escape" && setSheetOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [sheetOpen]);

  if (authLoading || (isAuthenticated && me === undefined)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-400">
        Loading…
      </div>
    );
  }
  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 px-4 text-center">
        <p className="text-slate-600">
          Please log in to access your dashboard.
        </p>
        <Link href="/login" className="btn-primary">
          Log in
        </Link>
      </div>
    );
  }
  // Signed in, but the account was deleted. The middleware would send /login
  // straight back here, so signing out is the only way off this screen.
  if (me === null) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 px-4 text-center">
        <p className="text-slate-600">
          This account is no longer available. Please contact support if you
          think this is a mistake.
        </p>
        <button onClick={() => signOut()} className="btn-primary">
          Sign out
        </button>
      </div>
    );
  }

  const links = NAV[me.role] ?? NAV.student;
  const primaryHrefs = PRIMARY[me.role] ?? PRIMARY.student;
  const primary = links.filter((link) => primaryHrefs.includes(link.href));
  const secondary = links.filter((link) => !primaryHrefs.includes(link.href));
  const moreActive = secondary.some((link) => isActive(link, pathname));
  const moreBadge = secondary.reduce(
    (sum, link) => sum + (badges[link.label] || 0),
    0,
  );
  const title =
    pageTitle ??
    links.find((link) => isActive(link, pathname))?.label ??
    "Dashboard";

  return (
    <DashboardHeaderContext.Provider value={headerContext}>
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
            <NavLinks links={links} pathname={pathname} badges={badges} />
          </nav>
          <UserFooter me={me} onSignOut={() => signOut()} />
        </aside>

        {/* Mobile "More" sheet */}
        <div
          className={`fixed inset-0 z-50 lg:hidden ${sheetOpen ? "" : "pointer-events-none"}`}
          aria-hidden={!sheetOpen}
        >
          <div
            className={`absolute inset-0 bg-slate-900/50 transition-opacity ${
              sheetOpen ? "opacity-100" : "opacity-0"
            }`}
            onClick={() => setSheetOpen(false)}
          />
          <div
            className={`absolute inset-x-0 bottom-0 flex max-h-[85dvh] flex-col rounded-t-2xl bg-white shadow-2xl transition-transform duration-200 ${
              sheetOpen ? "translate-y-0" : "translate-y-full"
            }`}
            role="dialog"
            aria-modal="true"
            aria-label="More"
          >
            <div
              className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-slate-200"
              aria-hidden="true"
            />
            <div className="flex shrink-0 items-center gap-3 px-5 pb-3 pt-3">
              <Avatar name={me.name ?? me.email} src={me.avatar} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-800">
                  {me.name ?? me.email}
                </p>
                <p className="text-xs text-slate-400">
                  {ROLE_LABEL[me.role] ?? "Member"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto border-t border-slate-100 p-3">
              <NavLinks
                links={secondary}
                pathname={pathname}
                badges={badges}
                onNavigate={() => setSheetOpen(false)}
              />
            </nav>
            <div className="shrink-0 border-t border-slate-100 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <button
                type="button"
                onClick={() => signOut()}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-700"
              >
                <LogOut
                  className="h-4 w-4"
                  strokeWidth={2}
                  aria-hidden="true"
                />
                Log out
              </button>
            </div>
          </div>
        </div>

        {/* Content column */}
        <div className="flex min-h-screen flex-col lg:pl-64">
          {/* Top bar */}
          <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
            <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
              <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                <h1 className="min-w-0 truncate text-lg font-bold tracking-tight text-slate-900 lg:hidden">
                  {title}
                </h1>
                <div className="hidden min-w-0 lg:block">
                  <p className="truncate text-sm text-slate-500">
                    Welcome back,{" "}
                    <span className="font-semibold text-slate-800">
                      {(me.name ?? me.email ?? "").split(" ")[0]}
                    </span>
                    {me.role === "tutor_applicant"
                      ? " · application under review"
                      : ""}
                  </p>
                </div>
              </div>
            </div>
          </header>

          <main className="flex-1 px-4 pb-24 pt-5 sm:px-6 sm:pt-6 lg:px-8 lg:py-8">
            <div className="mx-auto w-full min-w-0 max-w-6xl">{children}</div>
          </main>

          {/* Mobile bottom bar */}
          <nav
            className="fixed inset-x-0 bottom-0 z-40 h-[calc(3.75rem+env(safe-area-inset-bottom))] border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
            aria-label="Primary"
          >
            <div className="flex h-[3.75rem] items-stretch">
              {primary.map((link) => (
                <BottomTab
                  key={link.href}
                  href={link.href}
                  label={link.label}
                  icon={link.icon}
                  active={isActive(link, pathname)}
                  badge={badges[link.label]}
                />
              ))}
              {secondary.length > 0 ? (
                <BottomTab
                  label="More"
                  icon={Menu}
                  active={moreActive || sheetOpen}
                  badge={moreBadge}
                  onClick={() => setSheetOpen(true)}
                />
              ) : null}
            </div>
          </nav>
        </div>
      </div>
    </DashboardHeaderContext.Provider>
  );
}
