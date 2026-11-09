import Link from "next/link";
import { AreaPage } from "@/components/area-page";
import { Icon, type IconName } from "@/components/icon";
import { Card, CardHeader } from "@/components/ui/card";
import { findSection } from "@/lib/navigation";

export const metadata = { title: "Help" };

const STEPS = [
  ["You apply", "On the PHF portal you choose your programme (FCPS, MS, MD, MDS), quota and an ordered list of preferences: speciality + hospital."],
  ["The gazette", "PHF publishes every eligible candidate with their merit marks. meritNAMA can estimate round 1 from it before PHF's list."],
  ["Round 1 list", "Each seat goes to the highest marks among those who want it, in preference order. The lowest marks placed in a seat is its closing merit."],
  ["Consent", "Everyone on the list accepts or rejects within a few days. Rejected and unanswered seats become free."],
  ["Later rounds", "Free seats go to the next people in line, so closing merit usually falls a little each round, until the final list."],
] as const;

const WANTS: { q: string; a: string; href: string; link: string; icon: IconName }[] = [
  { q: "…find myself in a merit list", a: "Type your applicant ID. You see your seat, marks and consent in every round, and who else holds the same seat.", href: "/portal/history/find", link: "Find yourself", icon: "search" },
  { q: "…know where my marks can get a seat", a: "Enter your marks. Every speciality and hospital is marked safe, borderline or out of reach against past closing merit.", href: "/portal/finder", link: "My chances", icon: "target" },
  { q: "…work out my marks", a: "Enter your degree, house job and other details; the calculator follows the published scoring policy.", href: "/portal/calculator", link: "Calculate my marks", icon: "calculator" },
  { q: "…see what happens if someone rejects", a: "Start from the latest list, change anyone's consent (yours or others'), and simulate the next list. Only you see your changes.", href: "/portal/simulation", link: "What if", icon: "pulse" },
  { q: "…see the estimated list before PHF's", a: "When an estimate is published it appears at the top of Merit lists, marked Estimate. It is not official.", href: "/portal/history", link: "Merit lists", icon: "trend" },
  { q: "…check a hospital", a: "Seats by programme and quota, closing merit by round, CPSP accreditation and reviews from trainees.", href: "/portal/explore", link: "Hospitals", icon: "building" },
  { q: "…put my preferences in order", a: "Make a preference list from the seats you saved and check each option against closing merit.", href: "/portal/preferences", link: "My preference list", icon: "list" },
  { q: "…ask someone", a: "Ask a question, or talk in the chat room of each round. Linking your merit record lets you post.", href: "/portal/community", link: "Ask & chat", icon: "chat" },
];

const TERMS: [string, string][] = [
  ["Applicant ID", "Your number on the PHF portal. Merit lists show it next to each name; meritNAMA shows only the number, never names."],
  ["Merit (marks)", "Your total score under the scoring policy: degree, house job, experience, FCPS Part-I and so on, out of 30 or 35 depending on the year."],
  ["Programme", "FCPS, MS, MD, MDS or FCPS Dentistry. Each has its own seats and its own lists."],
  ["Quota", "Punjab, Armed Forces, Foreign and so on. Seats are reserved per quota, so closing merit differs between quotas."],
  ["Seat group", "One programme, quota, speciality and hospital together: what a seat is in the lists."],
  ["Closing merit", "The lowest marks that got a seat in a seat group in a round. If your marks are above it, you would have got that seat in that round."],
  ["Round", "One published merit list. An induction has several; each fills the seats freed in the one before."],
  ["Consent", "Your reply to a seat: Accepted (you keep it), Rejected (it goes to the next person) or Awaited (no reply yet)."],
  ["Gazette", "PHF's list of eligible candidates with their marks, published before round 1."],
  ["Estimate", "A list meritNAMA simulated, not one PHF published. Always marked Estimate, with a dashed amber border."],
  ["Official / Calculated", "Official: published by PHF. Calculated: worked out by meritNAMA from published lists (for example closing merit)."],
  ["Verified record", "Your account linked to your applicant ID, so the app can show your own seats and you can post."],
];

/** A plain-language guide: the process in five steps, "I want to…" answers, and the terms. */
export default function GuidePage() {
  const s = findSection("/portal/guide");
  return (
    <AreaPage area="portal" trail={[{ label: s.label }]} title="How it works" description="The induction process in five steps, where to do what, and what each word means. meritNAMA is independent; PHF's portal is the official source.">
      <Card>
        <CardHeader title="The induction in five steps" />
        <ol className="grid gap-3 md:grid-cols-5">
          {STEPS.map(([t, body], i) => (
            <li key={t} className="grid content-start gap-2 rounded-lg border border-line p-4">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-teal text-sm font-bold text-white">{i + 1}</span>
              <span className="font-semibold text-heading">{t}</span>
              <span className="text-sm text-muted">{body}</span>
            </li>
          ))}
        </ol>
      </Card>

      <Card>
        <CardHeader title="I want to…" />
        <ul className="grid gap-3 md:grid-cols-2">
          {WANTS.map((w) => (
            <li key={w.q} className="flex gap-3 rounded-lg border border-line p-4">
              <span className="grid h-10 w-10 flex-none place-items-center rounded-lg bg-tint text-signal"><Icon name={w.icon} className="h-5 w-5" /></span>
              <span className="grid gap-1">
                <span className="font-semibold text-heading">I want to {w.q.replace(/^…/, "")}</span>
                <span className="text-sm text-muted">{w.a}</span>
                <Link href={w.href} className="text-sm font-semibold text-signal underline underline-offset-2">{w.link} →</Link>
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardHeader title="What the words mean" />
        <dl className="grid gap-x-8 gap-y-4 md:grid-cols-2">
          {TERMS.map(([t, d]) => (
            <div key={t} className="border-t border-line pt-3">
              <dt className="font-semibold text-heading">{t}</dt>
              <dd className="mt-1 text-sm text-muted">{d}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </AreaPage>
  );
}
