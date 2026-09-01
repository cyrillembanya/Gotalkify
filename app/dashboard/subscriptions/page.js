"use client";

import { useState } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { fmtMoney, fmtDate } from "@/lib/format";
import {
  PageHeader,
  SectionCard,
  EmptyState,
  LoadingRows,
  ErrorBanner,
  Avatar,
} from "@/components/dashboard/ui";
import { Repeat } from "lucide-react";
import { useViewerTimezone } from "@/lib/useViewerTimezone";

const STATUS = {
  active: ["badge-green", "Active"],
  past_due: ["badge-yellow", "Payment issue"],
  cancelled: ["badge-gray", "Cancelled"],
};

export default function SubscriptionsPage() {
  const timezone = useViewerTimezone();
  const me = useQuery(api.users.me);
  const subscriptions = useQuery(api.subscriptions.mine);
  const cancelSubscription = useAction(api.stripe.cancelSubscription);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);
  const [cancelled, setCancelled] = useState({});

  if (!me) return <LoadingRows rows={4} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Subscriptions"
        description="Your recurring hour plans with tutors."
      />

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      <SectionCard title="My subscriptions">
        <p className="mb-4 text-sm text-slate-500">
          Subscriptions renew every 28 days and top up your hours with a tutor.
          Unused hours roll over while the subscription is active — and stay
          usable even after cancellation.
        </p>
        {subscriptions === undefined ? (
          <LoadingRows rows={3} />
        ) : subscriptions.length === 0 ? (
          <EmptyState
            compact
            icon={Repeat}
            title="No subscriptions yet"
            message="Start one from any tutor's page under “Buy hours”."
            action="Browse tutors"
            href="/dashboard/tutors"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Tutor</th>
                  <th>Plan</th>
                  <th>Status</th>
                  <th>Renews</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {subscriptions.map((subscription) => {
                  const [cls, label] = STATUS[subscription.status] ?? ["badge-gray", subscription.status];
                  const pendingCancel = cancelled[subscription._id];
                  return (
                    <tr key={subscription._id} className="transition-colors hover:bg-slate-50">
                      <td>
                        <span className="flex items-center gap-3 font-medium text-slate-800">
                          <Avatar name={subscription.tutorName} size="h-8 w-8 text-xs" />
                          {subscription.tutorName}
                        </span>
                      </td>
                      <td>
                        {subscription.hoursPerCycle}h / 28 days
                        {subscription.rateCents
                          ? ` · ${fmtMoney(subscription.rateCents * subscription.hoursPerCycle)}`
                          : ""}
                      </td>
                      <td><span className={cls}>{label}</span></td>
                      <td>
                        {subscription.currentPeriodEnd
                          ? fmtDate(subscription.currentPeriodEnd, timezone)
                          : "—"}
                      </td>
                      <td>
                        {subscription.status === "active" ? (
                          pendingCancel ? (
                            <span className="text-sm text-slate-500">
                              Cancels at period end
                            </span>
                          ) : (
                            <button
                              className="btn-ghost px-4 py-2 text-sm text-red-600"
                              disabled={busyId === subscription._id}
                              onClick={async () => {
                                if (!window.confirm("Cancel this subscription at the end of the current period? Remaining hours stay usable.")) return;
                                setBusyId(subscription._id);
                                setError(null);
                                try {
                                  await cancelSubscription({
                                    stripeSubscriptionId: subscription.stripeSubscriptionId,
                                  });
                                  setCancelled((c) => ({ ...c, [subscription._id]: true }));
                                } catch (err) {
                                  setError("Could not cancel — please try again or contact support.");
                                } finally {
                                  setBusyId(null);
                                }
                              }}
                            >
                              Cancel
                            </button>
                          )
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
