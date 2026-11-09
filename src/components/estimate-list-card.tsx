import Link from "next/link";
import { Badge } from "./ui/badge";
import { Card, CardHeader } from "./ui/card";

type Estimate = { id: string; induction: number; roundNo: number; publishedAt: Date; placed: number | null; official: boolean };

const day = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** Published estimated merit lists: current ones first and prominent, superseded ones listed under them. */
export function EstimateListCard({ estimates, title = "Estimated merit lists" }: { estimates: Estimate[]; title?: string }) {
  if (!estimates.length) return null;
  const current = estimates.filter((e) => !e.official);
  const old = estimates.filter((e) => e.official);
  return (
    <Card className="border-dashed border-amber/50">
      <CardHeader
        title={title}
        description="Simulated from the gazette, portal preferences and consent replies, before PHF publishes the list. Not official: the real list can differ."
        action={<Badge tone="simulated">Estimate</Badge>}
      />
      {current.length ? (
        <ul className="grid gap-2 sm:grid-cols-2">
          {current.map((e) => (
            <li key={e.id}>
              <Link href={`/portal/history/${e.induction}/estimates/${e.id}`} className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-amber/60 bg-[var(--mn-amber-soft)] px-4 py-3 hover:bg-hover">
                <span>
                  <span className="block font-semibold text-heading">Induction {e.induction} · estimated round {e.roundNo}</span>
                  <span className="block text-xs text-muted">Published {day(e.publishedAt)}{e.placed != null ? ` · ${e.placed.toLocaleString("en-US")} allocations` : ""}</span>
                </span>
                <span aria-hidden className="text-amber">→</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">No estimate is current: PHF has published the lists these were made for.</p>
      )}
      {old.length ? (
        <p className="mt-3 text-xs text-muted">
          Superseded by the official list:{" "}
          {old.map((e, i) => (
            <span key={e.id}>{i ? ", " : ""}<Link href={`/portal/history/${e.induction}/estimates/${e.id}`} className="text-signal underline underline-offset-2">induction {e.induction} round {e.roundNo}</Link></span>
          ))}
          .
        </p>
      ) : null}
    </Card>
  );
}
