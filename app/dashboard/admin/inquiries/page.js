"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { fmtDateTime } from "@/lib/format";
import { cleanError } from "@/components/admin/helpers";
import {
  PageHeader,
  SectionCard,
  EmptyState,
  LoadingRows,
  ErrorBanner,
  Avatar,
} from "@/components/dashboard/ui";
import { Inbox, MailPlus } from "lucide-react";
import { useViewerTimezone } from "@/lib/useViewerTimezone";

export default function AdminInquiriesPage() {
  const timezone = useViewerTimezone();
  const me = useQuery(api.users.me);
  const isAdmin = !!me && me.role === "admin";
  const inquiries = useQuery(api.admin.inquiries, isAdmin ? {} : "skip");
  const subscribers = useQuery(api.admin.newsletterSubscribers, isAdmin ? {} : "skip");
  const markHandled = useMutation(api.admin.markInquiryHandled);

  const [error, setError] = useState("");

  if (me === undefined) return <LoadingRows rows={4} />;
  if (!isAdmin) {
    return (
      <div className="card">
        <p className="font-semibold text-slate-800">Admins only</p>
      </div>
    );
  }

  async function onMarkHandled(inquiryId) {
    setError("");
    try {
      await markHandled({ inquiryId });
    } catch (err) {
      setError(cleanError(err));
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inquiries"
        description="Messages from the contact form and your newsletter audience."
      />

      <ErrorBanner message={error} onDismiss={() => setError("")} />

      <SectionCard title="Contact inquiries">
        {inquiries === undefined ? (
          <LoadingRows rows={3} />
        ) : inquiries.length === 0 ? (
          <EmptyState
            compact
            icon={Inbox}
            title="No inquiries yet"
            message="Messages sent through the contact form will land here."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {inquiries.map((inquiry) => {
              const handled = inquiry.status === "handled";
              return (
                <li
                  key={inquiry._id}
                  className={`py-5 first:pt-0 last:pb-0 ${handled ? "opacity-60" : ""}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <Avatar name={inquiry.name} />
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 font-bold text-slate-900">
                          {inquiry.name}
                          {inquiry.program ? (
                            <span className="badge-blue">{inquiry.program}</span>
                          ) : null}
                          {handled ? <span className="badge-green">Handled</span> : null}
                        </p>
                        <a
                          href={`mailto:${inquiry.email}`}
                          className="text-sm text-brand-600 hover:underline"
                        >
                          {inquiry.email}
                        </a>
                        <p className="mt-1 text-xs text-slate-400">
                          {fmtDateTime(inquiry.createdAt, timezone)}
                        </p>
                      </div>
                    </div>
                    {!handled ? (
                      <button
                        className="btn-secondary px-4 py-2 text-sm"
                        onClick={() => onMarkHandled(inquiry._id)}
                      >
                        Mark handled
                      </button>
                    ) : null}
                  </div>
                  <p className="mt-3 whitespace-pre-line text-sm text-slate-600">
                    {inquiry.message}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>

      <SectionCard
        title="Newsletter subscribers"
        action={
          <span className="badge-blue">
            {subscribers === undefined ? "…" : subscribers.length}
          </span>
        }
      >
        {subscribers === undefined ? (
          <LoadingRows rows={3} />
        ) : subscribers.length === 0 ? (
          <EmptyState
            compact
            icon={MailPlus}
            title="No subscribers yet"
            message="Newsletter signups will be listed here as they come in."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Locale</th>
                  <th>Subscribed</th>
                </tr>
              </thead>
              <tbody>
                {subscribers.map((sub) => (
                  <tr key={sub.email} className="transition-colors hover:bg-slate-50">
                    <td>{sub.email}</td>
                    <td>
                      <span className="badge-gray">{sub.locale || "en"}</span>
                    </td>
                    <td>{fmtDateTime(sub.createdAt, timezone)}</td>
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
