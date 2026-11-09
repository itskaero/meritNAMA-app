import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/** The one public page for search engines: the homepage. Everything else needs an account. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = env().APP_URL.replace(/\/$/, "");
  return [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
  ];
}
