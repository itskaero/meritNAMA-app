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
import { verifiedApplicant } from "@/lib/data/candidates";
import { ensureUser } from "@/lib/data/users";
import { baseKey, getWhatIf, myWhatIfResult, myWhatIfRuns, parseBase, whatIfInductions, type WhatIfBase } from "@/lib/data/what-if";
import { checkDatabase, getDb } from "@/lib/db/client";
import { formatMarks, formatUtc, isUuid } from "@/lib/format";

export const metadata = { title: "Simulation" };
export const dynamic = "force-dynamic";

const href = (i: number, base: string, run?: string) => `/portal/simulation?i=${i}&base=${encodeURIComponent(base)}${run ? `&run=${run}` : ""}`;

export default async function PortalSimulationPage({ searchParams }: { searchParams: Promise<{ i?: string; base?: string; run?: string }> }) {
  const sp = await searchParams;
  const session = (await getSession())!;
  const page = (children: React.ReactNode) => (
    <AreaPage
      area="portal"
      trail={[{ label: "Simulation" }]}
      title="What if — simulate the next list"
      description="Start from a published merit list, choose your consent on your own seats, and see where the next list might place you. Everyone else's consent is as published; on a simulated list, it counts as Awaited."
      status={<Badge tone="simulated" className="mx-2">Simulated — not official</Badge>}
    >
      {children}
    </AreaPage>
  );
  if ((await checkDatabase()) !== "ok") return page(<EmptyState title="Not available right now">The simulation data cannot be reached. Try again later.</EmptyState>);
  const db = getDb();
  const me = await ensureUser(db, session);
  if (!(await verifiedApplicant(db, me.id)) && session.role === "candidate") {
    return page(
      <Notice title="Link your merit record first">
        What-if simulations work on your own allocations. Verify your record under <Link href="/portal/profile" className="font-semibold text-signal underline-offset-4 hover:underline">Merit profile</Link>, then come back.
      </Notice>,
    );
  }

  const inductions = (await whatIfInductions(db, session)).filter((x) => x.rounds.length);
  if (!inductions.length) return page(<EmptyState title="No simulation data yet">An administrator has not imported an induction&apos;s simulation data yet.</EmptyState>);
  const ind = inductions.find((x) => String(x.induction) === sp.i) ?? inductions[0]!;
  const runs = await myWhatIfRuns(db, session, ind.induction);
  const base: WhatIfBase = parseBase(sp.base) ?? { kind: "published", round: ind.rounds[ind.rounds.length - 1]! };
  const key = baseKey(base);
  const view = await getWhatIf(db, session, { induction: ind.induction, base });
  const back = href(ind.induction, key);
  // The portal shows only the person's own seats, staff included (the admin workspace has the full list).
  const mine = view.rows.filter((r) => r.mine);
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
          {runs.filter((r) => r.status === "done").slice(0, 6).map((r) => (
            <Link key={r.id} href={href(ind.induction, `run:${r.id}`)} className={cn("rounded-full border border-dashed px-3.5 py-1.5 text-sm", key === `run:${r.id}` ? "border-amber bg-amber/15 text-amber" : "border-amber/40 text-amber hover:underline")}>
              Simulated round {r.fromRound! + 1} · {formatUtc(r.createdAt).slice(11)}
            </Link>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader
          title={`Your seats in ${base.kind === "published" ? `round ${view.roundNo}` : `simulated round ${view.roundNo}`}`}
          description={base.kind === "published" ? "Official consent is as fetched from the portal. Change yours to see what would follow; the official consent is never changed." : "This list is simulated, so consent counts as Awaited until you choose."}
        />
        {mine.length ? (
          <DataTable
            caption="Your allocations"
            rows={mine}
            rowKey={(r) => r.seatKey}
            columns={[
              { key: "seat", header: "Programme · quota · speciality · hospital", cell: (r) => `${r.program} · ${r.quota} · ${r.speciality} · ${r.hospital}` },
              { key: "pref", header: "Preference", align: "right", cell: (r) => (r.preferenceNo ? `#${r.preferenceNo}` : "—") },
              { key: "mark", header: "Mark", align: "right", tone: "mono", cell: (r) => formatMarks(r.mark) },
              { key: "official", header: "Official", cell: (r) => (base.kind === "published" ? r.official : "—") },
              {
                key: "sim",
                header: "Your simulated consent",
                cell: (r) => <ConsentToggle induction={ind.induction} base={key} back={back} applicantId={r.applicantId} seatKey={r.seatKey} official={r.official} simulated={r.simulated} changed={r.changed} />,
              },
            ]}
          />
        ) : (
          <p className="text-sm text-muted">You have no seat on this list. Simulate the next round to see whether you would get one.</p>
        )}
        <p className="mt-3 text-xs text-subtle">
          {view.total.toLocaleString("en-US")} allocations on this list · in your scenario {view.counts.Accepted.toLocaleString("en-US")} accepted,{" "}
          {view.counts.Rejected.toLocaleString("en-US")} rejected, {view.counts.Awaited.toLocaleString("en-US")} awaited.
        </p>
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
              {result.mySeats.length ? (
                <Notice title={`You would hold ${result.mySeats.length === 1 ? "a seat" : `${result.mySeats.length} seats`}`}>
                  {result.mySeats.map((m) => `${m.program} · ${m.quota} · ${m.speciality} · ${m.hospital} (preference #${m.preferenceNo})`).join("; ")}
                </Notice>
              ) : (
                <Notice tone="warning" title="You would not hold a seat">Under this scenario the simulation places you nowhere in round {result.roundNo}.</Notice>
              )}
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
              <div>
                <ButtonLink href={href(ind.induction, `run:${result.run.id}`)} variant="secondary" size="sm">Continue from simulated round {result.roundNo}</ButtonLink>
              </div>
            </div>
          ) : null}
        </Card>
      ) : null}
    </>,
  );
}
