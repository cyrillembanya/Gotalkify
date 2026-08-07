import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";

const BLOG_DIR = path.join(process.cwd(), "content", "blog");

/** All blog posts (frontmatter + slug), newest first. */
export function getAllPosts() {
  if (!fs.existsSync(BLOG_DIR)) return [];
  return fs
    .readdirSync(BLOG_DIR)
    .filter((file) => file.endsWith(".mdx"))
    .map((file) => {
      const slug = file.replace(/\.mdx$/, "");
      const raw = fs.readFileSync(path.join(BLOG_DIR, file), "utf8");
      const { data, content } = matter(raw);
      return {
        slug,
        title: data.title ?? slug,
        description: data.description ?? "",
        date: data.date ?? "1970-01-01",
        locale: data.locale ?? "en",
        content,
      };
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

/** A single post by slug, or null. */
export function getPost(slug) {
  const file = path.join(BLOG_DIR, `${slug}.mdx`);
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, "utf8");
  const { data, content } = matter(raw);
  return {
    slug,
    title: data.title ?? slug,
    description: data.description ?? "",
    date: data.date ?? "1970-01-01",
    locale: data.locale ?? "en",
    content,
  };
}

/**
 * Posts shown on the public site: admin-authored posts from Convex, plus
 * built-in file posts whose slug the admin hasn't overridden. Falls back to
 * the files alone if Convex is unreachable.
 */
export async function getSitePosts() {
  let db = { posts: [], slugs: [] };
  try {
    db = await fetchQuery(api.blog.listForSite);
  } catch {
    // Convex unreachable — built-in posts only
  }
  const overridden = new Set(db.slugs);
  const filePosts = getAllPosts().filter((post) => !overridden.has(post.slug));
  return [...db.posts, ...filePosts].sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : 0
  );
}

/**
 * A single post for the public site, or null. A stored draft hides the
 * built-in file post with the same slug.
 */
export async function getSitePost(slug) {
  try {
    const post = await fetchQuery(api.blog.getBySlug, { slug });
    if (post?.hidden) return null;
    if (post) return post;
  } catch {
    // Convex unreachable — try the built-in file
  }
  return getPost(slug);
}

export function fmtPostDate(date, locale = "en") {
  try {
    return new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(date));
  } catch {
    return date;
  }
}
