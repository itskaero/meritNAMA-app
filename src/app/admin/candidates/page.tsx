import { AreaPage } from "@/components/area-page";
import { whenDatabaseDown } from "@/components/database-unavailable";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { getSession, requireSection } from "@/lib/auth/session";
import { listLinkRequests } from "@/lib/data/candidates";
import { getDb } from "@/lib/db/client";
import { formatMarks, formatUtc } from "@/lib/format";
import { findSection } from "@/lib/navigation";
import { ReviewControls } from "./forms";

export const metadata = { title: "Candidates" };
export const dynamic = "force-dynamic";

export default async function AdminCandidatesPage({ searchParams }: { searchParams: Promise<{ decided?: string }> }) {
  await requireSection("/admin/candidates");
  const s = findSection("/admin/candidates");
  const frame = { area: "admin" as const, trail: [{ label: s.label }], title: "Records to verify", description: "Candidates asking to link their account to an applicant record. Accounts whose sign-in email matches the official record are linked automatically and do not appear here." };
  const down = await whenDatabaseDown(frame);
  if (down) return down;
  const { pending, recent } = await listLinkRequests(getDb(), await getSession());
  const { decided } = await searchParams;

  return (
    <AreaPage {...frame}>
      {decided === "verified" ? <Notice title="Approved: the account is verified." /> : decided === "rejected" ? <Notice title="Rejected. The candidate sees your reason on their profile." /> : null}
      <Card>
        <CardHeader title={`Waiting (${pending.length})`} description="Check the proof shows the same applicant ID. The PMDC hint compares what they typed with the record; it is not proof on its own." />
        {pending.length === 0 ? (
          <EmptyState title="Nothing to verify">New requests appear here.</EmptyState>
        ) : (
          <ul className="grid gap-4">
            {pending.map((p) => (
              <li key={p.id} className="grid gap-3 rounded-2xl border border-line bg-canvas p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-base font-semibold">{p.applicantId}</span>
                  {p.pmdcMatches === true ? <Badge tone="success">PMDC matches the record</Badge> : p.pmdcMatches === false ? <Badge tone="danger">PMDC does not match</Badge> : <Badge>No PMDC on record</Badge>}
                  <span className="text-xs text-subtle">{p.email} · asked {formatUtc(p.createdAt)}</span>
                </div>
                {p.rounds.length ? (
                  <p className="text-sm text-muted">
                    On record: {p.rounds.map((r) => `I${r.induction} R${r.roundNo} ${r.program} ${r.quota}, ${r.speciality} (${formatMarks(r.marks)})`).join(" · ")}
                  </p>
                ) : null}
                <a href={`/admin/candidates/evidence/${p.id}`} target="_blank" rel="noreferrer" className="text-sm font-semibold text-signal hover:underline">
                  Open the proof ({p.evidenceType === "application/pdf" ? "PDF" : "image"}) ↗
                </a>
                <ReviewControls id={p.id} />
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <CardHeader title="Recently decided" />
        {recent.length === 0 ? (
          <p className="text-sm text-muted">No decisions yet.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {recent.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 py-2.5">
                <span className="font-mono">{r.applicantId}</span>
                <Badge tone={r.status === "verified" ? "success" : "danger"}>{r.status === "verified" ? "Verified" : "Rejected"}</Badge>
                <span className="text-muted">{r.method === "email" ? "matched by email" : `by ${r.reviewedBy}`}</span>
                <span className="text-subtle">{r.email} · {formatUtc(r.reviewedAt)}{r.reason ? ` · ${r.reason}` : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </AreaPage>
  );
}
