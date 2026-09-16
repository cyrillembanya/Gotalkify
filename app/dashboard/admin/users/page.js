"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { fmtDate } from "@/lib/format";
import { cleanError } from "@/components/admin/helpers";
import {
  PageHeader,
  SectionCard,
  EmptyState,
  LoadingRows,
  ErrorBanner,
  Avatar,
} from "@/components/dashboard/ui";
import {
  Search,
  Users,
  ShieldAlert,
  ShieldCheck,
  ShieldMinus,
  Copy,
  Check,
  Ban,
  RotateCcw,
  Trash2,
  Loader2,
} from "lucide-react";
import { useViewerTimezone } from "@/lib/useViewerTimezone";
import { useConfirm } from "@/components/DialogProvider";

const ROLE_BADGE = {
  admin: "badge-red",
  tutor: "badge-green",
  tutor_applicant: "badge-yellow",
  student: "badge-blue",
};

const STATUS_BADGE = {
  active: "badge-green",
  suspended: "badge-yellow",
  deleted: "badge-red",
};

const ROLE_LABEL = {
  admin: "Admin",
  tutor: "Tutor",
  tutor_applicant: "Applicant",
  student: "Student",
};

/** Compact icon button for a table row; the label is the tooltip and the screen-reader text. */
function RowAction({ icon: Icon, label, tone = "default", busy = false, ...props }) {
  const tones = {
    default: "text-slate-500 hover:bg-slate-100 hover:text-slate-800",
    primary: "text-brand-600 hover:bg-brand-50 hover:text-brand-700",
    danger: "text-red-500 hover:bg-red-50 hover:text-red-700",
  };
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={busy || props.disabled}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 ${tones[tone]}`}
      {...props}
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        <Icon className="h-4 w-4" aria-hidden="true" />
      )}
    </button>
  );
}

export default function AdminUsersPage() {
  const timezone = useViewerTimezone();
  const me = useQuery(api.users.me);
  const isAdmin = !!me && me.role === "admin";

  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const users = useQuery(
    api.admin.users,
    isAdmin ? { search: search || undefined, role: role || undefined } : "skip"
  );
  const setUserStatus = useMutation(api.admin.setUserStatus);
  const setAdmin = useMutation(api.admin.setAdmin);
  const transferHours = useMutation(api.admin.transferHours);
  const confirm = useConfirm();

  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState(null);
  const [roleBusyId, setRoleBusyId] = useState(null);

  // Transfer form state
  const [studentId, setStudentId] = useState("");
  const [fromTutorId, setFromTutorId] = useState("");
  const [toTutorId, setToTutorId] = useState("");
  const [minutes, setMinutes] = useState("");
  const [transferBusy, setTransferBusy] = useState(false);
  const [transferError, setTransferError] = useState("");
  const [transferResult, setTransferResult] = useState(null);

  if (me === undefined) return <LoadingRows rows={4} />;
  if (!isAdmin) {
    return (
      <div className="card">
        <EmptyState
          compact
          icon={ShieldAlert}
          title="Admins only"
          message="You need administrator access to view this page."
        />
      </div>
    );
  }

  async function changeStatus(user, status) {
    if (status === "deleted") {
      const ok = await confirm({
        title: `Delete ${user.name || user.email}?`,
        message: "The account is soft-deleted: they can no longer log in, but their data is kept.",
        confirmLabel: "Delete",
        danger: true,
      });
      if (!ok) return;
    }
    setError("");
    try {
      await setUserStatus({ userId: user._id, status });
    } catch (err) {
      setError(cleanError(err));
    }
  }

  async function changeAdmin(user, isAdmin) {
    const who = user.name || user.email || "this user";
    const ok = await confirm(
      isAdmin
        ? {
            title: `Make ${who} an admin?`,
            message: "They will get full access to this dashboard — every user, booking, payout and setting.",
            confirmLabel: "Make admin",
          }
        : {
            title: `Remove admin access from ${who}?`,
            confirmLabel: "Remove access",
            danger: true,
          }
    );
    if (!ok) return;
    setError("");
    setRoleBusyId(user._id);
    try {
      await setAdmin({ userId: user._id, isAdmin });
    } catch (err) {
      setError(cleanError(err));
    } finally {
      setRoleBusyId(null);
    }
  }

  function copyId(id) {
    try {
      navigator.clipboard.writeText(id);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // Clipboard unavailable — ignore.
    }
  }

  async function onTransfer(e) {
    e.preventDefault();
    setTransferBusy(true);
    setTransferError("");
    setTransferResult(null);
    try {
      const result = await transferHours({
        studentId: studentId.trim(),
        fromTutorId: fromTutorId.trim(),
        toTutorId: toTutorId.trim(),
        minutes: Number(minutes),
      });
      setTransferResult(result.targetMinutes);
      setMinutes("");
    } catch (err) {
      setTransferError(cleanError(err));
    } finally {
      setTransferBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Users" description="Search, moderate and manage every account on the platform." />

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            id="user-search"
            className="input pl-10"
            placeholder="Name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search users"
          />
        </div>
        <select
          id="user-role"
          className="input sm:max-w-xs"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          aria-label="Filter by role"
        >
          <option value="">All roles</option>
          <option value="student">Student</option>
          <option value="tutor">Tutor</option>
          <option value="tutor_applicant">Tutor applicant</option>
          <option value="admin">Admin</option>
        </select>
      </div>

      <ErrorBanner message={error} onDismiss={() => setError("")} />

      <SectionCard title="All users">
        {users === undefined ? (
          <LoadingRows rows={5} />
        ) : users.length === 0 ? (
          <EmptyState
            compact
            icon={Users}
            title="No users match"
            message="Try a different search term or role filter."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Joined</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const isMe = user._id === me._id;
                  const isDeleted = user.status === "deleted";
                  return (
                    <tr key={user._id} className="transition-colors hover:bg-slate-50">
                      <td data-primary>
                        <div className="flex min-w-0 items-center gap-3">
                          <Avatar name={user.name || user.email} size="h-9 w-9 text-xs" />
                          <div className="min-w-0">
                            <p className="flex flex-wrap items-center gap-2 font-medium text-slate-800">
                              <span className="truncate">{user.name || user.email || "—"}</span>
                              {isMe ? (
                                <span className="badge-gray text-[10px] font-semibold uppercase tracking-wide">
                                  You
                                </span>
                              ) : null}
                            </p>
                            {user.name && user.email ? (
                              <p className="truncate text-xs text-slate-500">{user.email}</p>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td data-label="Role">
                        <span className={ROLE_BADGE[user.role] ?? "badge-gray"}>
                          {ROLE_LABEL[user.role] ?? user.role}
                        </span>
                      </td>
                      <td data-label="Status">
                        <span className={`${STATUS_BADGE[user.status] ?? "badge-gray"} capitalize`}>
                          {user.status}
                        </span>
                      </td>
                      <td data-label="Joined" className="whitespace-nowrap text-slate-500">
                        {fmtDate(user.createdAt, timezone)}
                      </td>
                      <td data-actions>
                        <div className="flex items-center justify-end gap-0.5 whitespace-nowrap md:justify-end">
                          <RowAction
                            icon={copiedId === user._id ? Check : Copy}
                            label={copiedId === user._id ? "Copied!" : "Copy user ID"}
                            tone={copiedId === user._id ? "primary" : "default"}
                            onClick={() => copyId(user._id)}
                          />
                          {!isMe && !isDeleted ? (
                            user.role === "admin" ? (
                              <RowAction
                                icon={ShieldMinus}
                                label="Remove admin access"
                                busy={roleBusyId === user._id}
                                onClick={() => changeAdmin(user, false)}
                              />
                            ) : (
                              <RowAction
                                icon={ShieldCheck}
                                label="Make admin"
                                tone="primary"
                                busy={roleBusyId === user._id}
                                onClick={() => changeAdmin(user, true)}
                              />
                            )
                          ) : null}
                          {!isDeleted ? (
                            <>
                              <span className="mx-1 h-4 w-px bg-slate-200" aria-hidden="true" />
                              {user.status === "suspended" ? (
                                <RowAction
                                  icon={RotateCcw}
                                  label="Reactivate account"
                                  tone="primary"
                                  onClick={() => changeStatus(user, "active")}
                                />
                              ) : (
                                <RowAction
                                  icon={Ban}
                                  label="Suspend account"
                                  tone="danger"
                                  onClick={() => changeStatus(user, "suspended")}
                                />
                              )}
                              <RowAction
                                icon={Trash2}
                                label="Delete account"
                                tone="danger"
                                onClick={() => changeStatus(user, "deleted")}
                              />
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Transfer hours between tutors (admin-assisted)">
        <p className="mb-4 text-sm text-slate-500">
          Moves a student&apos;s prepaid minutes from one tutor to another at their monetary
          value — the received minutes are recalculated at the target tutor&apos;s rate. Paste
          user IDs from the table above (use the Copy ID buttons).
        </p>
        <form onSubmit={onTransfer} className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="transfer-student">
              Student user ID
            </label>
            <input
              id="transfer-student"
              className="input"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="transfer-minutes">
              Minutes to transfer
            </label>
            <input
              id="transfer-minutes"
              className="input"
              type="number"
              min="1"
              step="1"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="transfer-from">
              From tutor user ID
            </label>
            <input
              id="transfer-from"
              className="input"
              value={fromTutorId}
              onChange={(e) => setFromTutorId(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="transfer-to">
              To tutor user ID
            </label>
            <input
              id="transfer-to"
              className="input"
              value={toTutorId}
              onChange={(e) => setToTutorId(e.target.value)}
              required
            />
          </div>
          <div className="sm:col-span-2">
            <button type="submit" className="btn-primary w-full sm:w-auto" disabled={transferBusy}>
              {transferBusy ? "Transferring…" : "Transfer hours"}
            </button>
          </div>
        </form>
        {transferError ? (
          <div className="mt-3">
            <ErrorBanner message={transferError} onDismiss={() => setTransferError("")} />
          </div>
        ) : null}
        {transferResult !== null ? (
          <p className="mt-3 text-sm text-green-700">
            Transfer complete — the student received {transferResult} minutes (
            {(transferResult / 60).toFixed(1)} h) with the new tutor.
          </p>
        ) : null}
      </SectionCard>
    </div>
  );
}
