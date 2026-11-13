import type { Metadata, Viewport } from "next";
import { env } from "@/lib/env";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { IBM_Plex_Mono, Inter, Noto_Nastaliq_Urdu } from "next/font/google";
import { parseTheme, THEME_COOKIE } from "@/lib/ui-mode";
import "./globals.css";

// Fonts are downloaded at build time and served from this app — no runtime calls to Google.
// v4: Inter everywhere (headings, figures, long text); Plex Mono only for applicant IDs, PMDC numbers
// and marks in tables; Noto Nastaliq Urdu only for the Urdu name (میرٹ نامہ), not preloaded.
const sans = Inter({ subsets: ["latin"], variable: "--mn-font-sans-loaded", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["500", "600"], variable: "--mn-font-mono-loaded", display: "swap" });
const urdu = Noto_Nastaliq_Urdu({ weight: ["600"], variable: "--mn-font-urdu-loaded", display: "swap", preload: false });

/**
 * Site-wide metadata. Built per request so APP_URL (e.g. https://meritnama.online) is
 * read at run time, not baked in at build: it makes canonical and social-preview URLs
 * absolute. Pages are not indexed by default; the public homepage opts in.
 */
export async function generateMetadata(): Promise<Metadata> {
  const base = new URL(env().APP_URL);
  return {
    metadataBase: base,
    title: { default: "meritNAMA", template: "%s · meritNAMA" },
    description: "Merit lists, seats and scoring for postgraduate inductions.",
    applicationName: "meritNAMA",
    robots: { index: false, follow: false },
    openGraph: {
      type: "website",
      siteName: "meritNAMA",
      locale: "en_PK",
      images: [{ url: "/images/brand/hero-library-study.jpg", width: 2400, height: 1018, alt: "A young doctor writing notes at a lamp-lit desk in an old arched library" }],
    },
    twitter: { card: "summary_large_image" },
  };
}

export const viewport: Viewport = { themeColor: "#0C0C0E" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Render per request, so the Content Security Policy's nonce (src/proxy.ts) reaches every page's scripts.
  await connection();
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html lang="en" data-theme={theme} className={`${sans.variable} ${mono.variable} ${urdu.variable}`}>
      <body
        style={{
          ["--mn-font-sans" as string]: `var(--mn-font-sans-loaded), ui-sans-serif, system-ui, sans-serif`,
          ["--mn-font-mono" as string]: `var(--mn-font-mono-loaded), ui-monospace, monospace`,
          ["--mn-font-serif" as string]: `var(--mn-font-sans-loaded), ui-sans-serif, system-ui, sans-serif`,
          ["--mn-font-display" as string]: `var(--mn-font-sans-loaded), ui-sans-serif, system-ui, sans-serif`,
          ["--mn-font-urdu" as string]: `var(--mn-font-urdu-loaded), "Noto Nastaliq Urdu", serif`,
        }}
      >
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-signal focus:px-4 focus:py-2 focus:text-signal-ink">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
