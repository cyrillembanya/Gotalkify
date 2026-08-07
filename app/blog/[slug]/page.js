import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { getSitePost, fmtPostDate } from "../posts";
import Markdown, { proseClass } from "@/components/marketing/Markdown";
import CTABanner from "@/components/marketing/CTABanner";

const loadPost = cache(getSitePost);

export async function generateMetadata({ params }) {
  const post = await loadPost(params.slug);
  if (!post) return {};
  return {
    title: post.title,
    description: post.description,
    openGraph: { title: post.title, description: post.description, type: "article" },
  };
}

export default async function BlogPostPage({ params }) {
  const post = await loadPost(params.slug);
  if (!post) notFound();

  const t = await getTranslations("blogPage");
  const tHome = await getTranslations("home");
  const locale = await getLocale();

  return (
    <>
      <article className="container-page py-16">
        <div className="mx-auto max-w-3xl">
          <Link
            href="/blog"
            className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            ← {t("back")}
          </Link>
          <p className="mt-8 text-sm font-medium uppercase tracking-wide text-brand-600">
            {fmtPostDate(post.date, locale)}
          </p>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
            {post.title}
          </h1>
          <p className="mt-4 text-lg leading-7 text-slate-600">{post.description}</p>

          <div className={`mt-10 border-t border-slate-100 pt-10 ${proseClass}`}>
            <Markdown content={post.content} />
          </div>
        </div>
      </article>

      <CTABanner
        title={tHome("ctaTitle")}
        subtitle={tHome("ctaSubtitle")}
        buttonLabel={tHome("ctaButton")}
        href="/tutors"
      />
    </>
  );
}
