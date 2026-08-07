"use client";

import { useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TiptapImage from "@tiptap/extension-image";
import TextAlign from "@tiptap/extension-text-align";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { proseClass } from "@/components/marketing/Markdown";
import {
  Undo2,
  Redo2,
  Pilcrow,
  Heading2,
  Heading3,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Link as LinkIcon,
  Unlink,
  List,
  ListOrdered,
  Quote,
  Minus,
  AlignLeft,
  AlignCenter,
  AlignRight,
  ImagePlus,
  ImageIcon,
  RemoveFormatting,
  Loader2,
} from "lucide-react";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function ToolbarButton({ icon: Icon, label, onClick, active, disabled }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onMouseDown={(e) => e.preventDefault()} // keep editor selection/focus
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg p-2 transition-colors disabled:opacity-40 ${
        active
          ? "bg-brand-100 text-brand-700"
          : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
      }`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function Divider() {
  return <span className="mx-1 h-5 w-px shrink-0 bg-slate-200" />;
}

/**
 * WYSIWYG editor for blog posts. Shows content exactly as it renders on the
 * public site (same prose styles) and produces HTML via onChange.
 */
export default function RichTextEditor({ value, onChange }) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const getImageUrl = useMutation(api.blog.imageUrl);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] }, // the post title is the page's h1
        link: { openOnClick: false, autolink: true, defaultProtocol: "https" },
      }),
      TiptapImage,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
    ],
    content: value,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    immediatelyRender: false,
    shouldRerenderOnTransaction: true, // keep toolbar active-states in sync
    editorProps: {
      attributes: {
        class: "focus:outline-none min-h-[360px]",
        "aria-label": "Post content",
      },
    },
  });

  function setLink() {
    if (!editor) return;
    const current = editor.getAttributes("link").href ?? "";
    const url = window.prompt("Link address (leave empty to remove):", current || "https://");
    if (url === null) return;
    if (!url.trim() || url.trim() === "https://") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  }

  function insertImageFromUrl() {
    if (!editor) return;
    const url = window.prompt("Image address (https://…):", "https://");
    if (!url || !url.trim() || url.trim() === "https://") return;
    editor.chain().focus().setImage({ src: url.trim() }).run();
  }

  async function onPickImage(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !editor) return;
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
      const alt = file.name.replace(/\.[^.]+$/, "");
      editor.chain().focus().setImage({ src: url, alt }).run();
    } catch {
      setUploadError("Image upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  if (!editor) {
    return (
      <div className="min-h-[420px] animate-pulse rounded-xl border border-slate-200 bg-slate-50" />
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 border-b border-slate-200 bg-slate-50 px-2 py-1.5">
        <ToolbarButton
          icon={Undo2}
          label="Undo"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
        />
        <ToolbarButton
          icon={Redo2}
          label="Redo"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
        />
        <Divider />
        <ToolbarButton
          icon={Pilcrow}
          label="Normal text"
          active={editor.isActive("paragraph")}
          onClick={() => editor.chain().focus().setParagraph().run()}
        />
        <ToolbarButton
          icon={Heading2}
          label="Section heading"
          active={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        />
        <ToolbarButton
          icon={Heading3}
          label="Sub-heading"
          active={editor.isActive("heading", { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        />
        <Divider />
        <ToolbarButton
          icon={Bold}
          label="Bold (Ctrl+B)"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        />
        <ToolbarButton
          icon={Italic}
          label="Italic (Ctrl+I)"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        />
        <ToolbarButton
          icon={Underline}
          label="Underline (Ctrl+U)"
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        />
        <ToolbarButton
          icon={Strikethrough}
          label="Strikethrough"
          active={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        />
        <Divider />
        <ToolbarButton
          icon={LinkIcon}
          label="Add or edit link"
          active={editor.isActive("link")}
          onClick={setLink}
        />
        <ToolbarButton
          icon={Unlink}
          label="Remove link"
          disabled={!editor.isActive("link")}
          onClick={() => editor.chain().focus().unsetLink().run()}
        />
        <Divider />
        <ToolbarButton
          icon={List}
          label="Bulleted list"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        />
        <ToolbarButton
          icon={ListOrdered}
          label="Numbered list"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        />
        <ToolbarButton
          icon={Quote}
          label="Quote"
          active={editor.isActive("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        />
        <ToolbarButton
          icon={Minus}
          label="Divider line"
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
        />
        <Divider />
        <ToolbarButton
          icon={AlignLeft}
          label="Align left"
          active={editor.isActive({ textAlign: "left" })}
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
        />
        <ToolbarButton
          icon={AlignCenter}
          label="Align center"
          active={editor.isActive({ textAlign: "center" })}
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
        />
        <ToolbarButton
          icon={AlignRight}
          label="Align right"
          active={editor.isActive({ textAlign: "right" })}
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
        />
        <Divider />
        <ToolbarButton
          icon={uploading ? Loader2 : ImagePlus}
          label={uploading ? "Uploading…" : "Upload image"}
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
        />
        <ToolbarButton icon={ImageIcon} label="Image from web address" onClick={insertImageFromUrl} />
        <Divider />
        <ToolbarButton
          icon={RemoveFormatting}
          label="Clear formatting"
          onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onPickImage}
        />
      </div>

      {uploadError ? (
        <p className="border-b border-red-100 bg-red-50 px-4 py-2 text-sm text-red-600">
          {uploadError}
        </p>
      ) : null}

      <div
        className={`cursor-text px-5 py-4 ${proseClass} [&_.ProseMirror-selectednode]:ring-2 [&_.ProseMirror-selectednode]:ring-brand-400`}
        onClick={() => editor.chain().focus().run()}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
