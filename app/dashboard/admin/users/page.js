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
import { Search, Users, ShieldAlert, ShieldCheck, ShieldMinus } from "lucide-react";
import { useViewerTimezone } from "@/lib/useViewerTimezone";

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
      if (!window.confirm(`Delete ${user.name || user.email}? This soft-deletes the account.`)) return;
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
    const question = isAdmin
      ? `Make ${who} an admin? They will get full access to this dashboard — every user, booking, payout and setting.`
      : `Remove admin access from ${who}?`;
    if (!window.confirm(question)) return;
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

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
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
          className="input max-w-xs"
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
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Joined</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user._id} className="transition-colors hover:bg-slate-50">
                    <td>
                      <span className="flex items-center gap-3 font-medium text-slate-800">
                        <Avatar name={user.name || user.email} size="h-8 w-8 text-xs" />
                        {user.name || "—"}
                      </span>
                    </td>
                    <td>{user.email || "—"}</td>
                    <td>
                      <span className={ROLE_BADGE[user.role] ?? "badge-gray"}>{user.role}</span>
                    </td>
                    <td>
                      <span className={STATUS_BADGE[user.status] ?? "badge-gray"}>{user.status}</span>
                    </td>
                    <td>{fmtDate(user.createdAt, timezone)}</td>
                    <td>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          className="btn-ghost px-3 py-1.5 text-sm"
                          onClick={() => copyId(user._id)}
                        >
                          {copiedId === user._id ? "Copied!" : "Copy ID"}
                        </button>
                        {user._id === me._id ? (
                          <span className="px-2 py-1.5 text-sm text-slate-400">You</span>
                        ) : user.role === "admin" ? (
                          <button
                            className="btn-ghost px-3 py-1.5 text-sm"
                            onClick={() => changeAdmin(user, false)}
                            disabled={roleBusyId === user._id}
                          >
                            <ShieldMinus className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
                            {roleBusyId === user._id ? "Saving…" : "Remove admin"}
                          </button>
                        ) : user.status !== "deleted" ? (
                          <button
                            className="btn-secondary px-3 py-1.5 text-sm"
                            onClick={() => changeAdmin(user, true)}
                            disabled={roleBusyId === user._id}
                          >
                            <ShieldCheck className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
                            {roleBusyId === user._id ? "Saving…" : "Make admin"}
                          </button>
                        ) : null}
                        {user.status === "suspended" ? (
                          <button
                            className="btn-secondary px-3 py-1.5 text-sm"
                            onClick={() => changeStatus(user, "active")}
                          >
                            Reactivate
                          </button>
                        ) : user.status !== "deleted" ? (
                          <button
                            className="btn-ghost px-3 py-1.5 text-sm text-red-600"
                            onClick={() => changeStatus(user, "suspended")}
                          >
                            Suspend
                          </button>
                        ) : null}
                        {user.status !== "deleted" ? (
                          <button
                            className="btn-danger px-3 py-1.5 text-sm"
                            onClick={() => changeStatus(user, "deleted")}
                          >
                            Delete
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
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
            <button type="submit" className="btn-primary" disabled={transferBusy}>
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
