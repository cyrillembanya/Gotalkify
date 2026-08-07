import { getSitePosts } from "./blog/posts";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://gotalkify.com";

export default async function sitemap() {
  const staticPages = [
    { path: "", priority: 1, changeFrequency: "weekly" },
    { path: "/tutors", priority: 0.9, changeFrequency: "daily" },
    { path: "/how-it-works", priority: 0.8, changeFrequency: "monthly" },
    { path: "/english-lessons", priority: 0.8, changeFrequency: "monthly" },
    { path: "/french-lessons", priority: 0.8, changeFrequency: "monthly" },
    { path: "/corporate-training", priority: 0.7, changeFrequency: "monthly" },
    { path: "/about", priority: 0.6, changeFrequency: "monthly" },
    { path: "/pricing", priority: 0.6, changeFrequency: "monthly" },
    { path: "/faqs", priority: 0.6, changeFrequency: "monthly" },
    { path: "/contact", priority: 0.5, changeFrequency: "yearly" },
    { path: "/apply", priority: 0.7, changeFrequency: "monthly" },
    { path: "/blog", priority: 0.7, changeFrequency: "weekly" },
    { path: "/privacy", priority: 0.2, changeFrequency: "yearly" },
    { path: "/terms", priority: 0.2, changeFrequency: "yearly" },
  ].map((page) => ({
    url: `${BASE_URL}${page.path}`,
    lastModified: new Date(),
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));

  const blogPages = (await getSitePosts()).map((post) => ({
    url: `${BASE_URL}/blog/${post.slug}`,
    lastModified: new Date(post.date),
    changeFrequency: "yearly",
    priority: 0.5,
  }));

  return [...staticPages, ...blogPages];
}
