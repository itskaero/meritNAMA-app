import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

// Read APP_URL at request time (it is set on the server, not at build).
export const dynamic = "force-dynamic";

/** Only the public homepage is for search engines; everything else needs an account. */
export default function robots(): MetadataRoute.Robots {
  const base = env().APP_URL.replace(/\/$/, "");
  return {
    rules: [{ userAgent: "*", allow: ["/$", "/images/"], disallow: ["/portal", "/admin", "/api", "/auth", "/dev", "/sign-in"] }],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
