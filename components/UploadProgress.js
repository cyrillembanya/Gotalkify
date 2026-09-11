"use client";

import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { fmtBytes } from "@/lib/attachments";

/**
 * Progress line for a `useUpload` slot: file name and size, a bar while the
 * transfer runs, a tick once it is stored, and a Retry button on failure.
 */
export default function UploadProgress({ upload, className = "" }) {
  const { file, status, progress, error, retry } = upload;
  if (!file || status === "idle") return null;

  const pct = Math.round(progress * 100);
  return (
    <div className={`mt-2 text-xs ${className}`}>
      <div className="flex items-center gap-2 text-slate-600">
        {status === "done" ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
        ) : status === "error" ? (
          <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
        ) : (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand-600" />
        )}
        <span className="min-w-0 flex-1 truncate">
          {file.name} <span className="text-slate-400">· {fmtBytes(file.size)}</span>
        </span>
        <span className="shrink-0 tabular-nums">
          {status === "preparing"
            ? "Preparing…"
            : status === "uploading"
              ? `${pct}%`
              : status === "done"
                ? "Uploaded"
                : null}
        </span>
      </div>
      {status === "uploading" || status === "preparing" ? (
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-brand-600 transition-[width] duration-300"
            style={{ width: `${status === "preparing" ? 0 : pct}%` }}
          />
        </div>
      ) : null}
      {status === "error" ? (
        <p className="mt-1 text-red-600">
          {error ?? "Upload failed."}{" "}
          <button type="button" onClick={retry} className="font-semibold underline">
            Retry
          </button>
        </p>
      ) : null}
    </div>
  );
}
