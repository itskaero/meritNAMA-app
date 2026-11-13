import Link from "next/link";
import { AreaPage } from "@/components/area-page";
import { whenDatabaseDown } from "@/components/database-unavailable";
import { Icon } from "@/components/icon";
import { AuroraStat } from "@/components/ui/aurora-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { EmptyState } from "@/components/ui/empty-state";
import { Pill, Segmented } from "@/components/ui/segmented";
import { fieldClass, selectClass } from "@/components/ui/styles";
import { getSession } from "@/lib/auth/session";
import { verifiedApplicant } from "@/lib/data/candidates";
import { gazetteBoard, gazetteCandidate, gazetteInductions, type GazetteBoardRow } from "@/lib/data/simulation";
import { ensureUser } from "@/lib/data/users";
import { getDb } from "@/lib/db/client";
import { CORRECTION_KIND_LABELS, CORRECTION_LABELS, type CorrectionField, type CorrectionKind } from "@/lib/domain/corrections";
import { rankRows } from "@/lib/domain/gazette";
import { classifyQuery } from "@/lib/domain/merit-round";
import type { VerificationStep } from "@/lib/domain/sim-dataset";
import { formatMarks } from "@/lib/format";
import { findSection } from "@/lib/navigation";

export const metadata = { title: "Candidates" };
export const dynamic = "force-dynamic";

const PAGE = 100;
const TABS = { all: "All", running: "In the running", out: "Out of the running", corrected: "Corrected" } as const;
type Tab = keyof typeof TABS;
const CHIPS = {
  rescued: "Rescued by amendment",
  both: "Rejected at both",
  pending: "Still pending",
  marks: "Marks corrected",
  multi: "2+ programmes",
  noprefs: "No preferences",
} as const;
type Chip = keyof typeof CHIPS;
const STEP_STATUS = { "": "Any", "1": "Accepted", "2": "Rejected", "11": "Pending", none: "No step" } as const;

type Sp = { i?: string; tab?: string; prog?: string; r1?: string; amend?: string; q?: string; chip?: string; page?: string; id?: string; marks?: string };

const step = (v: VerificationStep[], type: number) => v.find((s) => s.type === type) ?? null;
const R01 = 131, AMEND = 132;

function StepMark({ s, label }: { s: VerificationStep | null; label: string }) {
  if (!s) return <span className="text-subtle">{label} —</span>;
  const [icon, tone] = s.status === 1 ? ["✓", "text-success"] : s.status === 2 ? ["✕", "text-danger"] : ["◷", "text-amber"];
  return <span className={tone} title={s.remarks ? `PHF: ${s.remarks}` : undefined}>{label} {icon}</span>;
}

export default async function CandidatesPage({ searchParams }: { searchParams: Promise<Sp> }) {
  const s = findSection("/portal/candidates");
  const down = await whenDatabaseDown({ area: "portal", trail: [{ label: s.label }], title: s.label, description: s.description });
  if (down) return down;
  const db = getDb();
  const session = await getSession();
  const sp = await searchParams;
  const inductions = await gazetteInductions(db, session);
  const induction = inductions.find((x) => String(x) === sp.i) ?? inductions[0];
  if (induction == null) {
    return (
      <AreaPage area="portal" trail={[{ label: s.label }]} title={s.label} description={s.description}>
        <EmptyState title="No gazette loaded yet">The gazette appears here when PHF publishes it for the running induction. Past merit lists are on <Link href="/portal/history" className="text-signal underline">Merit lists</Link>.</EmptyState>
      </AreaPage>
    );
  }
  const board = (await gazetteBoard(db, session, induction))!;
  const me = session ? await verifiedApplicant(db, (await ensureUser(db, session)).id) : null;
  const usePublished = sp.marks === "published";
  const ranked = rankRows([...board.rows].map((r) => ({ ...r, marks: usePublished ? r.published : r.marks })).sort((a, b) => b.marks - a.marks || a.applicantId.localeCompare(b.applicantId)));
  const myRow = me ? ranked.find((r) => r.applicantId === me) : null;

  const tab: Tab = sp.tab && sp.tab in TABS ? (sp.tab as Tab) : "all";
  const chip: Chip | null = sp.chip && sp.chip in CHIPS ? (sp.chip as Chip) : null;
  const programs = [...new Set(board.rows.flatMap((r) => r.programmes.map((p) => p.program)))].sort();
  const prog = programs.includes(sp.prog ?? "") ? sp.prog! : "";
  const r1 = sp.r1 && sp.r1 in STEP_STATUS ? sp.r1 : "";
  const amend = sp.amend && sp.amend in STEP_STATUS ? sp.amend : "";
  const query = classifyQuery(sp.q ?? "");
  const stepIs = (v: VerificationStep[], type: number, want: string) => {
    if (!want) return true;
    const x = step(v, type);
    return want === "none" ? !x : x?.status === Number(want);
  };
  const chipIs = (r: GazetteBoardRow) => {
    const a = step(r.verification, R01)?.status, b = step(r.verification, AMEND)?.status;
    switch (chip) {
      case "rescued": return a === 2 && b === 1;
      case "both": return a === 2 && b === 2;
      case "pending": return a === 11 || b === 11 || r.profileStatus === 11;
      case "marks": return r.corrected.length > 0 && r.published !== r.marks;
      case "multi": return r.programmes.length >= 2;
      case "noprefs": return r.programmes.length === 0;
      default: return true;
    }
  };
  const matches = ranked.filter((r) =>
    (tab === "all" || (tab === "running" && r.profileStatus === 1) || (tab === "out" && r.profileStatus === 2) || (tab === "corrected" && r.corrected.length > 0)) &&
    (!prog || r.programmes.some((p) => p.program === prog)) &&
    stepIs(r.verification, R01, r1) && stepIs(r.verification, AMEND, amend) && chipIs(r) &&
    (!query || (query.kind === "id" ? r.applicantId.includes(query.value) : query.kind === "pmdc" ? r.pmdcNo === query.value : (r.name ?? "").toLowerCase().includes(query.value.toLowerCase()))),
  );
  const pages = Math.max(1, Math.ceil(matches.length / PAGE));
  const page = Math.min(pages, Math.max(1, Number(sp.page) || 1));
  const shown = matches.slice((page - 1) * PAGE, page * PAGE);

  const counts = {
    running: board.rows.filter((r) => r.profileStatus === 1).length,
    out: board.rows.filter((r) => r.profileStatus === 2).length,
    corrected: board.rows.filter((r) => r.corrected.length).length,
    r1Done: board.rows.filter((r) => step(r.verification, R01)).length,
    amendDone: board.rows.filter((r) => step(r.verification, AMEND)).length,
  };
  const href = (change: Partial<Sp>) => {
    const next: Sp = { ...sp, i: String(induction), ...change };
    if (!("page" in change)) delete next.page;
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v) q.set(k, v);
    return `/portal/candidates?${q}`;
  };
  const panel = sp.id ? await gazetteCandidate(db, session, { induction, applicantId: sp.id }) : null;

  return (
    <AreaPage
      area="portal"
      trail={[{ label: s.label }]}
      title={`Candidates · induction ${induction}`}
      description="The gazette is fixed for the cycle; verification, corrections and seats are layered on top. Corrected marks keep the original beside them."
      aside={
        <div className="grid grid-cols-3 gap-6">
          <AuroraStat label="In the gazette" value={board.rows.length.toLocaleString("en-US")} />
          <AuroraStat label="In the running" value={counts.running.toLocaleString("en-US")} />
          <AuroraStat label="Your rank" value={myRow ? `#${myRow.rank.toLocaleString("en-US")}` : "—"} hint={myRow ? `of ${ranked.length.toLocaleString("en-US")}` : "link your account on Me"} />
        </div>
      }
    >
      {/* Where each column comes from. */}
      <div className="grid gap-3 md:grid-cols-4">
        <SourceTile icon="list" title="Gazette" body={`PHF report · ${board.rows.length.toLocaleString("en-US")} candidates · same all cycle`} />
        <SourceTile icon="check" title="Round 01 verification" body={`${counts.r1Done.toLocaleString("en-US")} checked`} meter={counts.r1Done / Math.max(1, board.rows.length)} />
        <SourceTile icon="history" title="Amendment process" body={`${counts.amendDone.toLocaleString("en-US")} checked`} meter={counts.amendDone / Math.max(1, board.rows.length)} tone="info" />
        <SourceTile icon="sliders" title="Corrections" body={`${counts.corrected.toLocaleString("en-US")} candidates · original kept`} tone="amber" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented label="Candidates" items={(Object.keys(TABS) as Tab[]).map((t) => ({ href: href({ tab: t === "all" ? undefined : t }), label: TABS[t], active: t === tab, count: t === "all" ? board.rows.length : counts[t] }))} />
        {inductions.length > 1 ? (
          <nav aria-label="Induction" className="flex gap-1 text-sm">
            {inductions.slice(0, 4).map((x) => <Link key={x} href={`/portal/candidates?i=${x}`} aria-current={x === induction ? "page" : undefined} className={cn("rounded-lg px-3 py-1.5", x === induction ? "mn-btn" : "mn-btn-ghost")}>Induction {x}</Link>)}
          </nav>
        ) : null}
      </div>

      <Card>
        <form action="/portal/candidates" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))_auto] lg:items-end">
          <input type="hidden" name="i" value={induction} />
          {tab !== "all" ? <input type="hidden" name="tab" value={tab} /> : null}
          {chip ? <input type="hidden" name="chip" value={chip} /> : null}
          {usePublished ? <input type="hidden" name="marks" value="published" /> : null}
          <label className="grid gap-1.5 text-sm font-medium">Name, PMDC or applicant ID
            <input name="q" defaultValue={sp.q ?? ""} placeholder="Ali Raza · 93410-P · 27267" className={fieldClass} />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">Programme
            <select name="prog" defaultValue={prog} className={selectClass}><option value="">All</option>{programs.map((p) => <option key={p}>{p}</option>)}</select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium">Round 01
            <select name="r1" defaultValue={r1} className={selectClass}>{Object.entries(STEP_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium">Amendment
            <select name="amend" defaultValue={amend} className={selectClass}>{Object.entries(STEP_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </label>
          <button type="submit" className="mn-btn h-10 rounded-lg px-4 text-sm font-semibold">Find</button>
        </form>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {(Object.keys(CHIPS) as Chip[]).map((c) => (
            <Link key={c} href={href({ chip: chip === c ? undefined : c })} aria-current={chip === c ? "true" : undefined} className={cn("rounded-full px-3 py-1 text-xs font-medium", chip === c ? "mn-btn" : "mn-btn-ghost")}>{CHIPS[c]}</Link>
          ))}
          <span className="ml-auto text-xs text-muted">
            Marks: <Link href={href({ marks: undefined })} className={cn("underline-offset-2", !usePublished ? "font-semibold text-ink" : "text-signal underline")}>with corrections</Link> · <Link href={href({ marks: "published" })} className={cn("underline-offset-2", usePublished ? "font-semibold text-ink" : "text-signal underline")}>as published</Link>
          </span>
        </div>
      </Card>

      {panel ? <CandidatePanel c={panel} closeHref={href({ id: undefined, page: sp.page })} latestRound={board.latestRound} /> : null}

      <Card>
        <CardHeader title={`${matches.length.toLocaleString("en-US")} candidate${matches.length === 1 ? "" : "s"}`} description={`Page ${page} of ${pages}. Click a candidate for their record and every preference.`} />
        {shown.length === 0 ? <EmptyState title="Nobody matches">Clear a filter or a chip.</EmptyState> : (
          <div className="-mx-5 overflow-x-auto sm:-mx-6">
            <table className="w-full min-w-[56rem] text-sm">
              <thead className="text-left text-xs text-subtle">
                <tr>
                  <th colSpan={4} className="border-b border-line px-5 pb-1 font-semibold uppercase tracking-[0.1em] text-[0.65rem] sm:px-6">Gazette and verification · same all cycle</th>
                  <th colSpan={2} className="border-b border-amber/40 px-2 pb-1 font-semibold uppercase tracking-[0.1em] text-[0.65rem] text-amber">{board.latestRound ? `Round ${board.latestRound} · changes each round` : "Rounds · none yet"}</th>
                </tr>
                <tr>
                  <th className="px-5 py-2 font-medium sm:px-6">Rank</th>
                  <th className="px-2 py-2 font-medium">Candidate</th>
                  <th className="px-2 py-2 text-right font-medium">Marks</th>
                  <th className="px-2 py-2 font-medium">Verification</th>
                  <th className="px-2 py-2 font-medium">Programmes</th>
                  <th className="px-2 py-2 pr-5 font-medium sm:pr-6">Seat</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.applicantId} className={cn("border-t border-line hover:bg-hover/60", r.applicantId === me && "bg-violet/10", r.applicantId === sp.id && "bg-violet/15")}>
                    <td className="px-5 py-2.5 font-mono text-muted sm:px-6">#{r.rank}</td>
                    <td className="px-2 py-2.5">
                      <Link href={href({ id: r.applicantId, page: String(page) })} scroll={false} className="group block">
                        <span className="font-medium text-heading group-hover:text-violet-pale">{r.name ?? "Name not in the gazette"}</span>
                        {r.applicantId === me ? <Badge tone="current" className="ml-2">you</Badge> : null}
                        <span className="block font-mono text-xs text-muted">{r.applicantId}{r.pmdcNo ? ` · ${r.pmdcNo}` : ""}</span>
                      </Link>
                    </td>
                    <td className="px-2 py-2.5 text-right">
                      <span className="font-mono text-ink">{formatMarks(r.marks)}</span>
                      {r.corrected.length && r.published !== (usePublished ? r.published : board.rows.find((x) => x.applicantId === r.applicantId)!.marks) ? (
                        <span className="block text-[0.7rem] text-amber" title={`Corrected (${r.corrected.map((k) => CORRECTION_KIND_LABELS[k as CorrectionKind] ?? k).join(", ")}); PHF published ${formatMarks(r.published)}`}>corrected · PHF {formatMarks(r.published)}</span>
                      ) : null}
                    </td>
                    <td className="px-2 py-2.5 text-xs">
                      <span className="inline-flex items-center gap-1.5 whitespace-nowrap"><StepMark s={step(r.verification, R01)} label="R01" /><span className="text-subtle">→</span><StepMark s={step(r.verification, AMEND)} label="Amend" /></span>
                    </td>
                    <td className="px-2 py-2.5 text-xs text-muted">{r.programmes.length ? r.programmes.map((p) => `${p.program} (${p.prefs})`).join(" · ") : <span className="text-subtle">No preferences</span>}</td>
                    <td className="px-2 py-2.5 pr-5 text-xs sm:pr-6">{r.seat ? <><span className="text-ink">{r.seat.speciality}</span><span className="block text-muted">{r.seat.hospital} · {r.seat.program}</span></> : <span className="text-subtle">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pages > 1 ? (
          <nav aria-label="Pages" className="mt-4 flex items-center justify-between text-sm">
            {page > 1 ? <Link href={href({ page: String(page - 1) })} className="mn-btn-ghost rounded-lg px-3 py-1.5">← Previous</Link> : <span />}
            <span className="text-muted">{((page - 1) * PAGE + 1).toLocaleString("en-US")}–{Math.min(page * PAGE, matches.length).toLocaleString("en-US")} of {matches.length.toLocaleString("en-US")}</span>
            {page < pages ? <Link href={href({ page: String(page + 1) })} className="mn-btn-ghost rounded-lg px-3 py-1.5">Next →</Link> : <span />}
          </nav>
        ) : null}
      </Card>
    </AreaPage>
  );
}

function SourceTile({ icon, title, body, meter, tone = "violet" }: { icon: "list" | "check" | "history" | "sliders"; title: string; body: string; meter?: number; tone?: "violet" | "info" | "amber" }) {
  const bar = tone === "info" ? "bg-info" : tone === "amber" ? "bg-amber" : "bg-violet-soft";
  return (
    <div className="mn-card-glass rounded-xl border border-line p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-heading"><Icon name={icon} className="h-4 w-4 text-decor" />{title}</p>
      <p className="mt-1 text-xs text-muted">{body}</p>
      {meter != null ? <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-hover"><span className={cn("mn-grow-x block h-full rounded-full", bar)} style={{ width: `${Math.round(meter * 100)}%` }} /></div> : null}
    </div>
  );
}

type Panel = NonNullable<Awaited<ReturnType<typeof gazetteCandidate>>>;

function CandidatePanel({ c, closeHref, latestRound }: { c: Panel; closeHref: string; latestRound: number | null }) {
  const latest = latestRound != null ? c.rounds.filter((r) => r.roundNo === latestRound) : [];
  const events: { when: string; text: string; tone: "neutral" | "success" | "danger" | "amber" | "info" }[] = [
    { when: "Gazette", text: `Base marks ${formatMarks(c.imported.baseMarks)} as published`, tone: "neutral" },
    ...c.verification.map((v) => ({ when: v.label.replace("Verification : ", ""), text: `${v.status === 1 ? "Accepted" : v.status === 2 ? "Rejected" : "Pending"}${v.remarks ? ` · PHF: ${v.remarks}` : ""}`, tone: (v.status === 1 ? "success" : v.status === 2 ? "danger" : "amber") as "success" | "danger" | "amber" })),
    ...c.corrections.map((k) => ({ when: CORRECTION_KIND_LABELS[k.kind as CorrectionKind] ?? k.kind, text: `${CORRECTION_LABELS[k.field as CorrectionField] ?? k.field}${k.program ? ` (${k.program})` : ""} → ${k.field === "profile_status" ? k.value : formatMarks(k.value)}`, tone: "info" as const })),
    ...c.rounds.map((r) => ({ when: `Round ${r.roundNo}`, text: `${r.speciality}, ${r.hospital} · ${r.program} ${r.quota} · pref #${r.preferenceNo ?? "?"}`, tone: "success" as const })),
  ];
  return (
    <section aria-labelledby="cand-panel" className="mn-card-glass rounded-xl border border-violet-soft/40 p-5 shadow-[0_0_30px_var(--mn-violet-glow)] sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="cand-panel" className="text-xl font-semibold text-heading">{c.name ?? `Applicant ${c.applicantId}`}</h2>
          <p className="font-mono text-sm text-muted">{c.applicantId}{c.pmdcNo ? ` · PMDC ${c.pmdcNo}` : ""} · marks {formatMarks(c.effective.baseMarks)}{c.effective.baseMarks !== c.imported.baseMarks ? ` (PHF ${formatMarks(c.imported.baseMarks)})` : ""}</p>
        </div>
        <Link href={closeHref} scroll={false} aria-label="Close" className="mn-btn-ghost grid h-10 w-10 flex-none place-items-center rounded-lg"><Icon name="close" className="h-4 w-4" /></Link>
      </div>
      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <div>
          <h3 className="text-sm font-semibold text-heading">Record</h3>
          <ol className="mt-3 grid gap-3 border-l border-line pl-4">
            {events.map((e, i) => (
              <li key={i} className="relative">
                <span aria-hidden className={cn("absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full", e.tone === "success" ? "bg-success" : e.tone === "danger" ? "bg-danger" : e.tone === "amber" ? "bg-amber" : e.tone === "info" ? "bg-info" : "bg-decor")} />
                <p className="text-xs font-semibold text-muted">{e.when}</p>
                <p className="text-sm text-ink">{e.text}</p>
              </li>
            ))}
          </ol>
        </div>
        <div className="grid content-start gap-4">
          <h3 className="text-sm font-semibold text-heading">Preferences{latestRound ? ` · against round ${latestRound}` : ""}</h3>
          {c.programmes.filter((p) => p.preferences.length).length === 0 ? <p className="text-sm text-muted">No preferences in the portal data.</p> : null}
          {c.programmes.filter((p) => p.preferences.length).map((p) => {
            const seat = latest.find((r) => r.program.toLowerCase() === p.program.toLowerCase());
            const at = seat?.preferenceNo ?? null;
            return (
              <div key={p.program} className="overflow-hidden rounded-xl border border-line">
                <p className="flex flex-wrap items-center gap-2 border-b border-line bg-hover/40 px-3 py-2 text-sm">
                  <span className="font-semibold text-heading">{p.program}</span>
                  {p.mark != null ? <span className="font-mono text-xs text-muted">mark {formatMarks(p.mark)}</span> : null}
                  {at ? <Pill tone="success">Placed at #{at}</Pill> : latestRound ? <Pill>Not placed in round {latestRound}</Pill> : null}
                </p>
                <ol className="max-h-72 overflow-y-auto">
                  {p.preferences.map((x) => {
                    const st = at == null ? null : x.preferenceNo < at ? "fell" : x.preferenceNo === at ? "placed" : "skipped";
                    return (
                      <li key={x.preferenceNo} className="flex items-center gap-3 border-t border-line px-3 py-1.5 text-xs first:border-0">
                        <span className="w-8 font-mono text-muted">#{x.preferenceNo}</span>
                        <span className="min-w-0 flex-1"><span className="text-ink">{x.speciality}</span> <span className="text-muted">· {x.hospital} · {x.quota}</span></span>
                        {st === "placed" ? <Pill tone="success">Placed</Pill> : st === "fell" ? <Pill tone="danger">Fell short</Pill> : st === "skipped" ? <Pill>Skipped</Pill> : null}
                      </li>
                    );
                  })}
                </ol>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
