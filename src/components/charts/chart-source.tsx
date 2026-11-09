import { getDb } from "@/lib/db/client";
import { lastMeritImport } from "@/lib/data/sources";
import { Badge, type BadgeTone } from "../ui/badge";

const LABEL: Partial<Record<BadgeTone, string>> = { official: "Official", calculated: "Calculated", simulated: "Estimate", historical: "Historical" };
const day = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/**
 * The line under a chart: what kind of figure it is (official, calculated or an
 * estimate), where it comes from, and when that source was last updated.
 *   <ChartSource tone="calculated" source="PHF merit lists" induction={21} />
 * `data` "merit" (default) dates it by the last merit-list import; "seats" names the
 * latest seat matrix (no import date is kept for those).
 */
export async function ChartSource({ tone = "calculated", source, induction = null, data = "merit", note }: {
  tone?: BadgeTone;
  source: string;
  induction?: number | null;
  data?: "merit" | "seats";
  note?: string;
}) {
  const last = data === "merit" ? await lastMeritImport(getDb(), induction) : null;
  return (
    <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line pt-2.5 text-xs text-muted">
      <Badge tone={tone}>{LABEL[tone] ?? "Source"}</Badge>
      <span>
        Source: {source}
        {last?.at ? <> · updated <time dateTime={last.at.toISOString()}>{day(last.at)}</time></> : null}
        {note ? <> · {note}</> : null}
      </span>
    </p>
  );
}
