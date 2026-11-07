import { notFound } from "next/navigation";
import { AreaPage } from "@/components/area-page";
import { ActionBar } from "@/components/ui/action-bar";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { getSession, requireSection } from "@/lib/auth/session";
import { getRulesVersion, resolveFor, scoringPolicyForInduction } from "@/lib/data/allocation-rules";
import { getDb } from "@/lib/db/client";
import { allocationRulesSchema } from "@/lib/engine/rules";
import { isUuid } from "@/lib/format";
import { ActivateRulesForm, RulesDraftForm } from "../forms";
import { RulesSummary } from "../rules-summary";
import { ImpactPreview } from "@/components/impact-preview";
import { ButtonLink } from "@/components/ui/button";
import { firstRoundImpact } from "@/lib/data/simulation";

export const metadata = { title: "Allocation rules version" };
export const dynamic = "force-dynamic";

export default async function RulesVersionPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; impact?: string }>;
}) {
  await requireSection("/admin/rules");
  const { id } = await params;
  const { saved, impact } = await searchParams;
  if (!isUuid(id)) notFound();
  const db = getDb();
  const session = await getSession();
  const row = await getRulesVersion(db, session, id);
  if (!row) notFound();

  const rules = allocationRulesSchema.parse(row.definition);
  const policy = await scoringPolicyForInduction(db, row.inductionId);
  const { resolved, problem } = resolveFor(rules, policy?.definition ?? null);
  const effect = impact && resolved && row.status !== "active" ? await firstRoundImpact(db, session, { induction: row.inductionId, next: resolved }) : null;

  return (
    <AreaPage
      area="admin"
      trail={[{ label: "Allocation rules", href: "/admin/rules" }, { label: `Induction ${row.inductionId} v${row.version}` }]}
      title={rules.label}
      description={`Induction ${row.inductionId}, version ${row.version} · saved by ${row.createdBy} · scoring policy ${policy ? `${policy.policyKey} v${policy.version}` : "none covers this induction"}`}
      status={<Badge tone={row.status === "active" ? "current" : "neutral"} className="mx-2">{row.status}</Badge>}
    >
      {saved ? <Notice title="Saved as a new draft">This page shows the version you just created. It takes effect once activated and published.</Notice> : null}

      <ActionBar
        actions={[
          { label: "Edit as new draft", href: "#edit", icon: "sliders", primary: true },
          ...(row.status === "active" ? [] : [{ label: "Make active", href: "#activate", icon: "upload" as const }]),
          { label: "All inductions", href: "/admin/rules", icon: "list" },
        ]}
      />

      <Card>
        <CardHeader title="In words" description="How the simulation would run for this induction under this version and its scoring policy." />
        {resolved ? <RulesSummary resolved={resolved} /> : <Notice tone="warning" title="Cannot be applied yet">{problem}</Notice>}
      </Card>

      {row.status === "active" || !resolved ? null : effect ? <ImpactPreview impact={effect} /> : (
        <Card>
          <CardHeader title="Effect on placement" description={`Run induction ${row.inductionId}'s round 1 under the rules in force and under this version, and compare the lists. Takes a few seconds.`} />
          <div><ButtonLink href={`/admin/rules/${id}?impact=1`} variant="secondary" size="sm" prefetch={false}>Preview the effect</ButtonLink></div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card id="edit">
          <CardHeader title="Edit" description={`Changes are saved as a new draft version for induction ${row.inductionId}.`} />
          <RulesDraftForm induction={row.inductionId} fixedInduction definition={JSON.stringify(row.definition, null, 2)} />
        </Card>
        <Card id="activate" className="self-start">
          <CardHeader
            title="Activation"
            description={row.status === "active"
              ? "These are the induction's active rules. Activate another version to replace them."
              : "Activation is staged: review the settings that change, then publish. The previous rules can be restored with one click."}
          />
          {row.status === "active" ? null : <ActivateRulesForm id={row.id} />}
        </Card>
      </div>
    </AreaPage>
  );
}
