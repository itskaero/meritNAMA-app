import Link from "next/link";
import { AreaPage } from "@/components/area-page";
import { whenDatabaseDown } from "@/components/database-unavailable";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { requireSection } from "@/lib/auth/session";
import { duplicateGroups } from "@/lib/data/candidate-records";
import { getDb } from "@/lib/db/client";
import { CandidateTabs } from "../tabs";

export const metadata = { title: "Possible duplicates" };
export const dynamic = "force-dynamic";

export default async function DuplicatesPage() {
  const session = await requireSection("/admin/candidates/duplicates");
  const frame = {
    area: "admin" as const,
    trail: [{ label: "Candidates", href: "/admin/candidates" }, { label: "Possible duplicates" }],
    title: "Possible duplicates",
    description: "Applicant IDs whose official record gives the same email or PMDC number. Usually one person who applied under two IDs, or a typing error on the portal. The values are compared by keyed hash; they are never stored.",
  };
  const down = await whenDatabaseDown(frame);
  if (down) return down;
  const { groups, total } = await duplicateGroups(getDb(), session);
  return (
    <AreaPage {...frame}>
      <CandidateTabs current="/admin/candidates/duplicates" counts={{ "/admin/candidates/duplicates": total }} />
      <Card>
        <CardHeader title={`${total.toLocaleString("en-US")} group${total === 1 ? "" : "s"}`} description={total > groups.length ? `The ${groups.length} most recent are shown.` : "Most recent induction first."} />
        <DataTable
          caption="Applicant IDs sharing an email or PMDC number"
          rows={groups}
          rowKey={(g) => `${g.by}:${g.applicantIds.join(",")}`}
          empty={<EmptyState title="No duplicates found">Every email and PMDC number on the imported records belongs to one applicant ID.</EmptyState>}
          columns={[
            { key: "by", header: "Same", cell: (g) => (g.by === "email" ? "Email" : "PMDC number") },
            {
              key: "ids", header: "Applicant IDs", cell: (g) => (
                <span className="flex flex-wrap gap-x-3 gap-y-1">
                  {g.applicantIds.map((id) => (
                    <span key={id} className="inline-flex items-center gap-1">
                      <Link href={`/admin/candidates/records/${id}`} className="font-mono font-semibold text-signal hover:underline">{id}</Link>
                      {g.linked.includes(id) ? <Badge tone="success">linked</Badge> : null}
                    </span>
                  ))}
                </span>
              ),
            },
            { key: "i", header: "Last induction", align: "right", cell: (g) => g.lastInduction },
          ]}
        />
        <p className="mt-3 text-xs text-subtle">A linked ID means an account has already been verified for it; another account cannot then claim the same person under a second ID without a verifier noticing here.</p>
      </Card>
    </AreaPage>
  );
}
