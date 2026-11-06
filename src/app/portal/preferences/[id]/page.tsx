import { notFound } from "next/navigation";
import { AreaPage } from "@/components/area-page";
import { OptionSearch } from "@/components/preferences/option-search";
import { OutcomePanel } from "@/components/preferences/outcome-panel";
import { PreferenceEditor } from "@/components/preferences/preference-editor";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import { getList } from "@/lib/data/preferences";
import { getDb } from "@/lib/db/client";
import { UserFacingError } from "@/lib/errors";
import { isUuid } from "@/lib/format";
import { DeleteListButton, MarksForm, RenameForm } from "../forms";
import { duplicateListAction } from "../actions";
import { PrintButton } from "./print-button";

export const metadata = { title: "Preference list" };
export const dynamic = "force-dynamic";

export default async function PreferenceListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const v = await getList(getDb(), await getSession(), id).catch((e) => {
    if (e instanceof UserFacingError) return null;
    throw e;
  });
  if (!v) notFound();
  // Remount the editor when options or statuses change, but not for a reorder it made itself.
  const rowsKey = v.rows.map((r) => `${r.speciality}:${r.hospital}:${r.status}`).sort().join("|");

  return (
    <AreaPage
      area="portal"
      trail={[{ label: "Preference planner", href: "/portal/preferences" }, { label: v.list.name }]}
      title={v.list.name}
      description={`${v.list.program} · ${v.list.quota}${v.induction ? ` · checked against induction ${v.induction.id} (out of ${v.induction.total})` : ""}`}
    >
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <RenameForm id={v.list.id} name={v.list.name} />
        <form action={duplicateListAction}><input type="hidden" name="id" value={v.list.id} /><button type="submit" className="h-9 rounded-full px-4 text-sm font-semibold text-muted hover:bg-hover hover:text-ink">Duplicate</button></form>
        <ButtonLink href={`/portal/preferences/${v.list.id}/export`} size="sm" variant="ghost" prefetch={false}>Export CSV</ButtonLink>
        <PrintButton />
        <DeleteListButton id={v.list.id} name={v.list.name} />
      </div>
      <Card className="print:hidden">
        <MarksForm id={v.list.id} marks={v.marks?.marks ?? null} total={v.marks?.total ?? v.induction?.total ?? null} from={v.marks?.from ?? null} />
      </Card>
      <OutcomePanel summary={v.summary} analysis={v.analysis} marks={v.marks ? { pct: v.marks.pct, from: v.marks.from } : null} />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card className="min-w-0">
          <CardHeader title={`Your order (${v.rows.length})`} description="First choice at the top. The most likely placement is outlined in green." />
          {v.rows.length ? (
            <PreferenceEditor key={rowsKey} listId={v.list.id} rows={v.rows} likely={v.analysis.likely} unreached={v.analysis.unreached} total={v.induction?.total ?? null} />
          ) : <p className="text-sm text-muted">Nothing here yet. Add options on the right.</p>}
          <p className="mt-3 hidden text-xs print:block">meritNAMA planning aid, not an official PHF submission. Printed {new Date().toISOString().slice(0, 10)}.</p>
        </Card>
        <Card className="min-w-0 content-start print:hidden">
          <OptionSearch listId={v.list.id} options={v.options} />
        </Card>
      </div>
    </AreaPage>
  );
}
