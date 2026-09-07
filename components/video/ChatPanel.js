"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Paperclip, Send, X } from "lucide-react";
import { fmtTime } from "@/lib/format";
import { useViewerTimezone } from "@/lib/useViewerTimezone";
import {
  ATTACHMENT_ACCEPT,
  checkAttachment,
  uploadAttachment,
} from "@/lib/attachments";
import { AttachmentBubble, PendingAttachment } from "@/components/chat/Attachment";

/** In-class text chat — handy for links, spellings, corrections and handouts. */
export default function ChatPanel({ roomId, myUserId, onClose }) {
  const timezone = useViewerTimezone();
  const messages = useQuery(api.video.chat, { roomId });
  const sendChat = useMutation(api.video.sendChat);
  const generateUploadUrl = useMutation(api.files.generateChatUploadUrl);
  const [draft, setDraft] = useState("");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  function pickFile(event) {
    const chosen = event.target.files?.[0];
    event.target.value = ""; // let the same file be picked again after removing
    if (!chosen) return;
    const problem = checkAttachment(chosen);
    if (problem) return setError(problem);
    setError(null);
    setFile(chosen);
  }

  async function submit(event) {
    event.preventDefault();
    const text = draft.trim();
    if (!text && !file) return;
    setBusy(true);
    setError(null);
    try {
      const attachment = file ? await uploadAttachment(generateUploadUrl, file) : {};
      await sendChat({ roomId, text, ...attachment });
      setDraft("");
      setFile(null);
    } catch {
      setError("Could not send that. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="flex h-full w-full flex-col border-l border-white/10 bg-slate-900 md:w-80">
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <h2 className="text-sm font-semibold text-white">Class chat</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close chat"
          className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages === undefined ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-slate-500">
            Messages stay with this class. Share links, files, spellings or
            corrections here.
          </p>
        ) : (
          messages.map((message) => {
            const mine = message.userId === myUserId;
            return (
              <div key={message._id} className={mine ? "text-right" : ""}>
                <p className="text-[11px] text-slate-500">
                  {mine ? "You" : message.name} · {fmtTime(message.sentAt, timezone)}
                </p>
                {message.attachmentUrl ? (
                  <div className="mt-0.5 inline-block max-w-[90%] text-left">
                    <AttachmentBubble message={message} tone="dark" />
                  </div>
                ) : null}
                {message.text ? (
                  <p
                    className={`mt-0.5 inline-block max-w-[90%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm ${
                      mine ? "bg-accent-500 text-brand-900" : "bg-white/10 text-slate-100"
                    }`}
                  >
                    {message.text}
                  </p>
                ) : null}
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={submit} className="border-t border-white/10 p-3">
        {error ? <p className="mb-2 text-xs text-red-400">{error}</p> : null}
        <PendingAttachment
          file={file}
          onRemove={() => setFile(null)}
          disabled={busy}
          tone="dark"
        />
        <div className="flex gap-2">
          <input
            ref={fileRef}
            type="file"
            accept={ATTACHMENT_ACCEPT}
            onChange={pickFile}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            aria-label="Attach a file"
            title="Attach a file"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white disabled:opacity-40"
          >
            <Paperclip className="h-4 w-4" />
          </button>
          <input
            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-accent-500 focus:outline-none"
            placeholder="Type a message"
            value={draft}
            maxLength={2000}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button
            type="submit"
            aria-label="Send message"
            disabled={busy || (!draft.trim() && !file)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-500 text-brand-900 disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </form>
    </aside>
  );
}
