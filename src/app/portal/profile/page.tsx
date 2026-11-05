import Link from "next/link";
import { AreaPage } from "@/components/area-page";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Notice } from "@/components/ui/notice";
import { getSession, requireCan } from "@/lib/auth/session";
import { myLink, myMerit, type MyAllocation } from "@/lib/data/candidates";
import { getDb } from "@/lib/db/client";
import { formatMarks } from "@/lib/format";
import { LinkRequestForm } from "./forms";

export const metadata = { title: "Merit profile" };
export const dynamic = "force-dynamic";

const consentTone = (c: string) => (c === "Accepted" ? "success" : c === "Rejected" ? "danger" : "neutral") as "success" | "danger" | "neutral";

export default async function PortalProfilePage() {
  await requireCan("portal");
  const db = getDb();
  const session = await getSession();
  const [link, merit] = await Promise.all([myLink(db, session), myMerit(db, session)]);
  const latest = merit?.rows[0];

  return (
    <AreaPage
      area="portal"
      trail={[{ label: "Merit profile" }]}
      title="Merit profile"
      description="Your own rows from the official merit lists, once your account is linked to your applicant record. Nobody else sees them."
    >
      <div className="grid min-w-0 gap-5">
        {link.status === "verified" && merit ? (
          <>
            <Card className="mn-rise">
              <div className="flex flex-wrap items-center gap-3">
                <Badge tone="success">Verified</Badge>
                <p className="text-sm text-muted">
                  Linked to applicant <span className="font-mono text-ink">{merit.applicantId}</span>
                  {link.method === "email" ? " automatically: your sign-in email matches the official record." : " by a verifier."}
                </p>
              </div>
              {latest ? (
                <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-subtle">Latest marks · induction {latest.induction}, round {latest.roundNo}</p>
                    <p className="mt-1 font-display text-4xl font-bold tabular-nums">{formatMarks(latest.marks)}</p>
                  </div>
                  <ButtonLink href={`/portal/finder?marks=${latest.marks.toFixed(4)}&induction=${latest.induction}`} size="sm">Open the score finder with these marks</ButtonLink>
                </div>
              ) : null}
            </Card>
            <Card>
              <CardHeader title="My merit" description="Every round you appear in. Closing is the lowest marks allocated to the same programme, quota, speciality and hospital in that round." />
              <DataTable<MyAllocation>
                caption="Your allocations by round"
                rows={merit.rows}
                rowKey={(r) => `${r.induction}-${r.roundNo}-${r.speciality}-${r.hospital}`}
                empty={<p className="text-sm text-muted">Your record is linked, but you do not appear in an imported round yet.</p>}
                columns={[
                  { key: "round", header: "Round", cell: (r) => <Link href={`/portal/history/${r.induction}/rounds/${r.roundNo}`} className="font-semibold hover:underline">I{r.induction} · R{r.roundNo}</Link> },
                  { key: "track", header: "Programme · quota", tone: "muted", cell: (r) => `${r.program} · ${r.quota}` },
                  { key: "spec", header: "Speciality", cell: (r) => r.speciality },
                  { key: "hosp", header: "Hospital", tone: "muted", cell: (r) => r.hospital },
                  { key: "pref", header: "Pref.", align: "right", tone: "mono", cell: (r) => r.preferenceNo },
                  { key: "marks", header: "Marks", align: "right", tone: "mono", cell: (r) => formatMarks(r.marks) },
                  { key: "closing", header: "Closing", align: "right", tone: "mono", cell: (r) => formatMarks(r.closing) },
                  { key: "consent", header: "Consent", cell: (r) => <Badge tone={consentTone(r.consent)}>{r.consent}</Badge> },
                ]}
              />
            </Card>
          </>
        ) : (
          <>
            {link.status === "pending" ? (
              <Notice title="Waiting for a verifier">
                You asked to link applicant <span className="font-mono">{link.applicantId}</span>. A verifier checks the document you sent; this page updates when they decide.
              </Notice>
            ) : null}
            {link.status === "rejected" ? (
              <Notice tone="warning" title="Your last request was not approved">
                {link.reason ?? "No reason given."} You can send a new request below.
              </Notice>
            ) : null}
            <Card>
              <CardHeader
                title="Link your merit record"
                description="Verified candidates see their own rows, get their marks filled in on the score finder, and can post in the community."
              />
              <ol className="mb-5 grid list-decimal gap-1.5 pl-5 text-sm text-muted">
                <li>Signing in with the email from your PHF application links you automatically.</li>
                <li>Otherwise, send your applicant ID, PMDC number and proof. A verifier approves it.</li>
              </ol>
              {link.status === "pending" ? null : <LinkRequestForm />}
            </Card>
          </>
        )}
      </div>
    </AreaPage>
  );
}
