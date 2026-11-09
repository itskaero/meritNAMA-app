import { redirect } from "next/navigation";
import { Landing } from "@/components/landing/landing";
import { isStaff } from "@/lib/auth/roles";
import { getSession } from "@/lib/auth/session";
import { landingCheck, landingFigures, landingTracks } from "@/lib/data/public";
import { checkDatabase, getDb } from "@/lib/db/client";
import { loadFeatures } from "@/lib/data/settings";

export const metadata = {
  title: { absolute: "meritNAMA · where your merit can take you" },
  description: "Closing merit, seats and every published merit round for PHF postgraduate inductions, with a free marks check and a score finder. Independent; not an official admissions authority.",
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: {
    url: "/",
    title: "meritNAMA · where your merit can take you",
    description: "Closing merit, seats and every published merit round for PHF postgraduate inductions, from the published record.",
    // Repeated here: a page's openGraph replaces the layout's rather than merging.
    images: [{ url: "/images/brand/hero-library-study.jpg", width: 2400, height: 1018, alt: "A young doctor writing notes at a lamp-lit desk in an old arched library" }],
  },
};

/** Signed-in people go to their area; everyone else gets the public story page. */
export default async function Home({ searchParams }: { searchParams: Promise<{ marks?: string; track?: string }> }) {
  const session = await getSession();
  if (session) redirect(isStaff(session) ? "/admin" : "/portal");
  const empty = { inductions: 0, rounds: 0, updatedAt: null, allocations: 0, seats: 0, hospitals: 0, specialities: 0, discussions: 0, policy: null, latest: null, sample: null };
  const up = (await checkDatabase()) === "ok";
  const figures = up ? await landingFigures(getDb()).catch(() => empty) : empty;
  // Switched-off features are not advertised. Without a database, show everything.
  const allOn = { community: true, calculator: true, planner: true, simulation: true };
  const features = up ? await loadFeatures(getDb()).catch(() => allOn) : allOn;
  // The hero's "check your marks" box: a GET form, answered on the server with counts only.
  const sp = await searchParams;
  const [tracks, check] = up
    ? await Promise.all([landingTracks(getDb()).catch(() => null), landingCheck(getDb(), { marks: typeof sp.marks === "string" ? sp.marks : undefined, track: typeof sp.track === "string" ? sp.track : undefined }).catch(() => ({ ok: false as const, message: "That did not work. Try again." }))])
    : [null, null];
  return <Landing f={figures} features={features} tracks={tracks} check={check} query={{ marks: typeof sp.marks === "string" ? sp.marks : "", track: typeof sp.track === "string" ? sp.track : "" }} />;
}
