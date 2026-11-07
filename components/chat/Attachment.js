"use client";

import { Paperclip, X } from "lucide-react";
import { fmtBytes, isImageAttachment } from "@/lib/attachments";

/**
 * A sent attachment inside a message bubble: images preview inline, everything
 * else is a labelled link. `tone` picks colours for the surface it sits on.
 */
export function AttachmentBubble({ message, tone = "light" }) {
  if (!message.attachmentUrl) return null;
  const name = message.attachmentName ?? "Attachment";

  if (isImageAttachment(message.attachmentType)) {
    return (
      <a
        href={message.attachmentUrl}
        target="_blank"
        rel="noreferrer"
        className="block"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={message.attachmentUrl}
          alt={name}
          loading="lazy"
          className="max-h-56 w-auto max-w-full rounded-xl"
        />
      </a>
    );
  }

  const styles =
    tone === "dark"
      ? "bg-white/10 text-slate-100 hover:bg-white/20"
      : tone === "mine"
        ? "bg-white/15 text-white hover:bg-white/25"
        : "bg-white text-slate-700 hover:bg-slate-50";

  return (
    <a
      href={message.attachmentUrl}
      target="_blank"
      rel="noreferrer"
      download={name}
      className={`flex items-center gap-2 rounded-xl px-3 py-2 transition-colors ${styles}`}
    >
      <Paperclip className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
      {message.attachmentSize ? (
        <span className="shrink-0 text-[11px] opacity-70">
          {fmtBytes(message.attachmentSize)}
        </span>
      ) : null}
    </a>
  );
}

/** The chip shown above the composer while a file is staged for sending. */
export function PendingAttachment({ file, onRemove, disabled, tone = "light" }) {
  if (!file) return null;
  const styles =
    tone === "dark"
      ? "border-white/10 bg-slate-800 text-slate-200"
      : "border-slate-200 bg-slate-50 text-slate-700";
  return (
    <div
      className={`mb-2 flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${styles}`}
    >
      <Paperclip className="h-4 w-4 shrink-0 opacity-70" />
      <span className="min-w-0 flex-1 truncate">{file.name}</span>
      <span className="shrink-0 text-[11px] opacity-70">{fmtBytes(file.size)}</span>
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        aria-label="Remove attachment"
        className="shrink-0 rounded-lg p-1 opacity-70 transition-opacity hover:opacity-100 disabled:opacity-30"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
