import Link from "next/link";
import { ChancesTabs } from "@/components/chances-tabs";
import { AreaPage } from "@/components/area-page";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { fieldClass } from "@/components/ui/styles";
import { getSession } from "@/lib/auth/session";
import { calculatorPolicies } from "@/lib/data/policies";
import { checkDatabase, getDb } from "@/lib/db/client";
import type { PolicyComponent } from "@/lib/domain/scoring-policy";
import { policyInductions } from "@/lib/domain/scoring-policy";
import { computeScore, includedComponents, type ScoreInputs } from "@/lib/engine/score";

export const metadata = { title: "Merit calculator" };
export const dynamic = "force-dynamic";

type Params = Record<string, string | undefined>;

const num = (v: string | undefined) => {
  if (v == null || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Form fields → calculator inputs. Field names: c_<component key> (+ _kind, _tier, _pct for the FCPS/JCAT choice). */
function readInputs(components: PolicyComponent[], sp: Params): ScoreInputs {
  const out: ScoreInputs = {};
  for (const c of components) {
    const f = `c_${c.key}`;
    if (c.type === "boolean") out[c.key] = sp[f] === "1";
    else if (c.type === "fcps_jcat_combo") {
      const kind = sp[`${f}_kind`];
      const tier = num(sp[`${f}_tier`]);
      const pct = num(sp[`${f}_pct`]);
      out[c.key] = kind === "fcps" && tier != null ? { kind, tier } : kind === "jcat" && pct != null ? { kind, pct } : kind === "none" ? { kind } : null;
    } else out[c.key] = num(sp[f]);
  }
  return out;
}

function hint(c: PolicyComponent): string {
  switch (c.type) {
    case "percentage": return `Your percentage · scaled to ${c.max_marks} marks`;
    case "years": return `${c.per_year} mark(s) a year · at most ${Math.floor(c.max_marks / (c.per_year || 1))} years`;
    case "count": return `${c.per_item} mark(s) each · at most ${Math.floor(c.max_marks / (c.per_item || 1))}`;
    case "score": return `Out of ${c.score_max || 1100} · scaled to ${c.max_marks} marks`;
    case "months": return `${c.per_3_months || 1.25} mark(s) per completed 3 months · at most ${Math.round((c.max_marks / (c.per_3_months || 1.25)) * 3)} months`;
    case "boolean": return `${c.max_marks} marks if yes`;
    default: return `At most ${c.max_marks} marks`;
  }
}

function Field({ c, sp }: { c: PolicyComponent; sp: Params }) {
  const f = `c_${c.key}`;
  const input = (() => {
    switch (c.type) {
      case "boolean":
        return (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name={f} value="1" defaultChecked={sp[f] === "1"} className="h-4 w-4 accent-[var(--color-signal)]" /> Yes
          </label>
        );
      case "tiered_select":
        return (
          <select name={f} defaultValue={sp[f] ?? ""} className={fieldClass} aria-label={c.label}>
            <option value="">— Select —</option>
            {(c.tiers ?? []).map((t, i) => <option key={i} value={i}>{t.label}</option>)}
          </select>
        );
      case "fcps_jcat_combo":
        return (
          <div className="grid gap-2 sm:grid-cols-3">
            <select name={`${f}_kind`} defaultValue={sp[`${f}_kind`] ?? ""} className={fieldClass} aria-label={`${c.label}: qualification`}>
              <option value="">— Qualification —</option>
              <option value="fcps">FCPS Part-I</option>
              <option value="jcat">JCAT</option>
              <option value="none">Neither</option>
            </select>
            <select name={`${f}_tier`} defaultValue={sp[`${f}_tier`] ?? ""} className={fieldClass} aria-label={`${c.label}: FCPS Part-I attempt`}>
              <option value="">FCPS attempt…</option>
              {(c.fcps_tiers ?? []).map((t, i) => <option key={i} value={i}>{t.label} — {t.marks} mark{t.marks !== 1 ? "s" : ""}</option>)}
            </select>
            <input name={`${f}_pct`} defaultValue={sp[`${f}_pct`] ?? ""} inputMode="decimal" placeholder="JCAT %" className={fieldClass} aria-label={`${c.label}: JCAT percentage`} />
          </div>
        );
      default:
        return <input name={f} defaultValue={sp[f] ?? ""} inputMode="decimal" placeholder={c.type === "percentage" ? "e.g. 72.5" : c.type === "years" ? "Years" : c.type === "months" ? "Months" : ""} className={cn(fieldClass, "max-w-48")} aria-label={c.label} />;
    }
  })();
  return (
    <div className="grid gap-1.5 rounded-2xl bg-elevated/60 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium">{c.label}</span>
        <span className="font-mono text-xs text-muted">{c.max_marks} marks</span>
      </div>
      {c.description ? <p className="text-xs text-subtle">{c.description}</p> : null}
      {input}
      <p className="text-xs text-subtle">
        {hint(c)}
        {c.type === "fcps_jcat_combo" && c.jcat_thresholds ? ` · JCAT: ${[...c.jcat_thresholds].sort((a, b) => b.min - a.min).map((t) => `${t.label} → ${t.value}`).join(", ")}` : ""}
      </p>
    </div>
  );
}

export default async function CalculatorPage({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const session = (await getSession())!;
  const page = (children: React.ReactNode) => (
    <AreaPage area="portal" trail={[{ label: "My chances", href: "/portal/finder" }, { label: "Calculate my marks" }]} title="Calculate my marks" description="Enter your own details to work out your merit marks under the published scoring policy. This is your estimate, not your official merit.">
      <ChancesTabs current="/portal/calculator" />
      {children}
    </AreaPage>
  );
  if ((await checkDatabase()) !== "ok") return page(<EmptyState title="Not available right now">The scoring policies cannot be reached. Try again later.</EmptyState>);
  const policies = await calculatorPolicies(getDb(), session);
  if (!policies.length) return page(<EmptyState title="No scoring policy yet">An administrator has not imported the scoring policies yet.</EmptyState>);
  const chosen = policies.find((p) => p.key === sp.policy) ?? policies[0]!;
  const components = includedComponents(chosen.policy);
  const entered = Object.keys(sp).some((k) => k.startsWith("c_"));
  const result = entered ? computeScore(chosen.policy, readInputs(components, sp)) : null;
  const inductions = policyInductions(chosen.policy);

  return page(
    <>
      <Card>
        <CardHeader title="Scoring policy" description={chosen.policy.notes ?? undefined} />
        <div className="flex flex-wrap gap-2">
          {policies.map((p) => (
            <Link key={p.key} href={`/portal/calculator?policy=${p.key}`} className={cn("rounded-full px-3.5 py-1.5 text-sm ring-1 ring-line-strong", p.key === chosen.key ? "bg-ink text-canvas" : "text-muted hover:text-ink")}>
              {p.policy.label}
              {p.active ? " · current" : ""}
            </Link>
          ))}
        </div>
        <p className="mt-3 text-sm text-muted">
          Induction{inductions.length > 1 ? "s" : ""} {inductions.join(", ")} · {chosen.policy.total_marks} marks in total · {components.length} components
        </p>
      </Card>

      {chosen.policy.eligibility?.length ? (
        <Card>
          <CardHeader title="Can you apply?" description="What this policy asks of a candidate. Tick them off for yourself; nothing is stored." />
          <ul className="grid gap-2 text-sm">
            {chosen.policy.eligibility.map((e, i) => (
              <li key={i}>
                <label className="flex items-start gap-2">
                  <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--color-signal)]" />
                  <span>{e}</span>
                </label>
              </li>
            ))}
          </ul>
          {chosen.policy.policy_ref ? <p className="mt-3 text-xs text-subtle">Source: {chosen.policy.policy_ref}. Always check the official notification.</p> : null}
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title="Your details" description="Leave out what does not apply. Nothing you enter is stored." />
          <form method="get" action="/portal/calculator" className="grid gap-3">
            <input type="hidden" name="policy" value={chosen.key} />
            {components.map((c) => <Field key={c.key} c={c} sp={sp} />)}
            <div className="flex gap-2">
              <button type="submit" className="rounded-full bg-signal px-5 py-2.5 text-sm font-semibold text-signal-ink hover:bg-signal-strong">Calculate</button>
              {entered ? <ButtonLink href={`/portal/calculator?policy=${chosen.key}`} variant="ghost">Clear</ButtonLink> : null}
            </div>
          </form>
        </Card>

        <Card className="self-start xl:sticky xl:top-4">
          <CardHeader title="Your merit" action={result ? <Badge tone="simulated">estimate</Badge> : undefined} />
          {result ? (
            <div className="grid gap-4">
              <p className="font-mono text-4xl tabular-nums">
                {result.total.toFixed(2)} <span className="text-lg text-muted">/ {result.totalMarks}</span>
              </p>
              <p className="text-sm text-muted">{result.percent.toFixed(1)}% of the total</p>
              <ul className="grid gap-2.5">
                {result.lines.map((l) => (
                  <li key={l.key} className="grid gap-1 text-sm">
                    <div className="flex items-baseline justify-between gap-3">
                      <span>{l.label}</span>
                      <span className="font-mono tabular-nums">{l.contribution.toFixed(2)} <span className="text-muted">/ {l.max}</span></span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-elevated" aria-hidden>
                      <div className="h-full rounded-full bg-signal" style={{ width: `${l.max ? Math.min(100, (l.contribution / l.max) * 100) : 0}%` }} />
                    </div>
                    <span className="text-xs text-subtle">{l.value}</span>
                  </li>
                ))}
              </ul>
              <ButtonLink href={`/portal/finder?marks=${result.total}&total=${result.totalMarks}`}>See where {result.total.toFixed(2)} reaches →</ButtonLink>
            </div>
          ) : (
            <Notice title="Enter your details">Fill in the components on the left and press Calculate. Your marks then open in the score finder in one click.</Notice>
          )}
        </Card>
      </div>
    </>,
  );
}
