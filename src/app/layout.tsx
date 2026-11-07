import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { Archivo, IBM_Plex_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

// Fonts are downloaded at build time and served from this app — no runtime calls to Google.
const sans = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--mn-font-sans-loaded", display: "swap" });
// Wide display face for the wordmark and large headings (width axis for font-stretch 125%).
const display = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--mn-font-display-loaded", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["500", "600"], variable: "--mn-font-mono-loaded", display: "swap" });

export const metadata: Metadata = {
  title: { default: "meritNAMA", template: "%s · meritNAMA" },
  description: "Merit lists, seats and scoring for postgraduate inductions.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#0b0b0c" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Render per request, so the Content Security Policy's nonce (src/proxy.ts) reaches every page's scripts.
  await connection();
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${display.variable}`}>
      <body
        style={{
          ["--mn-font-sans" as string]: `var(--mn-font-sans-loaded), ui-sans-serif, system-ui, sans-serif`,
          ["--mn-font-mono" as string]: `var(--mn-font-mono-loaded), ui-monospace, monospace`,
          ["--mn-font-display" as string]: `var(--mn-font-display-loaded), "Arial Black", sans-serif`,
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
