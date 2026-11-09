import { Card, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Notice } from "@/components/ui/notice";
import { fieldClass } from "@/components/ui/styles";
import type { baseMarksWorkbench } from "@/lib/data/simulation";
import { FORMULA_FUNCTIONS } from "@/lib/engine/formula";
import { formatMarks } from "@/lib/format";
import { SaveFormulaForm } from "./forms";

type Workbench = NonNullable<Awaited<ReturnType<typeof baseMarksWorkbench>>>;

const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2));

/**
 * Base marks as a formula over the induction's imported parameters: what is available,
 * a trial against every candidate (aggregates only), and saving it as a new draft.
 */
export function FormulaCard({ id, induction, current, onMissing, wb, tried }: {
  id: string; induction: number; current: string | null; onMissing: "imported" | "zero";
  wb: Workbench | null; tried: { formula: string; onMissing: "imported" | "zero" } | null;
}) {
  const t = wb?.trial ?? null;
  return (
    <Card id="formula">
      <CardHeader
        title="Base marks"
        description={current
          ? `This version works base marks out as ${current}. Staff corrections still win.`
          : "This version uses base marks as imported. A formula over the imported parameters can recompute them, for example to catch records whose total does not match their components."}
      />
      {!wb ? (
        <Notice title="No simulation data">Import induction {induction}&apos;s data under Processing to see the parameters a formula can use.</Notice>
      ) : (
        <div className="grid gap-5">
          <form method="get" action={`/admin/rules/${id}#formula`} className="grid gap-3">
            <label className="grid gap-1.5 text-sm font-medium">
              Formula
              <textarea name="formula" rows={2} defaultValue={tried?.formula ?? current ?? wb.suggestion ?? ""} spellCheck={false} className={`${fieldClass} font-mono text-sm`} />
            </label>
            <p className="text-xs text-subtle">
              Parameters below, numbers, + − × ÷, brackets, comparisons (giving 1 or 0), &amp;&amp; and ||, and {FORMULA_FUNCTIONS.map((f) => `${f}()`).join(", ")}. Example: <code className="font-mono">degree + houseJob + min(experience, 5) + mdcat</code>
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <label className="grid gap-1.5 text-sm font-medium">
                A candidate missing a parameter
                <select name="onMissing" defaultValue={tried?.onMissing ?? onMissing} className={fieldClass}>
                  <option value="imported">keeps the imported marks</option>
                  <option value="zero">gets 0</option>
                </select>
              </label>
              <button type="submit" className="h-11 rounded-full bg-signal px-5 text-sm font-semibold text-signal-ink hover:bg-signal-strong">Try on all {wb.candidates.toLocaleString("en-US")} candidates</button>
            </div>
          </form>

          {t && !t.ok ? <Notice tone="warning" title="The formula cannot be used">{t.error}</Notice> : null}
          {t && t.ok ? (
            <div className="grid gap-4 rounded-2xl border border-line p-4">
              <p className="text-sm">
                <span className="font-mono">{t.formula}</span> gives <strong>{t.differ.toLocaleString("en-US")}</strong> of {t.candidates.toLocaleString("en-US")} candidates different base marks from the imported ones
                {t.differ ? ` (from ${formatMarks(t.maxDown)} to +${formatMarks(t.maxUp)})` : ""}.
                {t.missing ? ` ${t.missing.toLocaleString("en-US")} lack a parameter and ${t.onMissing === "imported" ? "keep the imported marks" : "get 0"}.` : ""}
              </p>
              <ul className="grid gap-1.5 text-sm sm:grid-cols-3">
                {t.buckets.map((b) => (
                  <li key={b.label} className="flex justify-between gap-3 rounded-xl bg-elevated/60 px-3 py-2"><span className="text-muted">{b.label}</span><span className="font-mono tabular-nums">{b.count.toLocaleString("en-US")}</span></li>
                ))}
              </ul>
              {t.formula === current && t.onMissing === onMissing ? (
                <p className="text-sm text-muted">This is already this version&apos;s formula.</p>
              ) : (
                <SaveFormulaForm id={id} formula={t.formula} onMissing={t.onMissing} label="Save as a new draft with this formula" />
              )}
              <p className="text-xs text-subtle">After saving, use <em>Preview the effect</em> on the new draft to see which seats would change.</p>
            </div>
          ) : null}
          {current ? (
            <details className="text-sm">
              <summary className="cursor-pointer text-signal">Go back to imported base marks</summary>
              <div className="mt-3"><SaveFormulaForm id={id} formula="" onMissing="imported" label="Save as a new draft without a formula" /></div>
            </details>
          ) : null}

          <DataTable
            caption="Parameters a formula can use"
            rows={wb.parameters}
            rowKey={(p) => p.name}
            maxHeight="22rem"
            columns={[
              { key: "n", header: "Parameter", tone: "mono", cell: (p) => p.name },
              { key: "s", header: "From", cell: (p) => p.source },
              { key: "c", header: "Candidates", align: "right", cell: (p) => p.candidates.toLocaleString("en-US") },
              { key: "r", header: "Range", align: "right", tone: "mono", cell: (p) => `${fmt(p.min)} – ${fmt(p.max)}` },
              { key: "m", header: "Mean", align: "right", tone: "mono", cell: (p) => fmt(p.mean) },
            ]}
          />
          {wb.parameters.every((p) => p.source !== "data") ? (
            <p className="text-xs text-subtle">Only the imported total and certificate figures are available: the data was imported before parameters were read. Import it again to add the component marks.</p>
          ) : null}
        </div>
      )}
    </Card>
  );
}
