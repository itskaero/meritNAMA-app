import Link from "next/link";
import { AreaPage } from "@/components/area-page";
import { whenDatabaseDown } from "@/components/database-unavailable";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { getSession } from "@/lib/auth/session";
import { verifiedApplicant } from "@/lib/data/candidates";
import { findApplicant } from "@/lib/data/merit";
import { gazetteForApplicant, searchByName } from "@/lib/data/lists";
import { StatusBadge } from "@/components/merit-lists";
import { ensureUser } from "@/lib/data/users";
import { getDb } from "@/lib/db/client";
import { formatMarks } from "@/lib/format";

export const metadata = { title: "Find yourself" };
export const dynamic = "force-dynamic";

/**
 * "I want to find myself", as on the old site: type an applicant id (or a name, to pick
 * the applicant) and see them in the gazette and every published list, their seat's
 * closing merit, published estimates, and who else holds the same seats.
 */
export default async function FindPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const frame = {
    area: "portal" as const,
    trail: [{ label: "Merit lists", href: "/portal/history" }, { label: "Find yourself" }],
    title: "Find yourself, or anyone",
    description: "Type an applicant ID or a name to see that person in the gazette and every merit list: their seat, marks, consent and the seat's closing merit.",
  };
  const down = await whenDatabaseDown(frame);
  if (down) return down;
  const db = getDb();
  const session = await getSession();
  const mine = session ? await verifiedApplicant(db, (await ensureUser(db, session)).id) : null;
  const sp = await searchParams;
  const typed = (sp.id ?? "").trim().slice(0, 60);
  const byName = typed !== "" && /\p{L}/u.test(typed);
  const id = byName ? "" : typed.replace(/\D/g, "");
  const [found, gazette, matches] = await Promise.all([
    id ? findApplicant(db, session, id) : Promise.resolve(null),
    id ? gazetteForApplicant(db, session, id) : Promise.resolve([]),
    byName ? searchByName(db, session, typed) : Promise.resolve([]),
  ]);
  const name = found?.name ?? gazette.find((g) => g.name)?.name ?? null;
  const latest = found?.rounds[0] ?? null;
  const latestSeats = found && latest ? found.rounds.filter((r) => r.induction === latest.induction && r.roundNo === latest.roundNo) : [];
  const isMe = Boolean(mine && id === mine);

  return (
    <AreaPage {...frame}>
      <Card>
        <form method="get" className="grid gap-3 sm:grid-cols-[minmax(0,22rem)_auto_auto] sm:items-end">
          <label className="grid gap-1.5">
            <span className="text-base font-semibold text-heading">Applicant ID or name</span>
            <input name="id" autoComplete="off" defaultValue={typed} placeholder="e.g. 27267 or Ayesha Khan" className="h-12 rounded-lg border border-line-strong bg-surface px-4 text-lg text-ink placeholder:text-subtle" />
          </label>
          <Button type="submit" className="h-12 px-6 text-base">Find</Button>
          {mine && !isMe ? <ButtonLink href={`/portal/history/find?id=${mine}`} variant="secondary" className="h-12">Use my ID ({mine})</ButtonLink> : null}
        </form>
        <p className="mt-3 text-sm text-muted">Your applicant ID is on your page on the PHF portal and next to your name in every merit list.</p>
      </Card>

      {byName ? (
        matches.length ? (
          <Card>
            <CardHeader title={`Names matching “${typed}”`} description={matches.length === 30 ? "The first 30; type more of the name to narrow down." : "Select the right person."} />
            <ul className="grid gap-2 sm:grid-cols-2">
              {matches.map((m) => (
                <li key={m.applicantId}>
                  <Link href={`/portal/history/find?id=${m.applicantId}`} className="block rounded-lg border border-line px-3 py-2 hover:bg-hover">
                    <span className="font-semibold text-heading">{m.name}</span>
                    <span className="block font-mono text-xs text-muted">{m.applicantId} · induction {m.inductions.join(", ")}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ) : <EmptyState title={`No name matches “${typed}”`}>Type at least three letters of the name as PHF prints it, or the applicant ID.</EmptyState>
      ) : null}

      {id && found && found.rounds.length === 0 && found.estimates.length === 0 && gazette.length === 0 ? (
        <EmptyState title={`No list has applicant ${id}`}>Check the number. A candidate who was never allocated a seat does not appear in merit lists.</EmptyState>
      ) : null}

      {gazette.length ? (
        <Card>
          <CardHeader title={`${name ?? `Applicant ${id}`} in the gazette`} description="Merit marks and status as PHF published them before round 1." />
          <ul className="grid gap-2">
            {gazette.map((g) => (
              <li key={g.induction} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line px-3 py-2 text-sm">
                <span>
                  <Link href={`/portal/history/${g.induction}/gazette?q=${id}`} className="font-semibold text-heading hover:underline">Induction {g.induction}</Link>
                  <span className="block text-muted">Marks <strong className="font-mono text-ink">{formatMarks(g.marksTotal)}</strong> · place {g.rank.toLocaleString("en-US")} by marks</span>
                </span>
                <StatusBadge value={g.status} />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {latest ? (
        <section aria-labelledby="latest" className="rounded-xl bg-feature p-6 text-feature-ink shadow-[var(--mn-shadow-2)] sm:p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-feature-accent">{isMe ? "You" : name ? `${name} · ${id}` : `Applicant ${id}`} · latest list</p>
          <h2 id="latest" className="mt-2 font-serif text-2xl font-semibold sm:text-3xl">Induction {latest.induction}, round {latest.roundNo}</h2>
          <ul className="mt-4 grid gap-3">
            {latestSeats.map((s) => (
              <li key={`${s.program}|${s.quota}`} className="grid gap-1 rounded-lg bg-white/10 p-4">
                <p className="text-lg font-semibold">{s.speciality} · {s.hospital}</p>
                <p className="text-sm text-feature-muted">{s.program} · {s.quota} · preference #{s.preferenceNo} · consent: {s.consent || "—"}</p>
                <p className="text-sm">
                  Marks <strong className="font-mono">{formatMarks(s.marks)}</strong> · seat closed at <strong className="font-mono">{formatMarks(s.closing)}</strong>
                  {s.marks - s.closing > 0.005 ? <> · <strong className="font-semibold">{formatMarks(s.marks - s.closing)} above the closing merit</strong></> : <> · <strong className="font-semibold">the last person in this seat</strong></>}
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm">
            <Link href={`/portal/history/${latest.induction}/rounds/${latest.roundNo}`} className="font-semibold text-feature-accent underline underline-offset-2">Open round {latest.roundNo}</Link>
            {" · "}
            <Link href={`/portal/simulation?i=${latest.induction}&base=${encodeURIComponent(`published:${latest.roundNo}`)}`} className="font-semibold text-feature-accent underline underline-offset-2">What if someone rejects?</Link>
          </p>
        </section>
      ) : null}

      {found && found.estimates.length ? (
        <Card className="border-dashed border-amber/50">
          <CardHeader title="In published estimates" description="Where the estimated lists place this applicant. Not official." action={<Badge tone="simulated">Estimate</Badge>} />
          <ul className="grid gap-2 text-sm">
            {found.estimates.map((e) => (
              <li key={`${e.runId}|${e.program}|${e.quota}`} className="rounded-lg border border-dashed border-amber/50 px-3 py-2">
                <Link href={`/portal/history/${e.induction}/estimates/${e.runId}?q=${id}`} className="font-semibold text-heading hover:underline">Induction {e.induction}, estimated round {e.roundNo}</Link>
                <span className="block text-muted">{e.speciality} · {e.hospital} · {e.program} · {e.quota} · preference #{e.preferenceNo} · marks {formatMarks(e.mark)}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {found && found.rounds.length ? (
        <Card>
          <CardHeader title="Every list" description={`${found.rounds.length} allocation${found.rounds.length === 1 ? "" : "s"} across all published rounds, newest first.`} />
          <DataTable
            caption={`Applicant ${id} in every published round`}
            rows={found.rounds}
            rowKey={(r) => `${r.induction}|${r.roundNo}|${r.program}|${r.quota}`}
            columns={[
              { key: "r", header: "List", sort: (r) => r.induction * 100 + r.roundNo, cell: (r) => <Link href={`/portal/history/${r.induction}/rounds/${r.roundNo}`} className="font-medium text-signal hover:underline">Induction {r.induction} · round {r.roundNo}</Link> },
              { key: "s", header: "Seat", sort: (r) => `${r.speciality} ${r.hospital}`, cell: (r) => <><span className="font-medium">{r.speciality}</span><span className="block text-xs text-muted">{r.hospital} · {r.program} · {r.quota}</span></> },
              { key: "p", header: "Pref.", align: "right", sort: (r) => r.preferenceNo, cell: (r) => `#${r.preferenceNo}` },
              { key: "m", header: "Marks", align: "right", tone: "mono", sort: (r) => r.marks, cell: (r) => formatMarks(r.marks) },
              { key: "c", header: "Closing", align: "right", tone: "mono", sort: (r) => r.closing, cell: (r) => formatMarks(r.closing) },
              { key: "k", header: "Consent", sort: (r) => r.consent, cell: (r) => r.consent || "—" },
            ]}
          />
        </Card>
      ) : null}

      {found && found.neighbours.length ? (
        <Card>
          <CardHeader title="Who else holds the same seat" description={`Everyone in ${latest ? `round ${latest.roundNo}` : "the latest round"} in the same programme, quota, speciality and hospital, by marks.`} />
          <div className="grid gap-5 lg:grid-cols-2">
            {found.neighbours.map((g) => (
              <div key={`${g.program}|${g.quota}|${g.speciality}|${g.hospital}`} className="min-w-0">
                <p className="mb-2 text-sm font-semibold text-heading">{g.speciality} · {g.hospital} <span className="font-normal text-muted">({g.program} · {g.quota})</span></p>
                <DataTable
                  caption={`Everyone in ${g.speciality} at ${g.hospital}`}
                  rows={g.people}
                  rowKey={(p) => p.applicantId}
                  columns={[
                    { key: "id", header: "Candidate", sort: (p) => p.name ?? p.applicantId, cell: (p) => <Link href={`/portal/history/find?id=${p.applicantId}`} className={p.applicantId === id ? "font-bold text-signal-strong" : "text-signal hover:underline"}>{p.name ?? p.applicantId}<span className="block font-mono text-xs text-muted">{p.applicantId}{p.applicantId === id ? " ←" : ""}</span></Link> },
                    { key: "m", header: "Marks", align: "right", tone: "mono", sort: (p) => p.marks, cell: (p) => formatMarks(p.marks) },
                    { key: "p", header: "Pref.", align: "right", sort: (p) => p.preferenceNo, cell: (p) => `#${p.preferenceNo}` },
                    { key: "c", header: "Consent", sort: (p) => p.consent, cell: (p) => p.consent || "—" },
                  ]}
                />
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </AreaPage>
  );
}
