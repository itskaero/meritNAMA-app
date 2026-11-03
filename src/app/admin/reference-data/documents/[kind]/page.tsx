import Link from "next/link";
import { notFound } from "next/navigation";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { getSession } from "@/lib/auth/session";
import { getDocumentVersion, listDocumentVersions } from "@/lib/data/reference-data";
import { getDb } from "@/lib/db/client";
import { documentKindSchema, DOCUMENT_KINDS, type DocumentKind } from "@/lib/domain/reference-data";
import { DocumentEditForm, DocumentImportForm } from "../../forms";

export const metadata = { title: "Reference document" };
export const dynamic = "force-dynamic";

const fmt = (d: Date) => d.toISOString().slice(0, 16).replace("T", " ");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A readable overview of the document, so admins need not read raw JSON. */
function Preview({ kind, data }: { kind: DocumentKind; data: unknown }) {
  switch (kind) {
    case "disciplines": {
      const rows = data as { name: string; disciplineId: number; programs: { name: string }[]; specialities: { specialityName: string }[] }[];
      return (
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((d) => (
            <li key={d.disciplineId} className="rounded-xl bg-elevated px-4 py-3 text-sm">
              <p className="font-medium">{d.name} <span className="font-mono text-xs text-subtle">#{d.disciplineId}</span></p>
              <p className="text-xs text-muted">{d.programs.map((p) => p.name).join(", ")}</p>
              <p className="mt-1 text-xs text-subtle">{d.specialities.map((s) => s.specialityName).join(" · ")}</p>
            </li>
          ))}
        </ul>
      );
    }
    case "specialty_groups": {
      const g = data as { programs: Record<string, { groups: Record<string, { specialties: string[] }> }>; specialtyAliases: Record<string, string> };
      return (
        <div className="grid gap-4">
          {Object.entries(g.programs).map(([program, { groups }]) => (
            <div key={program}>
              <h3 className="mb-2 text-sm font-semibold">{program}</h3>
              <ul className="flex flex-wrap gap-2">
                {Object.entries(groups).map(([slug, grp]) => (
                  <li key={slug} className="rounded-lg bg-elevated px-3 py-1.5 text-xs">
                    {slug} <span className="text-subtle">({grp.specialties.length})</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <p className="text-xs text-muted">{Object.keys(g.specialtyAliases).length} specialty aliases</p>
        </div>
      );
    }
    case "cpsp_accreditation": {
      const rows = data as { hospital: string; city: string; programs: unknown[] }[];
      const byCity = new Map<string, { hospitals: number; programs: number }>();
      for (const h of rows) {
        const c = byCity.get(h.city) ?? { hospitals: 0, programs: 0 };
        byCity.set(h.city, { hospitals: c.hospitals + 1, programs: c.programs + h.programs.length });
      }
      return (
        <ul className="grid gap-2 sm:grid-cols-3 xl:grid-cols-5">
          {[...byCity].sort((a, b) => b[1].programs - a[1].programs).map(([city, c]) => (
            <li key={city} className="rounded-xl bg-elevated px-4 py-3 text-sm">
              <p className="font-medium">{city || "(no city)"}</p>
              <p className="text-xs text-muted">{c.hospitals} hospitals · {c.programs} programmes</p>
            </li>
          ))}
        </ul>
      );
    }
  }
}

export default async function DocumentPage({ params, searchParams }: {
  params: Promise<{ kind: string }>;
  searchParams: Promise<{ version?: string }>;
}) {
  const parsed = documentKindSchema.safeParse((await params).kind);
  if (!parsed.success) notFound();
  const kind = parsed.data;
  const meta = DOCUMENT_KINDS[kind];
  const { version: versionId } = await searchParams;

  const db = getDb();
  const session = await getSession();
  const versions = await listDocumentVersions(db, session, kind);
  // Default: newest version of the newest induction (or the only series).
  const selectedId = versionId && UUID.test(versionId) ? versionId : versions[0]?.id;
  const doc = selectedId ? await getDocumentVersion(db, session, selectedId) : null;
  if (versionId && (!doc || doc.kind !== kind)) notFound();
  const latestForSeries = doc ? versions.find((v) => v.inductionId === doc.inductionId)?.id === doc.id : false;

  return (
    <>
      <PageHeader
        breadcrumb={[
          { label: "Admin workspace", href: "/admin" },
          { label: "Reference data", href: "/admin/reference-data" },
          { label: meta.label },
        ]}
        title={meta.label}
        description={meta.description}
      />
      <div className="grid gap-5 px-4 pb-10 sm:px-8">
        {!doc ? (
          <Card>
            <CardHeader title={`Import ${meta.file}`} />
            <DocumentImportForm kind={kind} file={meta.file} perInduction={meta.perInduction} />
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader
                title={`${doc.inductionId ? `Induction ${doc.inductionId} · ` : ""}version ${doc.version}${latestForSeries ? " (current)" : ""}`}
                description={`${doc.summary} · saved ${fmt(doc.createdAt)} UTC by ${doc.createdBy}: “${doc.reason}”`}
                action={
                  <ButtonLink href={`/admin/reference-data/export?dataset=${kind}&version=${doc.id}`} variant="secondary" size="sm" prefetch={false}>
                    Export JSON
                  </ButtonLink>
                }
              />
              <Preview kind={kind} data={doc.data} />
            </Card>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
              <Card>
                <CardHeader
                  title="Edit"
                  description={latestForSeries ? "Saves a new version." : "You are viewing an older version. Saving it makes it the newest version again (a rollback)."}
                />
                <DocumentEditForm key={doc.id} kind={kind} induction={doc.inductionId || null} initial={JSON.stringify(doc.data, null, 2)} />
              </Card>
              <div className="grid min-w-0 content-start gap-5">
                <Card>
                  <CardHeader title="Versions" />
                  <DataTable
                    caption={`${meta.label} versions`}
                    rows={versions}
                    rowKey={(v) => v.id}
                    columns={[
                      ...(meta.perInduction ? [{ key: "ind", header: "Induction", cell: (v: (typeof versions)[number]) => v.inductionId }] : []),
                      {
                        key: "v",
                        header: "Version",
                        cell: (v) =>
                          v.id === doc.id ? (
                            <span aria-current="true" className="font-semibold">v{v.version}</span>
                          ) : (
                            <Link href={`?version=${v.id}`} className="text-signal underline-offset-4 hover:underline">v{v.version}</Link>
                          ),
                      },
                      { key: "when", header: "Saved (UTC)", cell: (v) => fmt(v.createdAt) },
                      { key: "reason", header: "Reason", cell: (v) => <span className="text-muted">{v.reason}</span> },
                    ]}
                  />
                </Card>
                <Card>
                  <CardHeader title="Import a new file" />
                  <DocumentImportForm kind={kind} file={meta.file} perInduction={meta.perInduction} />
                </Card>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
