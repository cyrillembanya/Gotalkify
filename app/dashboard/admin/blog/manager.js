"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import RichTextEditor from "@/components/admin/RichTextEditor";
import { looksLikeHtml, markdownToHtml } from "@/lib/content";
import {
  PageHeader,
  SectionCard,
  EmptyState,
  LoadingRows,
  ErrorBanner,
} from "@/components/dashboard/ui";
import {
  Newspaper,
  Plus,
  Pencil,
  Trash2,
  ArrowLeft,
  CheckCircle2,
  Import,
  ExternalLink,
} from "lucide-react";

function cleanError(error) {
  return String(error?.message ?? error ?? "")
    .replace(/^.*Uncaught Error:\s*/, "")
    .split("\n")[0] || "Something went wrong.";
}

function slugify(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

const EMPTY_POST = {
  title: "",
  slug: "",
  description: "",
  content: "",
  locale: "en",
  published: false,
};

/* ------------------------------- Post editor ------------------------------ */

function PostEditor({ initial, onBack }) {
  const savePost = useMutation(api.blog.savePost);
  const [form, setForm] = useState(initial);
  const [slugTouched, setSlugTouched] = useState(Boolean(initial.id));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  const set = (patch) => {
    setSaved(false);
    setForm((f) => ({ ...f, ...patch }));
  };

  async function onSave() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const id = await savePost({
        id: form.id,
        slug: form.slug,
        locale: form.locale,
        title: form.title,
        description: form.description,
        content: form.content,
        date: form.date,
        published: form.published,
      });
      setForm((f) => ({ ...f, id }));
      setSlugTouched(true);
      setSaved(true);
    } catch (err) {
      setError(cleanError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={form.id ? "Edit post" : "New post"}
        description={
          form.id
            ? "Changes go live on the blog as soon as you save."
            : "The post appears on the blog once saved with “Published” checked."
        }
      >
        <button onClick={onBack} className="btn-secondary gap-1.5 px-4 py-2 text-sm">
          <ArrowLeft className="h-4 w-4" /> All posts
        </button>
      </PageHeader>

      <SectionCard title="Post details">
        <ErrorBanner message={error} onDismiss={() => setError(null)} />
        <div className="space-y-4">
          <div>
            <label className="label" htmlFor="post-title">Title</label>
            <input
              id="post-title"
              className="input"
              value={form.title}
              onChange={(e) =>
                set({
                  title: e.target.value,
                  ...(slugTouched ? {} : { slug: slugify(e.target.value) }),
                })
              }
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="post-slug">
                Slug <span className="font-normal text-slate-400">(/blog/…)</span>
              </label>
              <input
                id="post-slug"
                className="input font-mono text-sm"
                value={form.slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  set({ slug: e.target.value });
                }}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label" htmlFor="post-date">Date</label>
                <input
                  id="post-date"
                  type="date"
                  className="input"
                  value={form.date}
                  onChange={(e) => set({ date: e.target.value })}
                />
              </div>
              <div>
                <label className="label" htmlFor="post-locale">Language</label>
                <select
                  id="post-locale"
                  className="input"
                  value={form.locale}
                  onChange={(e) => set({ locale: e.target.value })}
                >
                  <option value="en">English</option>
                  <option value="fr">Français</option>
                </select>
              </div>
            </div>
          </div>
          <div>
            <label className="label" htmlFor="post-description">
              Description <span className="font-normal text-slate-400">(card + SEO)</span>
            </label>
            <textarea
              id="post-description"
              rows={2}
              className="input"
              value={form.description}
              onChange={(e) => set({ description: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Content</label>
            <RichTextEditor value={form.content} onChange={(content) => set({ content })} />
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.published}
                onChange={(e) => set({ published: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300 text-brand-600"
              />
              Published
            </label>
            <div className="ml-auto flex items-center gap-3">
              {saved ? (
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-600">
                  <CheckCircle2 className="h-4 w-4" /> Saved
                </span>
              ) : null}
              {form.id && form.published ? (
                <a
                  href={`/blog/${form.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700"
                >
                  View <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : null}
              <button className="btn-primary" disabled={busy} onClick={onSave}>
                {busy ? "Saving…" : "Save post"}
              </button>
            </div>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

/* -------------------------------- Post list ------------------------------- */

function PostList({ posts, builtIns, onEdit, onNew }) {
  const savePost = useMutation(api.blog.savePost);
  const deletePost = useMutation(api.blog.deletePost);
  const [error, setError] = useState(null);
  const [importing, setImporting] = useState(false);

  const storedSlugs = new Set((posts ?? []).map((p) => p.slug));
  const importable = builtIns.filter((p) => !storedSlugs.has(p.slug));

  async function importBuiltIns() {
    setImporting(true);
    setError(null);
    try {
      for (const post of importable) {
        await savePost({
          slug: post.slug,
          locale: post.locale === "fr" ? "fr" : "en",
          title: post.title,
          description: post.description,
          content: markdownToHtml(post.content.trim()),
          date: post.date,
          published: true,
        });
      }
    } catch (err) {
      setError(cleanError(err));
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Blog"
        description="Write, edit and publish the articles shown on the public blog."
      >
        <button onClick={onNew} className="btn-primary gap-1.5 px-4 py-2 text-sm">
          <Plus className="h-4 w-4" /> New post
        </button>
      </PageHeader>

      <SectionCard
        title="Posts"
        action={
          importable.length > 0 ? (
            <button
              onClick={importBuiltIns}
              disabled={importing}
              className="btn-secondary gap-1.5 px-4 py-2 text-sm"
            >
              <Import className="h-4 w-4" />
              {importing
                ? "Importing…"
                : `Import ${importable.length} built-in post${importable.length > 1 ? "s" : ""}`}
            </button>
          ) : null
        }
      >
        <ErrorBanner message={error} onDismiss={() => setError(null)} />
        {posts === undefined ? (
          <LoadingRows rows={4} />
        ) : posts.length === 0 ? (
          <EmptyState
            compact
            icon={Newspaper}
            title="No posts yet"
            message={
              importable.length > 0
                ? "The public blog is empty. Import the built-in starter posts, or write a new one from scratch."
                : "Write your first post to get started."
            }
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {posts.map((post) => (
              <li
                key={post._id}
                className="flex flex-wrap items-start justify-between gap-3 py-4 first:pt-0 last:pb-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-semibold text-slate-800">
                    {post.title}
                    {post.published ? (
                      <span className="badge-green">Published</span>
                    ) : (
                      <span className="badge-yellow">Draft</span>
                    )}
                    <span className="badge-gray uppercase">{post.locale}</span>
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    {post.date} · /blog/{post.slug}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => onEdit(post)}
                    className="btn-secondary gap-1.5 px-4 py-2 text-sm"
                  >
                    <Pencil className="h-4 w-4" /> Edit
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm(`Delete “${post.title}”? This cannot be undone.`)) {
                        deletePost({ id: post._id }).catch((err) =>
                          setError(cleanError(err))
                        );
                      }
                    }}
                    className="btn-danger gap-1.5 px-4 py-2 text-sm"
                  >
                    <Trash2 className="h-4 w-4" /> Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {importable.length > 0 && posts?.length > 0 ? (
          <p className="mt-4 text-xs text-slate-400">
            {importable.length} built-in starter post{importable.length > 1 ? "s" : ""}{" "}
            {importable.length > 1 ? "are" : "is"} not on the site yet — import them
            above to publish and edit them.
          </p>
        ) : null}
      </SectionCard>
    </div>
  );
}

/* ---------------------------------- Page ---------------------------------- */

export default function BlogManager({ builtIns }) {
  const me = useQuery(api.users.me);
  const posts = useQuery(api.blog.adminList);
  const [editing, setEditing] = useState(null); // null | form object

  if (me === undefined) {
    return (
      <div className="card">
        <LoadingRows rows={3} />
      </div>
    );
  }
  if (!me || me.role !== "admin") {
    return (
      <div className="card">
        <EmptyState title="Admins only" message="You don't have access to this page." />
      </div>
    );
  }

  if (editing) {
    return (
      <PostEditor
        key={editing.id ?? "new"}
        initial={editing}
        onBack={() => setEditing(null)}
      />
    );
  }

  return (
    <PostList
      posts={posts}
      builtIns={builtIns}
      onNew={() => setEditing({ ...EMPTY_POST, date: todayISO() })}
      onEdit={(post) =>
        setEditing({
          id: post._id,
          title: post.title,
          slug: post.slug,
          description: post.description,
          // Older posts are stored as markdown — upgrade them for the editor.
          content: looksLikeHtml(post.content)
            ? post.content
            : markdownToHtml(post.content),
          locale: post.locale,
          date: post.date,
          published: post.published,
        })
      }
    />
  );
}
