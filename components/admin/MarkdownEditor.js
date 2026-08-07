"use client";

import { useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import Markdown, { proseClass } from "@/components/marketing/Markdown";
import {
  Bold,
  Italic,
  Heading2,
  Heading3,
  Link as LinkIcon,
  List,
  ListOrdered,
  Quote,
  Minus,
  ImagePlus,
  Loader2,
} from "lucide-react";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function ToolbarButton({ icon: Icon, label, onClick, disabled }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onMouseDown={(e) => e.preventDefault()} // keep the textarea selection
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

/**
 * Markdown editor: formatting toolbar, Ctrl/Cmd+B/I shortcuts, image upload
 * to Convex storage, and a live preview rendered with the exact styles of
 * the public blog post page.
 */
export default function MarkdownEditor({ value, onChange, rows = 22 }) {
  const textareaRef = useRef(null);
  const fileRef = useRef(null);
  const [tab, setTab] = useState("write");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const getImageUrl = useMutation(api.blog.imageUrl);

  function applyEdit(next, selStart, selEnd) {
    onChange(next);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(selStart, selEnd);
      }
    });
  }

  /** Wrap the selection (or a placeholder) with markers, e.g. **bold**. */
  function wrapSelection(before, after = before, placeholder = "text") {
    const el = textareaRef.current;
    if (!el) return;
    const { selectionStart: start, selectionEnd: end } = el;
    const selected = value.slice(start, end) || placeholder;
    const next = value.slice(0, start) + before + selected + after + value.slice(end);
    applyEdit(next, start + before.length, start + before.length + selected.length);
  }

  /** Prefix every line touched by the selection, e.g. "- " or "## ". */
  function prefixLines(makePrefix, { replaceHeading = false } = {}) {
    const el = textareaRef.current;
    if (!el) return;
    const { selectionStart: start, selectionEnd: end } = el;
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    let lineEnd = value.indexOf("\n", end);
    if (lineEnd === -1) lineEnd = value.length;
    const block = value
      .slice(lineStart, lineEnd)
      .split("\n")
      .map((line, i) => {
        const cleaned = replaceHeading ? line.replace(/^#{1,6} /, "") : line;
        return cleaned.trim() ? makePrefix(i) + cleaned : cleaned;
      })
      .join("\n");
    const next = value.slice(0, lineStart) + block + value.slice(lineEnd);
    applyEdit(next, lineStart, lineStart + block.length);
  }

  /** Insert markdown as its own paragraph at the cursor. */
  function insertBlock(markdown) {
    const el = textareaRef.current;
    const at = el ? el.selectionEnd : value.length;
    const before = value.slice(0, at);
    const after = value.slice(at);
    const next =
      before +
      (before && !before.endsWith("\n\n") ? (before.endsWith("\n") ? "\n" : "\n\n") : "") +
      markdown +
      (after.startsWith("\n") ? "" : "\n") +
      after;
    const caret = next.length - after.length;
    applyEdit(next, caret, caret);
  }

  function insertLink() {
    const el = textareaRef.current;
    if (!el) return;
    const { selectionStart: start, selectionEnd: end } = el;
    const text = value.slice(start, end) || "link text";
    const url = "https://";
    const next = value.slice(0, start) + `[${text}](${url})` + value.slice(end);
    const urlStart = start + text.length + 3; // select the URL for typing over
    applyEdit(next, urlStart, urlStart + url.length);
  }

  async function onPickImage(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      setUploadError("Image is too large (max 5 MB).");
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const uploadUrl = await generateUploadUrl();
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!res.ok) throw new Error("Upload failed");
      const { storageId } = await res.json();
      const url = await getImageUrl({ storageId });
      const alt = file.name.replace(/\.[^.]+$/, "").replace(/[[\]()]/g, "");
      insertBlock(`![${alt}](${url})`);
    } catch {
      setUploadError("Image upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  function onKeyDown(event) {
    if (!(event.metaKey || event.ctrlKey)) return;
    const key = event.key.toLowerCase();
    if (key === "b") {
      event.preventDefault();
      wrapSelection("**");
    } else if (key === "i") {
      event.preventDefault();
      wrapSelection("*");
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50 px-2 py-1.5">
        <div className="mr-2 flex gap-1 rounded-lg bg-slate-200/60 p-0.5">
          {[["write", "Write"], ["preview", "Preview"]].map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                tab === id ? "bg-white text-brand-700 shadow-sm" : "text-slate-500"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === "write" ? (
          <>
            <ToolbarButton icon={Heading2} label="Section heading" onClick={() => prefixLines(() => "## ", { replaceHeading: true })} />
            <ToolbarButton icon={Heading3} label="Sub-heading" onClick={() => prefixLines(() => "### ", { replaceHeading: true })} />
            <span className="mx-1 h-5 w-px bg-slate-200" />
            <ToolbarButton icon={Bold} label="Bold (Ctrl+B)" onClick={() => wrapSelection("**")} />
            <ToolbarButton icon={Italic} label="Italic (Ctrl+I)" onClick={() => wrapSelection("*")} />
            <ToolbarButton icon={LinkIcon} label="Link" onClick={insertLink} />
            <span className="mx-1 h-5 w-px bg-slate-200" />
            <ToolbarButton icon={List} label="Bulleted list" onClick={() => prefixLines(() => "- ")} />
            <ToolbarButton icon={ListOrdered} label="Numbered list" onClick={() => prefixLines((i) => `${i + 1}. `)} />
            <ToolbarButton icon={Quote} label="Quote" onClick={() => prefixLines(() => "> ")} />
            <ToolbarButton icon={Minus} label="Divider" onClick={() => insertBlock("---")} />
            <span className="mx-1 h-5 w-px bg-slate-200" />
            <ToolbarButton
              icon={uploading ? Loader2 : ImagePlus}
              label={uploading ? "Uploading…" : "Insert image"}
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            />
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onPickImage}
            />
          </>
        ) : null}
      </div>

      {uploadError ? (
        <p className="border-b border-red-100 bg-red-50 px-4 py-2 text-sm text-red-600">
          {uploadError}
        </p>
      ) : null}

      {tab === "write" ? (
        <textarea
          ref={textareaRef}
          rows={rows}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          spellCheck
          className="block w-full resize-y border-0 px-4 py-3 font-mono text-sm leading-6 text-slate-800 placeholder:text-slate-400 focus:ring-0"
          placeholder={"Write your post in Markdown…\n\n## A section heading\n\nA paragraph with **bold** and *italic* text."}
        />
      ) : (
        <div className="max-h-[70vh] overflow-y-auto px-6 py-4">
          {value.trim() ? (
            <div className={proseClass}>
              <Markdown content={value} />
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-slate-400">
              Nothing to preview yet.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
