import Link from "next/link";
import { AreaPage } from "@/components/area-page";
import { StatTiles } from "@/components/charts/stat-tiles";
import { whenDatabaseDown } from "@/components/database-unavailable";
import { Card, CardHeader } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/page-header";
import { getSession, requireSection } from "@/lib/auth/session";
import { listInductionsWithRounds, listUnmatchedNames, meritOverview } from "@/lib/data/merit";
import { listAllLookups } from "@/lib/data/reference-data";
import { getDb } from "@/lib/db/client";
import { formatUtc, isUuid } from "@/lib/format";
import { findSection } from "@/lib/navigation";
import { AliasForm, DeleteRoundForm, ImportAllForm, ImportRoundsForm, InboxRow } from "./forms";
import { listInbox } from "@/lib/data/inbox";

export const metadata = { title: "Inductions & merit lists" };
export const dynamic = "force-dynamic";

export default async function AdminInductionsPage({ searchParams }: { searchParams: Promise<{ inbox?: string; change?: string; skipped?: string }> }) {
  await requireSection("/admin/inductions");
  const s = findSection("/admin/inductions");
  const down = await whenDatabaseDown({ area: "admin", trail: [{ label: s.label }], title: s.label, description: s.description });
  if (down) return down;
  const db = getDb();
  const session = await getSession();
  const [inductions, overview, unmatched, lookups] = await Promise.all([
    listInductionsWithRounds(db, session),
    meritOverview(db, session),
    listUnmatchedNames(db, session),
    listAllLookups(db, session),
  ]);
  const inbox = await listInbox(db, session).catch(() => null);
  const sp = await searchParams;
  const changeId = isUuid(sp.change) ? sp.change : null;
  const toMap = unmatched.speciality.length + unmatched.hospital.length;

  return (
    <AreaPage
      area="admin"
      trail={[{ label: s.label }]}
      title={s.label}
      description={s.description}
      status={<StatusPill tone={toMap ? "warning" : "live"}>{toMap ? `${toMap} names to map` : "All names mapped"}</StatusPill>}
    >
      <StatTiles
        stats={[
          { label: "Inductions", value: overview.inductions },
          { label: "Rounds", value: overview.rounds },
          { label: "Allocations", value: overview.allocations },
          { label: "Names to map", value: toMap, hint: "Published names with no hospital or speciality" },
        ]}
      />
      <Card id="inbox">
        <CardHeader
          title={`Inbox · ${inbox?.length ?? 0}`}
          description="Files dropped into the inbox folder on the server (inbox/merit, inbox/seats, inbox/policy). New data imports directly; anything that replaces existing data is staged for review. Imported or skipped files move to inbox/processed."
        />
        {sp.inbox ? (
          <div className="mb-4">
            <Notice title={changeId ? `${sp.inbox} replaces existing data, so it was staged for review` : `${sp.inbox} imported`}>
              {changeId ? <Link href={`/admin/changes/${changeId}`} className="font-semibold text-signal hover:underline">Review and publish →</Link> : "The file moved to inbox/processed."}
            </Notice>
          </div>
        ) : sp.skipped ? (
          <div className="mb-4"><Notice title={`${sp.skipped} set aside`}>Moved to inbox/processed without importing.</Notice></div>
        ) : null}
        {inbox === null ? (
          <p className="text-sm text-danger">The inbox folder could not be read. Check that APP_STORAGE_DIR is mounted and writable.</p>
        ) : inbox.length === 0 ? (
          <p className="text-sm text-muted">Nothing waiting. Drop round_&lt;n&gt;.json files into inbox/merit on the server, or upload below.</p>
        ) : (
          <>
          {inbox.filter((i) => i.kind !== "unrecognised" && i.canImport && !i.replaces && !i.issues.length).length > 1 ? (
            <ImportAllForm count={inbox.filter((i) => i.kind !== "unrecognised" && i.canImport && !i.replaces && !i.issues.length).length} />
          ) : null}
          <ul className="grid gap-2">
            {inbox.map((i) => <InboxRow key={`${i.folder}/${i.name}`} item={{ ...i, needsYear: i.kind === "seats" && !i.replaces }} />)}
          </ul>
          </>
        )}
      </Card>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card className="min-w-0">
          <CardHeader title="Imported rounds" />
          {inductions.length === 0 ? (
            <EmptyState title="No rounds imported yet">Import the round files of an induction to publish its merit lists.</EmptyState>
          ) : (
            <div className="grid gap-4">
              {inductions.map((ind) => (
                <section key={ind.id} className="rounded-2xl border border-line">
                  <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3">
                    <h3 className="font-semibold"><Link href={`/portal/history/${ind.id}`} className="hover:underline">Induction {ind.id}</Link> <span className="font-normal text-muted">· {ind.rounds[0]!.cycleName} · {ind.rounds[0]!.cycleCode}</span></h3>
                    <span className="text-xs text-subtle">{ind.maxMarks ? `Out of ${ind.maxMarks}` : "Total marks unknown: import scoring_policy.json"}</span>
                  </header>
                  <ul className="divide-y divide-line">
                    {ind.rounds.map((r) => (
                      <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-sm">
                        <span><Link href={`/portal/history/${ind.id}/rounds/${r.roundNo}`} className="font-medium text-signal hover:underline">Round {r.roundNo}</Link> <span className="text-muted">· {r.allocations.toLocaleString("en-US")} allocations · imported {formatUtc(r.importedAt)} UTC</span></span>
                        <DeleteRoundForm roundId={r.id} label={`round ${r.roundNo}`} />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </Card>
        <Card className="self-start">
          <CardHeader title="Import round files" />
          <ImportRoundsForm />
        </Card>
      </div>
      <Card>
        <CardHeader
          title="Names to map"
          description="Merit files spell some specialities and hospitals differently from the seat matrix. Map each to the right entry so its pages include these allocations. A mapping also applies to future imports."
        />
        {toMap === 0 ? (
          <p className="text-sm text-muted">Every published name matches a hospital or speciality.</p>
        ) : (
          <div className="grid gap-5">
            {unmatched.speciality.length ? (
              <div className="grid gap-2">
                <h3 className="text-sm font-semibold">Specialities</h3>
                {unmatched.speciality.map((u) => <AliasForm key={u.name} kind="speciality" name={u.name} rows={u.rows} options={lookups.specialities} />)}
              </div>
            ) : null}
            {unmatched.hospital.length ? (
              <div className="grid gap-2">
                <h3 className="text-sm font-semibold">Hospitals</h3>
                {unmatched.hospital.slice(0, 60).map((u) => <AliasForm key={u.name} kind="hospital" name={u.name} rows={u.rows} options={lookups.hospitals} />)}
                {unmatched.hospital.length > 60 ? <p className="text-xs text-subtle">{unmatched.hospital.length - 60} more after these are mapped.</p> : null}
              </div>
            ) : null}
          </div>
        )}
      </Card>
    </AreaPage>
  );
}
