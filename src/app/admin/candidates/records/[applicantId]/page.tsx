import Link from "next/link";
import { notFound } from "next/navigation";
import { AreaPage } from "@/components/area-page";
import { whenDatabaseDown } from "@/components/database-unavailable";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { DataTable } from "@/components/ui/data-table";
import { Notice } from "@/components/ui/notice";
import { requireSection } from "@/lib/auth/session";
import { candidateRecord } from "@/lib/data/candidate-records";
import { candidateSimRecord } from "@/lib/data/simulation";
import { getDb } from "@/lib/db/client";
import { CORRECTION_LABELS, profileStatusLabel, type CorrectionField } from "@/lib/domain/corrections";
import { formatMarks, formatUtc } from "@/lib/format";
import { CorrectionForm, RevokeCorrection } from "../../forms";

export const metadata = { title: "Candidate record" };
export const dynamic = "force-dynamic";

const BONUS_SOURCE: Record<string, string> = {
  certificateMarks: "certificate",
  computerizedMarks: "computerised marks",
  programMarks: "preference programme marks",
  legacy: "programme marks",
  zero: "none",
  off: "not counted",
};

export default async function CandidateRecordPage({ params, searchParams }: { params: Promise<{ applicantId: string }>; searchParams: Promise<{ i?: string }> }) {
  const session = await requireSection("/admin/candidates/records");
  const { applicantId } = await params;
  const sp = await searchParams;
  const frame = { area: "admin" as const, trail: [{ label: "Candidates", href: "/admin/candidates" }, { label: "Records", href: "/admin/candidates/records" }, { label: applicantId }], title: `Applicant ${applicantId}` };
  const down = await whenDatabaseDown(frame);
  if (down) return down;
  const db = getDb();
  const record = await candidateRecord(db, session, applicantId);
  if (!record) notFound();
  const induction = record.inductions.find((n) => String(n) === sp.i) ?? record.inductions[0]!;
  const sim = record.simulation.includes(induction) ? await candidateSimRecord(db, session, { induction, applicantId }) : null;
  const allocations = record.allocations.filter((a) => a.induction === induction);
  const corrections = record.corrections.filter((c) => c.induction === induction);
  const verified = record.links.find((l) => l.status === "verified");
  const v = (field: string, x: number | null | undefined) => (x == null ? "—" : field === "profile_status" ? profileStatusLabel(x) : formatMarks(x));

  return (
    <AreaPage {...frame} description={`${record.inductions.length > 1 ? `In inductions ${record.inductions.join(", ")}` : `Induction ${induction}`}. ${verified ? `Linked to ${verified.email}.` : "Not linked to an account."}`}>
      {record.inductions.length > 1 ? (
        <nav aria-label="Induction" className="flex flex-wrap gap-2">
          {record.inductions.map((n) => (
            <Link key={n} href={`/admin/candidates/records/${applicantId}?i=${n}`} aria-current={n === induction ? "page" : undefined}
              className={cn("rounded-full px-3.5 py-1.5 text-sm ring-1 ring-line-strong", n === induction ? "bg-ink text-canvas" : "text-muted hover:text-ink")}>
              Induction {n}
            </Link>
          ))}
        </nav>
      ) : null}

      {record.possibleDuplicates.length ? (
        <Notice tone="warning" title="Possibly the same person as another applicant ID">
          The official record gives the same {[...new Set(record.possibleDuplicates.map((d) => (d.by === "email" ? "email" : "PMDC number")))].join(" and ")} to{" "}
          {record.possibleDuplicates.map((d, n) => (
            <span key={`${d.applicantId}-${d.by}`}>{n ? ", " : ""}<Link href={`/admin/candidates/records/${d.applicantId}`} className="font-semibold text-signal hover:underline">{d.applicantId}</Link></span>
          ))}
          .
        </Notice>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title="Marks" description={sim ? "As imported, and as the simulation uses them after corrections." : "No simulation data for this induction: only published lists are known."} />
          {sim ? (
            <div className="grid gap-4">
              <dl className="grid gap-3 sm:grid-cols-3">
                {([["Base marks", "base_marks", sim.imported.baseMarks, sim.effective.baseMarks], ["Profile status", "profile_status", sim.imported.profileStatus, sim.effective.profileStatus]] as const).map(([label, field, a, b]) => (
                  <div key={label} className="rounded-2xl bg-elevated/60 p-4">
                    <dt className="text-xs text-muted">{label}</dt>
                    <dd className="mt-1 font-mono text-lg tabular-nums">{v(field, b)}</dd>
                    {a !== b ? <dd className="text-xs text-amber">corrected · imported {v(field, a)}</dd> : null}
                  </div>
                ))}
                <div className="rounded-2xl bg-elevated/60 p-4">
                  <dt className="text-xs text-muted">Certificates on file</dt>
                  <dd className="mt-1 font-mono text-lg tabular-nums">{sim.certificates}</dd>
                </div>
              </dl>
              {sim.rulesProblem ? <Notice tone="warning" title="Marks per preference cannot be worked out">{sim.rulesProblem}</Notice> : null}
              <DataTable
                caption="Marks by programme"
                rows={sim.programmes}
                rowKey={(r) => r.program}
                columns={[
                  { key: "p", header: "Programme", cell: (r) => r.program },
                  { key: "applied", header: "Applied", cell: (r) => (sim.appliedIn[r.program] === false ? "No" : sim.appliedIn[r.program] ? "Yes" : r.preferences.length ? "By preferences" : "—") },
                  { key: "pm", header: "Programme marks", align: "right", tone: "mono", cell: (r) => {
                    const a = sim.imported.programMarks[r.program], b = sim.effective.programMarks[r.program];
                    return <>{b == null ? "—" : formatMarks(Number(b))}{a !== b ? <span className="block text-xs text-amber">imported {a == null ? "—" : formatMarks(Number(a))}</span> : null}</>;
                  } },
                  { key: "mark", header: "Merit (no preference)", align: "right", tone: "mono", cell: (r) => (r.mark == null ? "not applied" : formatMarks(r.mark)) },
                  { key: "n", header: "Preferences", align: "right", cell: (r) => r.preferences.length },
                ]}
              />
            </div>
          ) : (
            <p className="text-sm text-muted">Import the induction&apos;s simulation data under Processing to see marks and preferences.</p>
          )}
        </Card>

        <Card className="self-start">
          <CardHeader title="Account" />
          {record.links.length ? (
            <ul className="grid gap-2 text-sm">
              {record.links.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center gap-2">
                  <Badge tone={l.status === "verified" ? "success" : l.status === "pending" ? "warning" : "danger"}>{l.status}</Badge>
                  <span>{l.email}</span>
                  <span className="text-xs text-subtle">{l.method === "email" ? "matched by email" : l.reviewedBy ? `by ${l.reviewedBy}` : "waiting"} · {formatUtc(l.reviewedAt ?? l.createdAt)}{l.reason ? ` · ${l.reason}` : ""}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted">No account has asked to link this record.</p>}
          <p className="mt-3 text-xs text-subtle">
            {record.identity ? `Official record carries ${[record.identity.email ? "an email" : null, record.identity.pmdc ? "a PMDC number" : null].filter(Boolean).join(" and ") || "no contact details"} (stored only as keyed hashes; last seen in induction ${record.identity.lastInduction}).` : "No email or PMDC number indexed for this applicant."}
          </p>
        </Card>
      </div>

      <Card>
        <CardHeader title="Published allocations" description={`Induction ${induction}, every round this applicant was placed in.`} />
        <DataTable
          caption="Published allocations"
          rows={allocations}
          rowKey={(r) => `${r.roundNo}-${r.program}-${r.preferenceNo}-${r.hospital}`}
          empty={<p className="text-sm text-muted">Not on any published list of this induction.</p>}
          columns={[
            { key: "r", header: "Round", cell: (r) => `R${r.roundNo} · ${r.cycle}` },
            { key: "s", header: "Programme · quota · speciality · hospital", cell: (r) => `${r.program.trim()} · ${r.quota.trim()} · ${r.speciality.trim()} · ${r.hospital.trim()}` },
            { key: "p", header: "Pref.", align: "right", cell: (r) => (r.preferenceNo ? `#${r.preferenceNo}` : "—") },
            { key: "m", header: "Marks", align: "right", tone: "mono", cell: (r) => formatMarks(r.marks) },
            { key: "c", header: "Consent", cell: (r) => r.consent },
          ]}
        />
      </Card>

      {sim ? (
        <>
          <Card>
            <CardHeader title="Preferences" description="As entered on the official portal, with the merit the simulation gives each one under this induction's allocation rules." />
            <div className="grid gap-4">
              {sim.programmes.filter((p) => p.preferences.length).map((p) => (
                <details key={p.program} open={sim.programmes.length <= 2} className="rounded-2xl border border-line p-3">
                  <summary className="cursor-pointer text-sm font-semibold">{p.program} · {p.preferences.length} preferences</summary>
                  <div className="mt-3">
                    <DataTable
                      caption={`${p.program} preferences`}
                      rows={p.preferences}
                      rowKey={(r) => `${r.preferenceNo}-${r.quota}-${r.hospital}`}
                      maxHeight="28rem"
                      columns={[
                        { key: "n", header: "#", align: "right", cell: (r) => r.preferenceNo },
                        { key: "s", header: "Quota · speciality · hospital", cell: (r) => `${r.quota} · ${r.speciality} · ${r.hospital}` },
                        { key: "b", header: "Certificate bonus", align: "right", tone: "mono", cell: (r) => <>{formatMarks(r.bonus)}<span className="block text-xs text-subtle">{BONUS_SOURCE[r.bonusSource] ?? r.bonusSource}</span></> },
                        { key: "pa", header: "Parent", align: "right", tone: "mono", cell: (r) => (r.parent ? formatMarks(r.parent) : "—") },
                        { key: "m", header: "Merit", align: "right", tone: "mono", cell: (r) => (r.mark == null ? "—" : formatMarks(r.mark)) },
                      ]}
                    />
                  </div>
                </details>
              ))}
              {sim.programmes.every((p) => !p.preferences.length) ? <p className="text-sm text-muted">No preferences in the simulation data.</p> : null}
            </div>
          </Card>

          <Card>
            <CardHeader title="Consent replies" description="As fetched from the portal after each round." />
            <DataTable
              caption="Consent replies"
              rows={sim.consent}
              rowKey={(r) => `${r.round}-${r.program}-${r.preferenceNo}-${r.quota}`}
              empty={<p className="text-sm text-muted">No consent replies imported for this applicant.</p>}
              columns={[
                { key: "r", header: "Round", cell: (r) => r.round },
                { key: "s", header: "Seat", cell: (r) => [r.program, r.quota, r.speciality, r.hospital].filter(Boolean).join(" · ") },
                { key: "p", header: "Pref.", align: "right", cell: (r) => (r.preferenceNo ? `#${r.preferenceNo}` : "—") },
                { key: "c", header: "Reply", cell: (r) => <Badge tone={r.status === "Accepted" ? "success" : r.status === "Rejected" ? "danger" : "warning"}>{r.status}</Badge> },
              ]}
            />
          </Card>

          <Card>
            <CardHeader title="Corrections" description="Corrections change what the simulation uses from its next run. Each is staged first and published from Changes to review; the imported data is never edited." />
            {corrections.length ? (
              <ul className="mb-5 grid gap-3">
                {corrections.map((c) => (
                  <li key={c.id} className={cn("grid gap-1 rounded-2xl border border-line p-3 text-sm", c.revokedAt && "opacity-60")}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{CORRECTION_LABELS[c.field as CorrectionField] ?? c.field}{c.program ? ` · ${c.program}` : ""}</span>
                      <span className="font-mono tabular-nums">→ {v(c.field, c.value)}</span>
                      {c.revokedAt ? <Badge>withdrawn</Badge> : <Badge tone="warning">in force</Badge>}
                    </div>
                    <p className="text-xs text-subtle">
                      {c.createdBy}, {formatUtc(c.createdAt)} UTC: “{c.reason}”{c.changeId ? <> · <Link href={`/admin/changes/${c.changeId}`} className="text-signal hover:underline">change</Link></> : null}
                      {c.revokedAt ? ` · withdrawn by ${c.revokedBy}, ${formatUtc(c.revokedAt)} UTC` : ""}
                    </p>
                    {c.revokedAt ? null : <RevokeCorrection id={c.id} />}
                  </li>
                ))}
              </ul>
            ) : null}
            <CorrectionForm induction={induction} applicantId={applicantId} programs={sim.programmes.map((p) => p.program)} />
          </Card>
        </>
      ) : null}
    </AreaPage>
  );
}
