import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { AreaPage } from "@/components/area-page";
import { getSession } from "@/lib/auth/session";
import { isUuid } from "@/lib/format";
import { getPolicyVersion } from "@/lib/data/policies";
import { getDb } from "@/lib/db/client";
import { includedMaxTotal, policyInductions, policySchema } from "@/lib/domain/scoring-policy";
import { ActivateForm, EditDraftForm } from "../forms";

export const metadata = { title: "Scoring policy version" };
export const dynamic = "force-dynamic";

export default async function PolicyVersionPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { id } = await params;
  const { saved } = await searchParams;
  if (!isUuid(id)) notFound();
  const row = await getPolicyVersion(getDb(), await getSession(), id);
  if (!row) notFound();

  const policy = policySchema.parse(row.definition);
  const inductions = policyInductions(policy);

  return (
    <AreaPage
      area="admin"
      trail={[{ label: "Scoring policies", href: "/admin/policies" }, { label: `${row.policyKey} v${row.version}` }]}
      title={policy.label}
      description={`Policy ${row.policyKey}, version ${row.version} · induction${inductions.length > 1 ? "s" : ""} ${inductions.join(", ")} · ${policy.total_marks} marks`}
      status={<Badge tone={row.status === "active" ? "current" : "neutral"} className="mx-2">{row.status}</Badge>}
    >
      {saved ? <Notice title="Saved as a new draft">This page shows the version you just created.</Notice> : null}

      <Card>
        <CardHeader title="Components" description={`Included components sum to ${includedMaxTotal(policy.components)} of ${policy.total_marks}.`} />
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {policy.components.map((c) => (
            <li key={c.key} className="rounded-xl bg-elevated px-4 py-3 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-medium">{c.label}</span>
                <span className="tabular-nums text-muted">{c.max_marks}</span>
              </div>
              <p className="mt-1 font-mono text-xs text-subtle">
                {c.key} · {c.type}{c.included === false ? " · excluded" : ""}
              </p>
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title="Edit" description="Changes are saved as a new draft version of this policy key." />
          <EditDraftForm policyKey={row.policyKey} definition={JSON.stringify(row.definition, null, 2)} />
        </Card>
        <Card className="self-start">
          <CardHeader
            title="Activation"
            description={row.status === "active"
              ? "This is the active policy. Activate another version to replace it."
              : "Activating retires the currently active version. The calculator and exports use the active version."}
          />
          {row.status === "active" ? null : <ActivateForm id={row.id} />}
        </Card>
      </div>
    </AreaPage>
  );
}
