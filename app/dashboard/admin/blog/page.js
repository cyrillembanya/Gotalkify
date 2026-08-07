import { getAllPosts } from "@/app/blog/posts";
import BlogManager from "./manager";

/**
 * Server wrapper: reads the built-in content/blog/*.mdx posts so the client
 * manager can offer a one-click import into the database.
 */
export default function AdminBlogPage() {
  return <BlogManager builtIns={getAllPosts()} />;
}
