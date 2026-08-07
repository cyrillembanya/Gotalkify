import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { getSitePosts, fmtPostDate } from "./posts";

export async function generateMetadata() {
  const t = await getTranslations("blogPage");
  return { title: t("metaTitle"), description: t("metaDescription") };
}

export default async function BlogPage() {
  const t = await getTranslations("blogPage");
  const locale = await getLocale();
  const posts = await getSitePosts();

  return (
    <>
      <section className="bg-gradient-to-b from-slate-100 to-slate-50">
        <div className="container-page py-16 text-center">
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
            {t("title")}
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">{t("subtitle")}</p>
        </div>
      </section>

      <section className="container-page pb-20">
        {posts.length === 0 ? (
          <p className="text-center text-slate-500">{t("empty")}</p>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => (
              <article key={post.slug} className="card group flex flex-col">
                <p className="text-xs font-medium uppercase tracking-wide text-brand-600">
                  {fmtPostDate(post.date, locale)}
                </p>
                <h2 className="mt-3 text-lg font-bold text-slate-900">
                  <Link
                    href={`/blog/${post.slug}`}
                    className="transition-colors group-hover:text-brand-700"
                  >
                    {post.title}
                  </Link>
                </h2>
                <p className="mt-3 flex-1 text-sm leading-6 text-slate-600">
                  {post.description}
                </p>
                <Link
                  href={`/blog/${post.slug}`}
                  className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700"
                >
                  {t("readMore")} →
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
