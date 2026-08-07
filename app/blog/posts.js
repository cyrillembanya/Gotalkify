import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";

const BLOG_DIR = path.join(process.cwd(), "content", "blog");

/** Built-in starter posts — used only by the admin panel's import button. */
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

/**
 * Published posts for the public site — the database is the single source
 * of truth. The content/blog files are only import material for the admin
 * panel, never served directly.
 */
export async function getSitePosts() {
  try {
    return await fetchQuery(api.blog.listForSite);
  } catch {
    return []; // Convex unreachable
  }
}

/** A single published post for the public site, or null. */
export async function getSitePost(slug) {
  try {
    return await fetchQuery(api.blog.getBySlug, { slug });
  } catch {
    return null; // Convex unreachable
  }
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
