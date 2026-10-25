import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

// Fonts are downloaded at build time and served from this app — no runtime calls to Google.
const sans = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--mn-font-sans-loaded", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["500", "600"], variable: "--mn-font-mono-loaded", display: "swap" });

export const metadata: Metadata = {
  title: { default: "MeritNama", template: "%s · MeritNama" },
  description: "MeritNama application",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#07111f" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body
        style={{
          ["--mn-font-sans" as string]: `var(--mn-font-sans-loaded), ui-sans-serif, system-ui, sans-serif`,
          ["--mn-font-mono" as string]: `var(--mn-font-mono-loaded), ui-monospace, monospace`,
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
