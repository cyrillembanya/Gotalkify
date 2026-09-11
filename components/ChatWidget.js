"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { MessageCircle, X, Send, Bot, Headset } from "lucide-react";
import { cleanError } from "@/components/admin/helpers";
import Turnstile from "@/components/Turnstile";

const TOKEN_KEY = "gotalkify.support.token";

/** The visitor's handle on their own conversation, remembered per browser. */
function readToken() {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function Bubble({ message }) {
  const isVisitor = message.role === "visitor";
  const isAdmin = message.role === "admin";
  return (
    <div className={`flex ${isVisitor ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm ${
          isVisitor
            ? "rounded-br-md bg-brand-600 text-white"
            : isAdmin
              ? "rounded-bl-md border border-brand-200 bg-brand-50 text-brand-900"
              : "rounded-bl-md bg-slate-100 text-slate-800"
        }`}
      >
        {isAdmin ? (
          <p className="mb-1 flex items-center gap-1.5 text-xs font-bold">
            <Headset className="h-3.5 w-3.5" />
            {message.authorName || "GoTalkify Support"}
          </p>
        ) : null}
        <p className="whitespace-pre-line">{message.text}</p>
      </div>
    </div>
  );
}

/** Shown after the assistant gives up, so a human can pick the thread up. */
function HandoverForm({ token, onDone }) {
  const requestHuman = useMutation(api.support.requestHuman);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await requestHuman({ token, name: name.trim() || undefined, email });
      onDone();
    } catch (err) {
      setError(cleanError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-2 rounded-2xl border border-brand-200 bg-brand-50/60 p-3"
    >
      <p className="text-xs font-semibold text-brand-900">
        Leave your email and our team will take it from here.
      </p>
      <input
        className="input py-2 text-sm"
        placeholder="Your name (optional)"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <input
        className="input py-2 text-sm"
        type="email"
        required
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      <button className="btn-primary w-full py-2 text-sm" disabled={busy}>
        {busy ? "Sending…" : "Talk to a human"}
      </button>
    </form>
  );
}

function Panel({ onClose }) {
  const config = useQuery(api.support.widgetConfig);
  const startChat = useAction(api.support.startChat);
  const ask = useAction(api.support.ask);

  const [token, setToken] = useState(null);
  const [ready, setReady] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [dismissedHandover, setDismissedHandover] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    setToken(readToken());
    setReady(true);
  }, []);

  const thread = useQuery(api.support.thread, token ? { token } : "skip");
  const messages = thread?.messages ?? [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, busy]);

  // A token whose conversation no longer exists (wiped deployment) is stale.
  useEffect(() => {
    if (token && thread === null) {
      try {
        window.localStorage.removeItem(TOKEN_KEY);
      } catch {}
      setToken(null);
    }
  }, [token, thread]);

  async function onSend(e) {
    e.preventDefault();
    const question = text.trim();
    if (!question || busy) return;
    setBusy(true);
    setError(null);
    try {
      let active = token;
      if (!active) {
        const started = await startChat({
          pagePath: window.location.pathname,
          turnstileToken: turnstileToken ?? undefined,
        });
        active = started.token;
        try {
          window.localStorage.setItem(TOKEN_KEY, active);
        } catch {}
        setToken(active);
      }
      setText("");
      setDismissedHandover(false);
      await ask({ token: active, text: question });
    } catch (err) {
      setError(cleanError(err));
    } finally {
      setBusy(false);
    }
  }

  const last = messages[messages.length - 1];
  const needsHuman =
    !!last &&
    last.role === "assistant" &&
    last.escalated &&
    thread?.status === "bot" &&
    !dismissedHandover;

  return (
    <div className="flex h-[32rem] max-h-[calc(100vh-6rem)] w-[22rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
      <div className="flex items-center gap-3 bg-brand-600 px-4 py-3 text-white">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
          <Bot className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold leading-tight">GoTalkify Assistant</p>
          <p className="text-[11px] leading-tight opacity-80">
            {thread?.status === "waiting"
              ? "Waiting for our team"
              : thread?.status === "answered"
                ? "Answered by our team"
                : "Usually replies instantly"}
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close chat"
          className="rounded-lg p-1 transition-colors hover:bg-white/20"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-slate-100 px-3.5 py-2.5 text-sm text-slate-800">
              {config?.welcomeMessage ??
                "Hi! Ask me anything about GoTalkify lessons, tutors or bookings."}
            </div>
          </div>
        ) : (
          messages.map((message) => <Bubble key={message._id} message={message} />)
        )}

        {busy ? (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-md bg-slate-100 px-3.5 py-2.5 text-sm text-slate-400">
              Typing…
            </div>
          </div>
        ) : null}

        {needsHuman && token ? (
          <HandoverForm token={token} onDone={() => setDismissedHandover(true)} />
        ) : null}

        {ready && !token ? <Turnstile onToken={setTurnstileToken} /> : null}
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={onSend} className="flex items-center gap-2 border-t border-slate-100 p-3">
        <input
          className="input py-2 text-sm"
          placeholder="Ask a question…"
          maxLength={1500}
          value={text}
          disabled={!ready}
          onChange={(e) => setText(e.target.value)}
        />
        <button
          className="btn-primary shrink-0 rounded-xl px-3 py-2"
          aria-label="Send"
          disabled={busy || !text.trim()}
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}

/**
 * Floating AI support widget for the public site. Hidden inside the dashboard
 * and the classroom, which have their own chrome.
 */
export default function ChatWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const config = useQuery(api.support.widgetConfig);

  const hidden = pathname.startsWith("/class") || pathname.startsWith("/dashboard");
  if (hidden || config?.enabled === false) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-3 print:hidden">
      {open ? <Panel onClose={() => setOpen(false)} /> : null}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close support chat" : "Open support chat"}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-xl transition-transform hover:scale-105 active:scale-95"
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>
    </div>
  );
}
