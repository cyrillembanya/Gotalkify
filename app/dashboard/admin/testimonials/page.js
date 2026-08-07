"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import Modal from "@/components/Modal";
import { cleanError } from "@/components/admin/helpers";
import {
  PageHeader,
  SectionCard,
  EmptyState,
  LoadingRows,
  ErrorBanner,
  Avatar,
} from "@/components/dashboard/ui";
import { Plus, Pencil, Trash2, Quote, ShieldAlert } from "lucide-react";

const EMPTY_FORM = { name: "", text: "", order: "0", published: false };

export default function AdminTestimonialsPage() {
  const me = useQuery(api.users.me);
  const isAdmin = !!me && me.role === "admin";
  const testimonials = useQuery(api.admin.allTestimonials, isAdmin ? {} : "skip");
  const saveTestimonial = useMutation(api.admin.saveTestimonial);
  const deleteTestimonial = useMutation(api.admin.deleteTestimonial);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [listError, setListError] = useState("");

  if (me === undefined) return <LoadingRows rows={3} />;
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

  function openNew() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError("");
    setModalOpen(true);
  }

  function openEdit(t) {
    setEditingId(t._id);
    setForm({
      name: t.name,
      text: t.text,
      order: String(t.order),
      published: !!t.published,
    });
    setError("");
    setModalOpen(true);
  }

  async function onSave(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await saveTestimonial({
        ...(editingId ? { testimonialId: editingId } : {}),
        name: form.name.trim(),
        text: form.text.trim(),
        published: form.published,
        order: Number(form.order),
      });
      setModalOpen(false);
    } catch (err) {
      setError(cleanError(err));
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(t) {
    if (!window.confirm(`Delete the testimonial by ${t.name}?`)) return;
    setListError("");
    try {
      await deleteTestimonial({ testimonialId: t._id });
    } catch (err) {
      setListError(cleanError(err));
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Testimonials"
        description="Curate the quotes shown on the marketing site."
      >
        <button className="btn-primary gap-1.5" onClick={openNew}>
          <Plus className="h-4 w-4" /> Add testimonial
        </button>
      </PageHeader>

      <ErrorBanner message={listError} onDismiss={() => setListError("")} />

      {testimonials === undefined ? (
        <div className="card">
          <LoadingRows rows={3} />
        </div>
      ) : testimonials.length === 0 ? (
        <div className="card">
          <EmptyState
            compact
            icon={Quote}
            title="No testimonials yet"
            message="Add the first one to start showing social proof on the marketing site."
          />
        </div>
      ) : (
        <div className="space-y-4">
          {testimonials.map((t) => (
            <SectionCard key={t._id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <span className="flex items-center gap-3">
                  <Avatar name={t.name} size="h-8 w-8 text-xs" />
                  <p className="font-bold text-slate-900">
                    {t.name}
                    <span className={`ml-2 ${t.published ? "badge-green" : "badge-gray"}`}>
                      {t.published ? "Published" : "Draft"}
                    </span>
                    <span className="badge-gray ml-2">Order {t.order}</span>
                  </p>
                </span>
                <div className="flex gap-2">
                  <button
                    className="btn-secondary gap-1.5 px-4 py-2 text-sm"
                    onClick={() => openEdit(t)}
                  >
                    <Pencil className="h-4 w-4" /> Edit
                  </button>
                  <button
                    className="btn-danger gap-1.5 px-4 py-2 text-sm"
                    onClick={() => onDelete(t)}
                  >
                    <Trash2 className="h-4 w-4" /> Delete
                  </button>
                </div>
              </div>
              <p className="mt-3 whitespace-pre-line text-sm text-slate-600">{t.text}</p>
            </SectionCard>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? "Edit testimonial" : "Add testimonial"}
      >
        <form onSubmit={onSave} className="space-y-4">
          <div>
            <label className="label" htmlFor="t-name">
              Name
            </label>
            <input
              id="t-name"
              className="input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="t-text">
              Text
            </label>
            <textarea
              id="t-text"
              className="input"
              rows={4}
              value={form.text}
              onChange={(e) => setForm({ ...form, text: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="t-order">
              Order (lower shows first)
            </label>
            <input
              id="t-order"
              className="input"
              type="number"
              step="1"
              value={form.order}
              onChange={(e) => setForm({ ...form, order: e.target.value })}
              required
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.published}
              onChange={(e) => setForm({ ...form, published: e.target.checked })}
            />
            Published (visible on the marketing site)
          </label>
          <ErrorBanner message={error} onDismiss={() => setError("")} />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
