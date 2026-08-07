"use client";

import Link from "next/link";

/** Page-level header: title, optional description and right-side actions. */
export function PageHeader({ title, description, children }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
        {description ? (
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        ) : null}
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  );
}

/** KPI tile with optional icon, accent color and footnote. */
export function StatCard({ label, value, icon: Icon, accent = "text-slate-900", note }) {
  return (
    <div className="card flex items-start justify-between gap-4 !p-5">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <p className={`mt-1.5 truncate text-2xl font-bold tracking-tight ${accent}`}>
          {value ?? "…"}
        </p>
        {note ? <p className="mt-1 text-xs text-slate-400">{note}</p> : null}
      </div>
      {Icon ? (
        <div className="rounded-xl bg-brand-50 p-2.5 text-brand-600">
          <Icon className="h-5 w-5" strokeWidth={2} />
        </div>
      ) : null}
    </div>
  );
}

/** White card with a titled header row and optional "View all" style action. */
export function SectionCard({ title, action, children, className = "" }) {
  return (
    <div className={`card ${className}`}>
      {title ? (
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="text-base font-bold text-slate-900">{title}</h2>
          {action}
        </div>
      ) : null}
      {children}
    </div>
  );
}

/** Friendly empty state with icon, message and optional CTA. */
export function EmptyState({ icon: Icon, title, message, action, href, compact }) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${compact ? "py-8" : "py-14"}`}>
      {Icon ? (
        <div className="mb-4 rounded-2xl bg-slate-100 p-4 text-slate-400">
          <Icon className="h-7 w-7" strokeWidth={1.75} />
        </div>
      ) : null}
      <p className="font-semibold text-slate-800">{title}</p>
      {message ? <p className="mt-1 max-w-sm text-sm text-slate-500">{message}</p> : null}
      {action && href ? (
        <Link href={href} className="btn-primary mt-5">
          {action}
        </Link>
      ) : null}
    </div>
  );
}

/** Pulsing skeleton block; compose a few for loading states. */
export function Skeleton({ className = "" }) {
  return <div className={`animate-pulse rounded-lg bg-slate-200/70 ${className}`} />;
}

/** Standard loading placeholder for lists/tables. */
export function LoadingRows({ rows = 3 }) {
  return (
    <div className="space-y-3 py-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/5" />
          </div>
          <Skeleton className="h-8 w-24" />
        </div>
      ))}
    </div>
  );
}

/** Inline error banner for mutation failures. */
export function ErrorBanner({ message, onDismiss }) {
  if (!message) return null;
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      <p>{message}</p>
      {onDismiss ? (
        <button onClick={onDismiss} className="font-bold text-red-400 hover:text-red-600">
          ×
        </button>
      ) : null}
    </div>
  );
}

/** Colored dot + label, for statuses in dense tables. */
export function Dot({ color = "bg-slate-400", label }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-slate-700">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      {label}
    </span>
  );
}

/** Circular avatar with initial fallback. */
export function Avatar({ name, src, size = "h-10 w-10 text-sm" }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={name ?? ""} className={`${size} rounded-full object-cover`} />;
  }
  const initial = (name ?? "?").trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      className={`${size} inline-flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-700`}
    >
      {initial}
    </span>
  );
}
