import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/components/ui/cn";
import { getSession } from "@/lib/auth/session";
import { listLookup, LOOKUP_LABELS } from "@/lib/data/reference-data";
import { getDb } from "@/lib/db/client";
import { LOOKUP_KINDS, type LookupKind } from "@/lib/domain/reference-data";
import { LookupEditor } from "../forms";

export const metadata = { title: "Reference lookups" };
export const dynamic = "force-dynamic";

export default async function LookupsPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const { kind: raw } = await searchParams;
  const kind: LookupKind = LOOKUP_KINDS.includes(raw as LookupKind) ? (raw as LookupKind) : "hospitals";
  const rows = await listLookup(getDb(), await getSession(), kind);

  return (
    <>
      <PageHeader
        breadcrumb={[
          { label: "Admin workspace", href: "/admin" },
          { label: "Reference data", href: "/admin/reference-data" },
          { label: "Lookups" },
        ]}
        title="Lookups"
        description="Ids come from the PHF exports and never change; names can be corrected. A renamed entry is used in every exported seat file."
      />
      <div className="grid gap-5 px-4 pb-10 sm:px-8">
        <nav aria-label="Lookup type" className="flex flex-wrap gap-2">
          {LOOKUP_KINDS.map((k) => (
            <Link
              key={k}
              href={`/admin/reference-data/lookups?kind=${k}`}
              aria-current={k === kind ? "page" : undefined}
              className={cn(
                "rounded-full border px-4 py-2 text-sm",
                k === kind ? "border-signal/40 bg-signal/10 font-semibold text-signal" : "border-line-strong text-muted hover:bg-hover hover:text-ink",
              )}
            >
              {LOOKUP_LABELS[k]}
            </Link>
          ))}
        </nav>
        {/* key: a fresh editor (and reason) per lookup type */}
        <LookupEditor key={kind} kind={kind} label={LOOKUP_LABELS[kind]} rows={rows} />
      </div>
    </>
  );
}
