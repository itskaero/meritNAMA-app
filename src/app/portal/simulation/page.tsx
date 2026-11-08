import Link from "next/link";
import { RUN_TONE } from "@/app/admin/processing/status";
import { Refresh } from "@/app/admin/processing/runs/[id]/refresh";
import { AreaPage } from "@/components/area-page";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { ConsentToggle } from "@/components/what-if/consent-toggle";
import { WhatIfRunForm } from "@/components/what-if/run-forms";
import { getSession } from "@/lib/auth/session";
import { publishedEstimates } from "@/lib/data/simulation";
import { selectClass } from "@/components/ui/styles";
import { Button } from "@/components/ui/button";
import { baseKey, getWhatIf, myWhatIfResult, myWhatIfRuns, parseBase, whatIfInductions, type WhatIfBase } from "@/lib/data/what-if";
import { checkDatabase, getDb } from "@/lib/db/client";
import { formatMarks, formatUtc, isUuid } from "@/lib/format";

export const metadata = { title: "Simulation" };
export const dynamic = "force-dynamic";

const href = (i: number, base: string, run?: string) => `/portal/simulation?i=${i}&base=${encodeURIComponent(base)}${run ? `&run=${run}` : ""}`;
const LIMIT = 300;
const FILTERS = [["program", "Programme"], ["quota", "Quota"], ["speciality", "Speciality"], ["hospital", "Hospital"]] as const;
type FKey = (typeof FILTERS)[number][0];

export default async function PortalSimulationPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const session = (await getSession())!;
  const page = (children: React.ReactNode) => (
    <AreaPage
      area="portal"
      trail={[{ label: "Simulation" }]}
      title="What if — simulate the next list"
      description="Start from a published or estimated merit list, change anyone's consent (yours or others'), and simulate the next list. Your changes are private to you; official consent is never changed. On a simulated list, consent counts as Awaited until you choose."
      status={<Badge tone="simulated" className="mx-2">Simulated — not official</Badge>}
    >
      {children}
    </AreaPage>
  );
  if ((await checkDatabase()) !== "ok") return page(<EmptyState title="Not available right now">The simulation data cannot be reached. Try again later.</EmptyState>);
  const db = getDb();
  const estimates = await publishedEstimates(db, session);
  // Inductions with a published round or a published estimate to start from.
  const inductions = (await whatIfInductions(db, session)).filter((x) => x.rounds.length || estimates.some((e) => e.induction === x.induction));
  if (!inductions.length) return page(<EmptyState title="Nothing to simulate yet">No merit list or estimated list has been published for an induction with simulation data.</EmptyState>);
  const ind = inductions.find((x) => String(x.induction) === sp.i) ?? inductions[0]!;
  const runs = await myWhatIfRuns(db, session, ind.induction);
  const indEstimates = estimates.filter((e) => e.induction === ind.induction);
  const latestEstimate = indEstimates.find((e) => !e.official) ?? indEstimates[0];
  const base: WhatIfBase = parseBase(sp.base)
    ?? (latestEstimate && (!ind.rounds.length || latestEstimate.roundNo > ind.rounds[ind.rounds.length - 1]!) ? { kind: "run", runId: latestEstimate.id } : { kind: "published", round: ind.rounds[ind.rounds.length - 1]! });
  const key = baseKey(base);
  const view = await getWhatIf(db, session, { induction: ind.induction, base });
  const back = href(ind.induction, key);
  const mine = view.rows.filter((r) => r.mine);
  // The whole list, filtered (GET), like the public site's estimate tables.
  const facets = Object.fromEntries(FILTERS.map(([k]) => [k, [...new Set(view.rows.map((r) => r[k]))].sort()])) as Record<FKey, string[]>;
  const filters = Object.fromEntries(FILTERS.map(([k]) => [k, facets[k].includes(sp[k] ?? "") ? sp[k]! : ""])) as Record<FKey, string>;
  const q = (sp.q ?? "").replace(/\D/g, "");
  const changedOnly = sp.show === "changed";
  const listRows = view.rows
    .filter((r) => FILTERS.every(([k]) => !filters[k] || r[k] === filters[k]) && (!q || r.applicantId.includes(q)) && (!changedOnly || r.changed))
    .sort((a, b) => a.program.localeCompare(b.program) || a.quota.localeCompare(b.quota) || a.speciality.localeCompare(b.speciality) || a.hospital.localeCompare(b.hospital) || b.mark - a.mark);
  const listFiltered = Object.values(filters).some(Boolean) || q || changedOnly;
  const backWithFilters = `${back}${FILTERS.map(([k]) => (filters[k] ? `&${k}=${encodeURIComponent(filters[k])}` : "")).join("")}${q ? `&q=${q}` : ""}${changedOnly ? "&show=changed" : ""}`;
  const selectedRun = sp.run && isUuid(sp.run) ? sp.run : runs.find((r) => (base.kind === "run" ? r.baseRunId === base.runId : r.fromRound === base.round && !r.baseRunId))?.id;
  const result = selectedRun ? await myWhatIfResult(db, session, selectedRun) : null;

  return page(
    <>
      <Card>
        <CardHeader title="Start from" description={`Induction ${ind.induction}. Published lists, or a list you simulated.`} />
        <div className="flex flex-wrap gap-2">
          {ind.rounds.map((r) => (
            <Link key={r} href={href(ind.induction, `published:${r}`)} className={cn("rounded-full px-3.5 py-1.5 text-sm ring-1 ring-line-strong", key === `published:${r}` ? "bg-ink text-canvas" : "text-muted hover:text-ink")}>
              Round {r}
            </Link>
          ))}
          {indEstimates.map((e) => (
            <Link key={e.id} href={href(ind.induction, `run:${e.id}`)} className={cn("rounded-full border border-dashed px-3.5 py-1.5 text-sm", key === `run:${e.id}` ? "border-amber bg-amber/15 text-amber" : "border-amber/60 text-amber hover:underline")}>
              Estimated round {e.roundNo}{e.official ? " (superseded)" : ""}
            </Link>
          ))}
          {runs.filter((r) => r.status === "done").slice(0, 6).map((r) => (
            <Link key={r.id} href={href(ind.induction, `run:${r.id}`)} className={cn("rounded-full border border-dashed px-3.5 py-1.5 text-sm", key === `run:${r.id}` ? "border-amber bg-amber/15 text-amber" : "border-amber/40 text-amber hover:underline")}>
              My simulation · round {r.fromRound! + 1} · {formatUtc(r.createdAt).slice(11)}
            </Link>
          ))}
        </div>
      </Card>

      {mine.length ? (
        <Card>
          <CardHeader title={`Your seats in ${base.kind === "published" ? `round ${view.roundNo}` : `simulated round ${view.roundNo}`}`} description="From your linked record." />
          <DataTable
            caption="Your allocations"
            rows={mine}
            rowKey={(r) => r.seatKey}
            columns={[
              { key: "seat", header: "Programme · quota · speciality · hospital", cell: (r) => `${r.program} · ${r.quota} · ${r.speciality} · ${r.hospital}` },
              { key: "pref", header: "Preference", align: "right", cell: (r) => (r.preferenceNo ? `#${r.preferenceNo}` : "—") },
              { key: "mark", header: "Mark", align: "right", tone: "mono", cell: (r) => formatMarks(r.mark) },
              { key: "sim", header: "Your simulated consent", cell: (r) => <ConsentToggle induction={ind.induction} base={key} back={back} applicantId={r.applicantId} seatKey={r.seatKey} official={r.official} simulated={r.simulated} changed={r.changed} /> },
            ]}
          />
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title={`${base.kind === "published" ? `Round ${view.roundNo}` : `Simulated round ${view.roundNo}`}: everyone's consent`}
          description={base.kind === "published"
            ? "Official consent is as fetched from the portal. Change anyone's (for example, assume the person above you rejects) and simulate the next round. Only you see your changes."
            : "This list is simulated, so consent counts as Awaited until you choose. Change anyone's and simulate the next round."}
          action={<Badge tone="simulated">What-if</Badge>}
        />
        <form method="get" className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-[repeat(4,minmax(0,1fr))_8rem_auto] xl:items-end">
          <input type="hidden" name="i" value={ind.induction} />
          <input type="hidden" name="base" value={key} />
          {FILTERS.map(([k, label]) => (
            <label key={k} className="grid gap-1.5 text-sm font-medium">{label}
              <select name={k} defaultValue={filters[k]} className={selectClass}>
                <option value="">All</option>
                {facets[k].map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
          ))}
          <label className="grid gap-1.5 text-sm font-medium">Applicant id
            <input name="q" inputMode="numeric" defaultValue={q} className={`${selectClass} font-mono`} />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="secondary">Filter</Button>
            {listFiltered ? <ButtonLink href={back} variant="ghost">Clear</ButtonLink> : null}
          </div>
        </form>
        <p className="mb-3 text-xs text-muted">
          {listRows.length.toLocaleString("en-US")} of {view.total.toLocaleString("en-US")} allocations shown{listRows.length > LIMIT ? ` (first ${LIMIT}; filter to narrow down)` : ""} ·{" "}
          {view.changes ? <Link href={`${back}&show=changed`} className="text-signal underline underline-offset-2">{view.changes} changed by you</Link> : "no changes yet"} · in your scenario{" "}
          {view.counts.Accepted.toLocaleString("en-US")} accepted, {view.counts.Rejected.toLocaleString("en-US")} rejected, {view.counts.Awaited.toLocaleString("en-US")} awaited.
        </p>
        <DataTable
          caption="Every allocation on this list, with simulated consent"
          rows={listRows.slice(0, LIMIT)}
          rowKey={(r) => `${r.applicantId}|${r.seatKey}`}
          columns={[
            { key: "id", header: "Applicant", tone: "mono", sort: (r) => Number(r.applicantId), cell: (r) => <>{r.applicantId}{r.mine ? <Badge tone="current" className="ml-2">you</Badge> : null}</> },
            { key: "mark", header: "Mark", align: "right", tone: "mono", sort: (r) => r.mark, cell: (r) => formatMarks(r.mark) },
            { key: "seat", header: "Programme · quota · speciality · hospital", sort: (r) => `${r.program} ${r.quota} ${r.speciality} ${r.hospital}`, cell: (r) => <span className="text-sm">{r.program} · {r.quota} · <span className="font-medium">{r.speciality}</span> · <span className="text-muted">{r.hospital}</span></span> },
            { key: "pref", header: "Pref.", align: "right", sort: (r) => r.preferenceNo, cell: (r) => (r.preferenceNo ? `#${r.preferenceNo}` : "—") },
            { key: "official", header: "Official", sort: (r) => r.official, cell: (r) => (base.kind === "published" ? r.official : "—") },
            { key: "sim", header: "Simulated consent", cell: (r) => <ConsentToggle induction={ind.induction} base={key} back={backWithFilters} applicantId={r.applicantId} seatKey={r.seatKey} official={r.official} simulated={r.simulated} changed={r.changed} /> },
          ]}
        />
        <div className="mt-4">
          <WhatIfRunForm induction={ind.induction} base={key} back={back} nextRound={view.roundNo + 1} changes={view.changes} />
        </div>
      </Card>

      {result ? (
        <Card>
          <CardHeader
            title={`Simulated round ${result.roundNo}`}
            description={`Started ${formatUtc(result.run.createdAt)} UTC · ${result.run.summary?.consentChanges ? `${result.run.summary.consentChanges} consent change${result.run.summary.consentChanges > 1 ? "s" : ""}` : "no consent changes"} · rules ${result.run.rulesOrigin}`}
            action={<Badge tone={RUN_TONE[result.run.status]}>{result.run.status}</Badge>}
          />
          {result.run.status === "queued" || result.run.status === "running" ? <Refresh /> : null}
          {result.run.status === "failed" ? <Notice tone="warning" title="The simulation failed">{result.run.error}</Notice> : null}
          {result.run.status === "done" ? (
            <div className="grid gap-4">
              {!view.applicantId ? (
                <Notice title={`Simulated round ${result.roundNo} is ready`}>
                  {result.placed.toLocaleString("en-US")} allocations. Open the full list to find any applicant; link your merit record under Merit profile to see your own place here.
                </Notice>
              ) : result.mySeats.length ? (
                <Notice title={`You would hold ${result.mySeats.length === 1 ? "a seat" : `${result.mySeats.length} seats`}`}>
                  {result.mySeats.map((m) => `${m.program} · ${m.quota} · ${m.speciality} · ${m.hospital} (preference #${m.preferenceNo})`).join("; ")}
                </Notice>
              ) : (
                <Notice tone="warning" title="You would not hold a seat">Under this scenario the simulation places you nowhere in round {result.roundNo}.</Notice>
              )}
              {result.preferences.length ? (
              <DataTable
                caption="Your preferences in the simulated round"
                rows={result.preferences}
                rowKey={(r) => `${r.program}-${r.preferenceNo}-${r.quota}`}
                columns={[
                  { key: "pref", header: "Preference", cell: (r) => `${r.program} #${r.preferenceNo}` },
                  { key: "seat", header: "Quota · speciality · hospital", cell: (r) => `${r.quota} · ${r.speciality} · ${r.hospital}` },
                  { key: "placed", header: "Placed", align: "right", cell: (r) => r.placed.toLocaleString("en-US") },
                  { key: "closing", header: "Closing", align: "right", tone: "mono", cell: (r) => (r.closing == null ? "—" : formatMarks(r.closing)) },
                  { key: "you", header: "", cell: (r) => (r.held ? <Badge tone="current">you</Badge> : null) },
                ]}
              />
              ) : null}
              <div className="flex flex-wrap gap-2">
                <ButtonLink href={`/portal/history/${ind.induction}/estimates/${result.run.id}`} size="sm">Open the full simulated list ({result.placed.toLocaleString("en-US")})</ButtonLink>
                <ButtonLink href={href(ind.induction, `run:${result.run.id}`)} variant="secondary" size="sm">Continue from simulated round {result.roundNo}</ButtonLink>
              </div>
            </div>
          ) : null}
        </Card>
      ) : null}
    </>,
  );
}
