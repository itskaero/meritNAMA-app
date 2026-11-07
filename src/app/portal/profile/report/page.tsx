import Link from "next/link";
import { AreaPage } from "@/components/area-page";
import { whenDatabaseDown } from "@/components/database-unavailable";
import { PrintButton } from "@/components/print-button";
import { Card, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Notice } from "@/components/ui/notice";
import { getSession } from "@/lib/auth/session";
import { myMerit, type MyAllocation } from "@/lib/data/candidates";
import { computeOptions, finderOptions, listShortlist } from "@/lib/data/finder";
import { myDataChecklist } from "@/lib/data/simulation";
import { getDb } from "@/lib/db/client";
import { formatMarks, formatUtc } from "@/lib/format";
import { DataChecklist } from "../data-checklist";

export const metadata = { title: "Merit report" };
export const dynamic = "force-dynamic";

/**
 * The candidate's own merit report, laid out for printing or saving as PDF from the
 * browser: their allocations, what the app holds about them, and their shortlist
 * against the latest closing merit. Only their own verified record.
 */
export default async function MeritReportPage() {
  const frame = { area: "portal" as const, trail: [{ label: "Merit profile", href: "/portal/profile" }, { label: "Report" }], title: "Merit report" };
  const down = await whenDatabaseDown(frame);
  if (down) return down;
  const db = getDb();
  const session = await getSession();
  const merit = await myMerit(db, session);
  if (!merit) {
    return (
      <AreaPage {...frame}>
        <Notice title="Link your merit record first">The report is made from your own record. Verify it on <Link href="/portal/profile" className="font-semibold text-signal hover:underline">Merit profile</Link>.</Notice>
      </AreaPage>
    );
  }
  const [checklist, shortlist, opts] = await Promise.all([myDataChecklist(db, session), listShortlist(db, session), finderOptions(db, session)]);
  const latest = merit.rows[0];
  const ind = latest ? opts.inductions.find((i) => i.id === latest.induction) : opts.inductions[0];
  // Where the latest marks stand against each shortlisted seat's latest closing merit.
  const standing = new Map<string, { closing: number | null; status: string }>();
  if (latest && ind?.total) {
    for (const key of new Set(shortlist.map((s) => `${s.program}|${s.quota}`))) {
      const [program, quota] = key.split("|") as [string, string];
      const r = await computeOptions(db, { induction: ind.id, program, quota, marks: latest.marks, total: ind.total }).catch(() => null);
      for (const o of r?.options ?? []) standing.set(`${program}|${quota}|${o.speciality}|${o.hospital}`, { closing: o.lastClosing, status: o.status });
    }
  }
  const rounds = new Set(merit.rows.map((r) => `${r.induction}-${r.roundNo}`)).size;
  return (
    <AreaPage {...frame} description={`Applicant ${merit.applicantId} · ${session!.email} · made ${formatUtc(new Date())} UTC. Unofficial: worked out from PHF's published lists.`}>
      <div data-print-hide className="flex flex-wrap items-center gap-3">
        <PrintButton />
        <p className="text-sm text-muted">Choose “Save as PDF” in the print dialog to keep a file.</p>
      </div>
      <Card>
        <CardHeader title="Allocations" description={latest ? `Latest: induction ${latest.induction}, round ${latest.roundNo}, ${formatMarks(latest.marks)} marks.` : "Not on an imported merit list yet."} />
        <DataTable<MyAllocation>
          caption="Allocations by round"
          rows={merit.rows}
          rowKey={(r) => `${r.induction}-${r.roundNo}-${r.speciality}-${r.hospital}`}
          empty={<p className="text-sm text-muted">No allocations yet.</p>}
          columns={[
            { key: "r", header: "Round", cell: (r) => `I${r.induction} R${r.roundNo}` },
            { key: "s", header: "Seat", cell: (r) => `${r.program} · ${r.quota} · ${r.speciality} · ${r.hospital}` },
            { key: "p", header: "Pref.", align: "right", cell: (r) => r.preferenceNo || "—" },
            { key: "m", header: "Marks", align: "right", tone: "mono", cell: (r) => formatMarks(r.marks) },
            { key: "c", header: "Closing", align: "right", tone: "mono", cell: (r) => formatMarks(r.closing) },
            { key: "k", header: "Consent", cell: (r) => r.consent },
          ]}
        />
      </Card>
      {checklist ? <DataChecklist data={checklist} rounds={rounds} /> : null}
      {shortlist.length ? (
        <Card>
          <CardHeader title="Shortlist" description={latest && ind ? `Your latest marks (${formatMarks(latest.marks)}) against each seat's closing merit in induction ${ind.id}.` : "Seats you saved."} />
          <DataTable
            caption="Shortlist"
            rows={shortlist}
            rowKey={(s) => `${s.program}|${s.quota}|${s.speciality}|${s.hospital}`}
            columns={[
              { key: "s", header: "Seat", cell: (s) => `${s.program} · ${s.quota} · ${s.speciality} · ${s.hospital}` },
              { key: "c", header: "Closing", align: "right", tone: "mono", cell: (s) => { const x = standing.get(`${s.program}|${s.quota}|${s.speciality}|${s.hospital}`); return x?.closing == null ? "—" : formatMarks(x.closing); } },
              { key: "t", header: "Standing", cell: (s) => standing.get(`${s.program}|${s.quota}|${s.speciality}|${s.hospital}`)?.status ?? "—" },
            ]}
          />
        </Card>
      ) : null}
      <p className="text-xs text-subtle">meritNAMA · not an official PHF document. Closing merit is the lowest marks allocated to a seat in a published round.</p>
    </AreaPage>
  );
}
