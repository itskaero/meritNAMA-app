import { redirect } from "next/navigation";
import { Landing } from "@/components/landing/landing";
import { isStaff } from "@/lib/auth/roles";
import { getSession } from "@/lib/auth/session";
import { landingFigures } from "@/lib/data/public";
import { checkDatabase, getDb } from "@/lib/db/client";

export const metadata = {
  title: { absolute: "meritNAMA · where your score can take you" },
  description: "Merit lists, seats and a score finder for postgraduate inductions, with a community of candidates.",
};

/** Signed-in people go to their area; everyone else gets the public story page. */
export default async function Home() {
  const session = await getSession();
  if (session) redirect(isStaff(session) ? "/admin" : "/portal");
  const empty = { inductions: 0, rounds: 0, updatedAt: null, allocations: 0, seats: 0, hospitals: 0, specialities: 0, discussions: 0, policy: null, latest: null, sample: null };
  const figures = (await checkDatabase()) === "ok" ? await landingFigures(getDb()).catch(() => empty) : empty;
  return <Landing f={figures} />;
}
