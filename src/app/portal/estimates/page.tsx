import Link from "next/link";
import { AreaPage } from "@/components/area-page";
import { BuiltOn } from "@/components/built-on";
import { basisLabel } from "@/lib/ingest/workflow";
import { whenDatabaseDown } from "@/components/database-unavailable";
import { AuroraStat } from "@/components/ui/aurora-header";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { EmptyState } from "@/components/ui/empty-state";
import { Pill } from "@/components/ui/segmented";
import { fieldClass } from "@/components/ui/styles";
import { getSession } from "@/lib/auth/session";
import { verifiedApplicant } from "@/lib/data/candidates";
import { estimateApplicantResult, estimateList, officialReplies, publishedEstimates, publishedRound } from "@/lib/data/simulation";
import { ensureUser } from "@/lib/data/users";
import { getDb } from "@/lib/db/client";
import { marginText, RESULT_LABELS, trackSummary, type ResultStatus } from "@/lib/domain/applicant-result";
import { formatMarks, formatUtc, isUuid } from "@/lib/format";
import { findSection } from "@/lib/navigation";

export const metadata = { title: "Estimates" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<ResultStatus, "success" | "danger" | "info" | "neutral" | "amber"> = {
  placed: "success",
  fell_short: "danger",
  clears_cutoff: "info",
  skipped: "neutral",
  no_seats: "amber",
};

type Sp = { run?: string; id?: string };

/**
 * Estimates (v4): the current published estimate of the next list, how many consent
 * replies it rests on, where closing merit is likely to move, and any applicant's
 * result preference by preference, as the old simulator showed it. Never probabilities,
 * never official.
 */
export default async function EstimatesPage({ searchParams }: { searchParams: Promise<Sp> }) {
  const s = findSection("/portal/estimates");
  const down = await whenDatabaseDown({ area: "portal", trail: [{ label: s.label }], title: s.label, description: s.description });
  if (down) return down;
  const db = getDb();
  const session = await getSession();
  const sp = await searchParams;
  const all = await publishedEstimates(db, session);
  const current = all.filter((e) => !e.official);
  const pick = (sp.run && isUuid(sp.run) ? all.find((e) => e.id === sp.run) : null) ?? current[0] ?? null;

  if (!pick) {
    return (
      <AreaPage area="portal" trail={[{ label: s.label }]} title={s.label} description={s.description} status={<Badge tone="simulated" className="mx-2">Estimate · not official</Badge>}>
        <EmptyState title="No estimate right now" action={<div className="flex flex-wrap justify-center gap-2"><ButtonLink href="/portal/simulation">Run your own what-if</ButtonLink><ButtonLink href="/portal/history" variant="secondary">Merit lists</ButtonLink></div>}>
          An estimate of the next list appears here once the gazette, portal preferences and consent replies for a round are in, usually a day or two before PHF publishes it.
          {all.length ? <> Earlier estimates are kept with their <Link href="/portal/history" className="text-signal underline">merit lists</Link>.</> : null}
        </EmptyState>
      </AreaPage>
    );
  }

  const est = await estimateList(db, session, pick.id);
  const me = session ? await verifiedApplicant(db, (await ensureUser(db, session)).id) : null;
  const asked = (sp.id ?? "").replace(/\D/g, "").slice(0, 8);
  const applicant = asked || me || "";
  const result = applicant ? await estimateApplicantResult(db, session, { runId: pick.id, applicantId: applicant }) : null;

  // Consent replies the estimate rests on (the round before it), and closing merit then vs now.
  const prevNo = pick.roundNo - 1;
  const [replies, prev] = prevNo >= 1 ? await Promise.all([officialReplies(db, pick.induction, prevNo), publishedRound(db, pick.induction, prevNo)]) : [[], null];
  const byApplicant = new Map<string, string>();
  for (const r of replies) if (byApplicant.get(r.applicantId) !== "Accepted") byApplicant.set(r.applicantId, r.status);
  const tally = { Accepted: 0, Rejected: 0, Awaited: 0 };
  for (const v of byApplicant.values()) tally[v === "Accepted" || v === "Rejected" ? v : "Awaited"]++;
  const replied = tally.Accepted + tally.Rejected;
  const totalReplies = replied + tally.Awaited;

  const closing = (rows: { program: string; quota: string; speciality: string; hospital: string; mark: number }[]) => {
    const m = new Map<string, { program: string; quota: string; speciality: string; hospital: string; closing: number; n: number }>();
    for (const r of rows) {
      const k = `${r.program}|${r.quota}|${r.speciality}|${r.hospital}`.toLowerCase();
      const g = m.get(k);
      m.set(k, g ? { ...g, closing: Math.min(g.closing, r.mark), n: g.n + 1 } : { program: r.program, quota: r.quota, speciality: r.speciality, hospital: r.hospital, closing: r.mark, n: 1 });
    }
    return m;
  };
  const nowMap = est ? closing(est.rows) : new Map();
  const thenMap = prev ? closing(prev) : new Map();
  const moves = [...nowMap.entries()]
    .map(([k, g]) => ({ ...g, then: thenMap.get(k)?.closing ?? null }))
    .filter((g) => g.then != null && Math.abs(g.closing - g.then) >= 0.01)
    .sort((a, b) => Math.abs(b.closing - b.then!) - Math.abs(a.closing - a.then!))
    .slice(0, 8);
  const prevKeys = new Set((prev ?? []).map((p) => `${p.applicantId}|${p.program}`));
  const seatsReoffered = prev && est ? est.rows.filter((r) => !prevKeys.has(`${r.applicantId}|${r.program}`)).length : null;
  const base = "/portal/estimates";
  const listHref = `/portal/history/${pick.induction}/estimates/${pick.id}`;

  return (
    <AreaPage
      area="portal"
      trail={[{ label: s.label }]}
      title={`Induction ${pick.induction} · estimated round ${pick.roundNo}`}
      description={`Published ${formatUtc(pick.publishedAt)} UTC. Simulated from the gazette, portal preferences and consent replies. The real list can differ.`}
      status={<Badge tone="simulated" className="mx-2">Estimate{pick.basis ? ` · ${basisLabel(pick.basis)}` : ""} · not official</Badge>}
      aside={
        <div className="grid grid-cols-3 gap-6">
          <AuroraStat label="Allocations" value={(est?.rows.length ?? pick.placed ?? 0).toLocaleString("en-US")} />
          <AuroraStat label="New in this list" value={seatsReoffered == null ? "—" : seatsReoffered.toLocaleString("en-US")} hint={prevNo >= 1 ? `vs round ${prevNo}` : undefined} />
          <AuroraStat label="Replies in" value={totalReplies ? `${Math.round((replied / totalReplies) * 100)}%` : "—"} />
        </div>
      }
    >
      <Card className="py-3 sm:py-3"><BuiltOn basis={pick.basis} /></Card>

      {pick.official ? (
        <Card className="border-amber/50">
          <p className="text-sm">PHF has published round {pick.roundNo}; this estimate is kept for comparison. <Link href={`/portal/history/${pick.induction}/rounds/${pick.roundNo}`} className="font-semibold text-signal hover:underline">Open the official list →</Link></p>
        </Card>
      ) : null}

      {/* Applicant result, as the old simulator showed it. */}
      <Card className="border-dashed border-amber/50">
        <CardHeader
          title="Result for an applicant"
          description="Every preference, in order: placed, fell short, would clear the cutoff, or skipped because an earlier one was placed. One seat per track."
          action={
            <form action={base} className="flex items-center gap-2">
              {sp.run ? <input type="hidden" name="run" value={sp.run} /> : null}
              <label htmlFor="est-id" className="sr-only">Applicant ID</label>
              <input id="est-id" name="id" inputMode="numeric" defaultValue={asked || me || ""} placeholder="Applicant ID" className={cn(fieldClass, "h-10 w-36 font-mono")} />
              <button type="submit" className="mn-btn h-10 rounded-lg px-4 text-sm font-semibold">Show</button>
            </form>
          }
        />
        {!applicant ? (
          <p className="text-sm text-muted">Enter an applicant ID{me ? "" : ", or link your account on Me to see your own result here every time"}.</p>
        ) : !result ? (
          <p className="text-sm text-muted">Applicant {applicant} has no preferences in this induction&apos;s data, so the estimate cannot place them.</p>
        ) : (
          <div className="grid gap-5">
            <p className="text-sm text-muted">
              <span className="font-mono text-ink">{result.applicantId}</span>
              {result.name ? <> · <span className="font-semibold text-heading">{result.name}</span></> : null}
              {result.pmdcNo ? <> · PMDC <span className="font-mono">{result.pmdcNo}</span></> : null}
              {result.applicantId === me ? <Badge tone="current" className="ml-2">you</Badge> : null}
            </p>
            {result.programmes.map((p) => {
              const sum = trackSummary(p.rows);
              return (
                <section key={p.program} className="overflow-hidden rounded-xl border border-line">
                  <div className={cn("flex flex-wrap items-center gap-3 border-b border-line px-4 py-3", sum.placed ? "bg-success/10" : "bg-[var(--mn-amber-soft)]")}>
                    <span className="font-semibold text-heading">{p.program}</span>
                    <span className="text-sm text-muted">mark <span className="font-mono">{formatMarks(p.mark)}</span></span>
                    {sum.placed ? (
                      <Pill tone="success">Placed at preference #{sum.placed.preferenceNo} · {sum.placed.speciality}, {sum.placed.hospital}</Pill>
                    ) : (
                      <Pill tone="amber">Not placed{sum.closestMiss ? ` · closest: #${sum.closestMiss.preferenceNo}, ${marginText(sum.closestMiss)}` : ""}</Pill>
                    )}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[40rem] text-sm">
                      <thead className="text-left text-xs text-subtle">
                        <tr><th className="px-4 py-2 font-medium">Pref.</th><th className="px-2 py-2 font-medium">Seat</th><th className="px-2 py-2 text-right font-medium">Filled</th><th className="px-2 py-2 text-right font-medium">Cutoff</th><th className="px-2 py-2 font-medium">Margin</th><th className="px-4 py-2 font-medium">Status</th></tr>
                      </thead>
                      <tbody>
                        {p.rows.map((r) => (
                          <tr key={r.preferenceNo} className={cn("border-t border-line", r.status === "placed" && "bg-success/5")}>
                            <td className="px-4 py-2 font-mono text-muted">#{r.preferenceNo}</td>
                            <td className="px-2 py-2"><span className="text-ink">{r.speciality}</span><span className="block text-xs text-muted">{r.hospital} · {r.quota}</span></td>
                            <td className="px-2 py-2 text-right tabular-nums text-muted">{r.filled ?? "—"}</td>
                            <td className="px-2 py-2 text-right font-mono">{r.cutoff == null ? "—" : formatMarks(r.cutoff)}</td>
                            <td className={cn("px-2 py-2 text-xs", r.status === "fell_short" ? "text-danger" : r.status === "placed" || r.status === "clears_cutoff" ? "text-success" : "text-muted")}>{marginText(r)}</td>
                            <td className="px-4 py-2"><Pill tone={STATUS_TONE[r.status]}>{RESULT_LABELS[r.status]}</Pill></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Card>
          <CardHeader title="Consent replies" description={prevNo >= 1 ? `Round ${prevNo} replies this estimate rests on. More replies make it firmer.` : "The first round is estimated from the gazette and preferences alone."} />
          {totalReplies ? (
            <>
              <div className="flex h-3 overflow-hidden rounded-full bg-hover" role="img" aria-label={`${tally.Accepted} accepted, ${tally.Rejected} rejected, ${tally.Awaited} awaited`}>
                <span className="mn-grow-x bg-success" style={{ width: `${(tally.Accepted / totalReplies) * 100}%` }} />
                <span className="mn-grow-x bg-danger" style={{ width: `${(tally.Rejected / totalReplies) * 100}%` }} />
                <span className="bg-amber/40" style={{ width: `${(tally.Awaited / totalReplies) * 100}%` }} />
              </div>
              <ul className="mt-3 grid grid-cols-3 gap-2 text-sm">
                <li><span className="block text-xl font-semibold tabular-nums text-success">{tally.Accepted.toLocaleString("en-US")}</span>accepted</li>
                <li><span className="block text-xl font-semibold tabular-nums text-danger">{tally.Rejected.toLocaleString("en-US")}</span>rejected</li>
                <li><span className="block text-xl font-semibold tabular-nums text-amber">{tally.Awaited.toLocaleString("en-US")}</span>no reply yet</li>
              </ul>
            </>
          ) : <p className="text-sm text-muted">No consent replies are loaded for this round yet.</p>}
          <div className="mt-5 flex flex-wrap gap-2">
            <ButtonLink href={listHref} size="sm">Open the full estimated list</ButtonLink>
            <ButtonLink href={`/portal/simulation?i=${pick.induction}&base=${encodeURIComponent(`run:${pick.id}`)}`} variant="secondary" size="sm">What if… change consent</ButtonLink>
          </div>
        </Card>

        <Card>
          <CardHeader title={prevNo >= 1 ? `Where closing merit moves vs round ${prevNo}` : "Estimated closing merit"} description="The biggest changes in this estimate. Amber is the estimate; the tick is the published round." action={<Badge tone="simulated">Estimate</Badge>} />
          {moves.length ? (
            <ul className="grid gap-3">
              {moves.map((g) => {
                const lo = Math.min(g.closing, g.then!) - 2, hi = Math.max(g.closing, g.then!) + 2;
                const pos = (v: number) => `${((v - lo) / (hi - lo)) * 100}%`;
                const down = g.closing < g.then!;
                return (
                  <li key={`${g.program}|${g.quota}|${g.speciality}|${g.hospital}`}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate"><span className="text-ink">{g.speciality}</span> <span className="text-muted">· {g.hospital} · {g.program} {g.quota}</span></span>
                      <span className={cn("flex-none font-mono text-xs", down ? "text-success" : "text-danger")}>{formatMarks(g.then)} → {formatMarks(g.closing)}</span>
                    </div>
                    <div className="relative mt-1.5 h-2 rounded-full bg-hover">
                      <span className="mn-grow-x absolute inset-y-0 rounded-full bg-amber/60" style={{ left: pos(Math.min(g.closing, g.then!)), width: `calc(${pos(Math.max(g.closing, g.then!))} - ${pos(Math.min(g.closing, g.then!))})` }} />
                      <span aria-hidden className="absolute -top-1 h-4 w-0.5 rounded bg-ink" style={{ left: pos(g.then!) }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : <p className="text-sm text-muted">No seat&apos;s closing merit changes against the published round, or there is no published round to compare with.</p>}
        </Card>
      </div>

      {all.length > 1 ? (
        <p className="text-xs text-muted">
          Other estimates:{" "}
          {all.filter((e) => e.id !== pick.id).map((e, i) => (
            <span key={e.id}>{i ? ", " : ""}<Link href={`${base}?run=${e.id}`} className="text-signal underline underline-offset-2">induction {e.induction} round {e.roundNo}{e.official ? " (superseded)" : ""}</Link></span>
          ))}
        </p>
      ) : null}
    </AreaPage>
  );
}
