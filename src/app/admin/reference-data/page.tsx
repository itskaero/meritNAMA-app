import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/page-header";
import { AreaPage } from "@/components/area-page";
import { getSession } from "@/lib/auth/session";
import { formatUtc } from "@/lib/format";
import { getReferenceOverview, LOOKUP_LABELS } from "@/lib/data/reference-data";
import { checkDatabase, getDb } from "@/lib/db/client";
import { DOCUMENT_KINDS, LOOKUP_KINDS, type DocumentKind } from "@/lib/domain/reference-data";
import { findSection } from "@/lib/navigation";
import { DocumentImportForm, SeatImportForm } from "./forms";

export const metadata = { title: "Reference data" };
export const dynamic = "force-dynamic";


export default async function ReferenceDataPage() {
  const s = findSection("/admin/reference-data");
  const dbStatus = await checkDatabase();
  const overview = dbStatus === "ok" ? await getReferenceOverview(getDb(), await getSession()) : null;

  return (
    <AreaPage
      area="admin"
      trail={[{ label: s.label }]}
      title={s.label}
      description="Seat matrices, hospitals, specialities, quotas and programmes, plus the discipline, specialty-group and CPSP accreditation files the public site uses. Import, edit and export them in the public format."
      status={overview ? <StatusPill tone="live">Live data</StatusPill> : <StatusPill tone="warning">Database unavailable</StatusPill>}
    >
      {!overview ? (
        <EmptyState title="Database not available">Configure DATABASE_URL and run migrations to manage reference data.</EmptyState>
      ) : (
        <>
          <div className="grid gap-5 xl:grid-cols-2">
            <Card>
              <CardHeader title="Seat matrices" description="One per induction. Open one to filter, edit seat counts, or add and remove lines." />
              {overview.seatMatrices.length === 0 ? (
                <EmptyState title="No seat matrix imported yet">Import data/induction21_seats.json from the public repository.</EmptyState>
              ) : (
                <ul className="grid gap-2">
                  {overview.seatMatrices.map((m) => (
                    <li key={m.inductionId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-elevated px-4 py-3">
                      <div>
                        <Link href={`/admin/reference-data/seats/${m.inductionId}`} className="font-semibold text-signal underline-offset-4 hover:underline">
                          Induction {m.inductionId}
                        </Link>
                        <p className="text-sm text-muted">{m.lines} seat lines · {m.seats} seats</p>
                      </div>
                      <ButtonLink href={`/admin/reference-data/export?dataset=seats&induction=${m.inductionId}`} variant="secondary" size="sm" prefetch={false}>
                        Export JSON
                      </ButtonLink>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card>
              <CardHeader title="Import a seat file" />
              <SeatImportForm />
            </Card>
          </div>

          <Card>
            <CardHeader title="Lookups" description="Names behind the ids used in seat files. Correct a name or add a new hospital or speciality here." />
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
              {LOOKUP_KINDS.map((k) => (
                <li key={k}>
                  <Link href={`/admin/reference-data/lookups?kind=${k}`} className="block rounded-xl bg-elevated px-4 py-3 hover:bg-hover">
                    <span className="block text-2xl font-medium tabular-nums">{overview.lookupCounts[k]}</span>
                    <span className="text-sm text-muted">{LOOKUP_LABELS[k]}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>

          <div className="grid gap-5 xl:grid-cols-3">
            {(Object.keys(DOCUMENT_KINDS) as DocumentKind[]).map((kind) => {
              const meta = DOCUMENT_KINDS[kind];
              const current = overview.documents.filter((d) => d.kind === kind);
              return (
                <Card key={kind}>
                  <CardHeader
                    title={meta.label}
                    description={meta.description}
                    action={current.length ? <ButtonLink href={`/admin/reference-data/documents/${kind}`} variant="secondary" size="sm">Open</ButtonLink> : null}
                  />
                  {current.length ? (
                    <ul className="mb-5 grid gap-2">
                      {current.map((d) => (
                        <li key={d.id} className="rounded-xl bg-elevated px-4 py-3 text-sm">
                          <p className="font-medium">
                            {d.inductionId ? `Induction ${d.inductionId} · ` : ""}v{d.version}
                          </p>
                          <p className="text-muted">{d.summary}</p>
                          <p className="mt-1 text-xs text-subtle">{formatUtc(d.createdAt)} UTC · {d.createdBy}</p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mb-5 text-sm text-muted">Not imported yet.</p>
                  )}
                  <DocumentImportForm kind={kind} file={meta.file} perInduction={meta.perInduction} />
                </Card>
              );
            })}
          </div>
        </>
      )}
    </AreaPage>
  );
}
