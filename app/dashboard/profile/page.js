"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import StarRating from "@/components/StarRating";
import CountrySelect from "@/components/CountrySelect";
import {
  PageHeader,
  SectionCard,
  EmptyState,
  Skeleton,
  ErrorBanner,
  Avatar,
} from "@/components/dashboard/ui";
import { Lock, UploadCloud } from "lucide-react";

const MAX_VIDEO_BYTES = 210_000_000;

function cleanError(err) {
  return String(err?.message ?? err)
    .replace(/^.*Uncaught Error:\s*/, "")
    .split("\n")[0];
}

function approvalBadge(status) {
  if (status === "approved") return <span className="badge-green">Approved</span>;
  if (status === "rejected") return <span className="badge-red">Rejected</span>;
  return <span className="badge-yellow">Pending approval</span>;
}

export default function TutorProfilePage() {
  const me = useQuery(api.users.me);
  const updateMyProfile = useMutation(api.tutors.updateMyProfile);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);

  const [form, setForm] = useState(null);
  const [photoFile, setPhotoFile] = useState(null);
  const [videoFile, setVideoFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null); // { kind: "ok"|"err", text }
  const photoRef = useRef(null);
  const videoRef = useRef(null);

  useEffect(() => {
    if (form === null && me?.tutorProfile) {
      const p = me.tutorProfile;
      setForm({
        headline: p.headline ?? "",
        bio: p.bio ?? "",
        rateDollars: p.hourlyRateCents ? String(p.hourlyRateCents / 100) : "",
        specialties: (p.specialties ?? []).join(", "),
        nativeLanguages: (p.nativeLanguages ?? []).join(", "),
        nationality: p.nationality ?? "",
        currentLocation: p.currentLocation ?? "",
        languagesTaught: p.languagesTaught ?? [],
        qualifications: p.qualifications ?? "",
      });
    }
  }, [me, form]);

  if (me && me.role !== "tutor") {
    return (
      <div className="space-y-6">
        <PageHeader title="My profile" />
        <div className="card">
          <EmptyState
            compact
            icon={Lock}
            title="Tutors only"
            message="This page is for tutors only."
          />
        </div>
      </div>
    );
  }
  if (me === undefined || !me || !me.tutorProfile || form === null) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="My profile"
          description="What students see when they visit your tutor page."
        />
        <div className="card space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-10 w-1/3" />
        </div>
      </div>
    );
  }

  const profile = me.tutorProfile;

  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const toggleLanguage = (code) => {
    setForm((f) => ({
      ...f,
      languagesTaught: f.languagesTaught.includes(code)
        ? f.languagesTaught.filter((l) => l !== code)
        : [...f.languagesTaught, code],
    }));
  };

  const uploadFile = async (file) => {
    const url = await generateUploadUrl();
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": file.type },
      body: file,
    });
    if (!res.ok) throw new Error("Upload failed");
    const { storageId } = await res.json();
    return storageId;
  };

  const handleVideoChange = (e) => {
    const file = e.target.files?.[0] ?? null;
    if (file && file.size > MAX_VIDEO_BYTES) {
      setMessage({ kind: "err", text: "Video must be 200MB or smaller." });
      e.target.value = "";
      setVideoFile(null);
      return;
    }
    setVideoFile(file);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setMessage(null);

    const rate = Number(form.rateDollars);
    if (!Number.isFinite(rate) || rate < 5 || rate > 500) {
      setMessage({
        kind: "err",
        text: "Hourly rate must be between $5 and $500.",
      });
      return;
    }
    if (form.languagesTaught.length === 0) {
      setMessage({ kind: "err", text: "Select at least one language you teach." });
      return;
    }
    if (!form.nationality) {
      setMessage({ kind: "err", text: "Country of origin is required." });
      return;
    }
    if (!form.currentLocation) {
      setMessage({ kind: "err", text: "Please select where you currently live." });
      return;
    }

    setSaving(true);
    try {
      const args = {
        headline: form.headline.trim(),
        bio: form.bio.trim(),
        hourlyRateCents: Math.round(rate * 100),
        specialties: form.specialties
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        nativeLanguages: form.nativeLanguages
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        languagesTaught: form.languagesTaught,
        nationality: form.nationality,
        currentLocation: form.currentLocation,
        qualifications: form.qualifications.trim(),
      };
      if (photoFile) args.photoStorageId = await uploadFile(photoFile);
      if (videoFile) args.introVideoStorageId = await uploadFile(videoFile);
      await updateMyProfile(args);
      setPhotoFile(null);
      setVideoFile(null);
      if (photoRef.current) photoRef.current.value = "";
      if (videoRef.current) videoRef.current.value = "";
      setMessage({ kind: "ok", text: "Profile saved." });
    } catch (err) {
      setMessage({ kind: "err", text: cleanError(err) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="My profile"
        description="What students see when they visit your tutor page."
      >
        <span className="flex items-center gap-2">
          <StarRating value={profile.rating ?? 0} />
          <span className="text-sm text-slate-500">
            {profile.reviewCount ?? 0} review{(profile.reviewCount ?? 0) === 1 ? "" : "s"}
          </span>
        </span>
        {approvalBadge(profile.approvalStatus)}
      </PageHeader>

      <form onSubmit={handleSave} className="space-y-6">
        <SectionCard title="Public profile">
          <div className="space-y-4">
            <div>
              <label className="label">Headline</label>
              <input
                className="input"
                value={form.headline}
                onChange={(e) => setField("headline", e.target.value)}
                placeholder="e.g. Certified English teacher with 5 years of experience"
              />
            </div>

            <div>
              <label className="label">Bio</label>
              <textarea
                className="input"
                rows={6}
                value={form.bio}
                onChange={(e) => setField("bio", e.target.value)}
                placeholder="Tell students about yourself and your teaching style."
              />
            </div>

            <div>
              <label className="label">Hourly rate (USD)</label>
              <input
                className="input w-40"
                type="number"
                step="1"
                min="5"
                max="500"
                value={form.rateDollars}
                onChange={(e) => setField("rateDollars", e.target.value)}
                required
              />
            </div>

            <div>
              <label className="label">Languages taught</label>
              <div className="flex gap-6">
                <label className="flex items-center gap-2 py-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.languagesTaught.includes("en")}
                    onChange={() => toggleLanguage("en")}
                  />
                  English
                </label>
                <label className="flex items-center gap-2 py-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.languagesTaught.includes("fr")}
                    onChange={() => toggleLanguage("fr")}
                  />
                  French
                </label>
              </div>
            </div>

            <div>
              <label className="label">Native languages (comma-separated)</label>
              <input
                className="input"
                value={form.nativeLanguages}
                onChange={(e) => setField("nativeLanguages", e.target.value)}
                placeholder="e.g. English, Spanish"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="nationality">
                  Country of origin (nationality)
                </label>
                <CountrySelect
                  id="nationality"
                  required
                  value={form.nationality}
                  onChange={(e) => setField("nationality", e.target.value)}
                  placeholder="Select your country of origin"
                />
              </div>
              <div>
                <label className="label" htmlFor="currentLocation">
                  Where you currently live
                </label>
                <CountrySelect
                  id="currentLocation"
                  required
                  value={form.currentLocation}
                  onChange={(e) => setField("currentLocation", e.target.value)}
                  placeholder="Select the country you live in"
                />
              </div>
            </div>

            <div>
              <label className="label">Specialties (comma-separated)</label>
              <input
                className="input"
                value={form.specialties}
                onChange={(e) => setField("specialties", e.target.value)}
                placeholder="e.g. Business English, Exam prep, Conversation"
              />
            </div>

            <div>
              <label className="label">Qualifications</label>
              <textarea
                className="input"
                rows={3}
                value={form.qualifications}
                onChange={(e) => setField("qualifications", e.target.value)}
                placeholder="Certifications, degrees, teaching experience…"
              />
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Profile photo">
          <div className="flex flex-wrap items-center gap-5">
            {profile.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.photoUrl}
                alt="Current profile photo"
                className="h-24 w-24 rounded-full object-cover"
              />
            ) : (
              <Avatar name={me.name} size="h-24 w-24 text-2xl" />
            )}
            <input
              ref={photoRef}
              type="file"
              accept="image/*"
              className="block text-sm text-slate-600"
              onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
            />
          </div>
        </SectionCard>

        <SectionCard title="Intro video">
          <div className="space-y-4">
            {profile.introVideoUrl && (
              <video
                controls
                className="w-full rounded-lg"
                src={profile.introVideoUrl}
              />
            )}
            <label className="block cursor-pointer rounded-2xl border-2 border-dashed border-slate-200 p-8 text-center transition-colors hover:border-brand-300 hover:bg-slate-50">
              <UploadCloud
                className="mx-auto mb-3 h-8 w-8 text-slate-400"
                strokeWidth={1.75}
              />
              <p className="font-semibold text-slate-700">
                {videoFile
                  ? videoFile.name
                  : profile.introVideoUrl
                    ? "Replace your intro video"
                    : "Upload an intro video"}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                MP4 or WebM, max 200MB
              </p>
              <input
                ref={videoRef}
                type="file"
                accept="video/mp4,video/webm"
                className="sr-only"
                onChange={handleVideoChange}
              />
            </label>
          </div>
        </SectionCard>

        {message?.kind === "err" ? (
          <ErrorBanner message={message.text} onDismiss={() => setMessage(null)} />
        ) : message ? (
          <p className="text-sm font-medium text-green-600">{message.text}</p>
        ) : null}

        <button className="btn-primary" type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save profile"}
        </button>
      </form>
    </div>
  );
}
