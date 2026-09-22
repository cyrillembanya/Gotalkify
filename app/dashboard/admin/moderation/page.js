"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  PageHeader,
  EmptyState,
  LoadingRows,
} from "@/components/dashboard/ui";
import { ShieldAlert } from "lucide-react";
import ModerationKeywords from "@/components/admin/ModerationKeywords";
import { ModerationFlags, ModerationBlocks } from "@/components/admin/ModerationQueue";

const TABS = [
  { id: "flags", label: "Review queue" },
  { id: "blocks", label: "Closed chats" },
  { id: "keywords", label: "Keywords" },
];

function ModerationInner() {
  const searchParams = useSearchParams();
  const initialFlagId = searchParams.get("flag");
  const me = useQuery(api.users.me);
  const isAdmin = !!me && me.role === "admin";
  const settings = useQuery(api.settings.adminGet, isAdmin ? {} : "skip");
  const openCount = useQuery(api.moderation.openFlagCount, isAdmin ? {} : "skip");
  const [tab, setTab] = useState("flags");

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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Chat safety"
        description="Every student–tutor message and in-class message is screened before it is delivered. Contact details and hateful language close the chat; vulgar and sexual language blocks the message."
      />

      {settings ? (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
          Filtering is{" "}
          <strong className={settings.moderationEnabled ? "text-green-700" : "text-red-600"}>
            {settings.moderationEnabled ? "on" : "off"}
          </strong>{" "}
          and safety alerts go to{" "}
          <strong className="text-slate-800">{settings.safetyContactEmail}</strong>. Both
          are changed in{" "}
          <a className="text-brand-600 underline" href="/dashboard/admin/settings">
            Settings → Platform
          </a>
          .
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1.5">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`shrink-0 rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
              tab === item.id
                ? "bg-brand-600 text-white shadow-sm"
                : "bg-white text-slate-600 hover:text-brand-700"
            }`}
          >
            {item.label}
            {item.id === "flags" && openCount ? (
              <span className="ml-2 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                {openCount}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {tab === "flags" ? <ModerationFlags initialFlagId={initialFlagId} /> : null}
      {tab === "blocks" ? <ModerationBlocks /> : null}
      {tab === "keywords" ? <ModerationKeywords /> : null}
    </div>
  );
}

export default function AdminModerationPage() {
  return (
    <Suspense fallback={<LoadingRows rows={4} />}>
      <ModerationInner />
    </Suspense>
  );
}
