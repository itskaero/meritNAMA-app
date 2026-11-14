import Link from "next/link";
import { JOIN_LABELS, type JoinState, type Waste, type WasteRow } from "@/lib/domain/joining";
import { Pill } from "./ui/segmented";

const fmt = (n: number) => n.toLocaleString("en-US");
export const pct = (x: number) => `${Math.round(x * 100)}%`;

export function JoinPill({ state }: { state: JoinState }) {
  return <Pill tone={state === "joined" ? "success" : state === "pending" ? "amber" : "danger"}>{JOIN_LABELS[state]}</Pill>;
}

/** Seats → placed → joined, and what was wasted (not joined + never filled). */
export function WasteTiles({ w }: { w: Waste }) {
  const tiles: { label: string; value: string; hint?: string; tone?: string }[] = [
    { label: "Seats", value: fmt(w.seats), hint: "in the seat matrix" },
    { label: "Placed", value: fmt(w.placed), hint: "on the last list" },
    { label: "Joined", value: fmt(w.joined), hint: w.pending ? `${fmt(w.pending)} pending` : undefined, tone: "text-success" },
    { label: "Did not join", value: fmt(w.notJoined), tone: "text-danger" },
    { label: "Never filled", value: fmt(w.unfilled), tone: "text-amber" },
    { label: "Wasted", value: fmt(w.wasted), hint: `${pct(w.pct)} of seats`, tone: "text-danger" },
  ];
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
      {tiles.map((t) => (
        <li key={t.label} className="rounded-xl border border-line bg-card px-3 py-2.5">
          <span className="block text-xs font-semibold uppercase tracking-wide text-muted">{t.label}</span>
          <span className={`mt-1 block text-2xl font-semibold tabular-nums ${t.tone ?? "text-heading"}`}>{t.value}</span>
          {t.hint ? <span className="block text-xs text-muted">{t.hint}</span> : null}
        </li>
      ))}
    </ul>
  );
}

/** One line: "364 of 1,449 seats (25%) went unused: 134 did not join, 230 were never filled." */
export function wasteSentence(w: Waste): string {
  return `${fmt(w.wasted)} of ${fmt(w.seats)} seats (${pct(w.pct)}) went unused: ${fmt(w.notJoined)} placed but did not join, ${fmt(w.unfilled)} never filled.`;
}

export function WasteTable({ rows, kind, limit = 15 }: { rows: WasteRow[]; kind: "speciality" | "hospital" | "quota"; limit?: number }) {
  const shown = rows.filter((r) => r.wasted > 0).slice(0, limit);
  if (!shown.length) return <p className="text-sm text-muted">No wasted seats.</p>;
  const href = (r: WasteRow) => (r.id != null && kind !== "quota" ? `/portal/explore/${kind === "speciality" ? "specialities" : "hospitals"}/${r.id}` : null);
  return (
    <div className="-mx-5 overflow-x-auto sm:-mx-6">
      <table className="w-full min-w-[34rem] text-sm">
        <thead className="text-left text-xs text-subtle">
          <tr>
            <th className="px-5 py-2 font-medium sm:px-6">{kind === "speciality" ? "Speciality" : kind === "hospital" ? "Hospital" : "Quota"}</th>
            <th className="px-2 py-2 text-right font-medium">Seats</th>
            <th className="px-2 py-2 text-right font-medium">Joined</th>
            <th className="px-2 py-2 text-right font-medium">Did not join</th>
            <th className="px-2 py-2 text-right font-medium">Never filled</th>
            <th className="px-2 py-2 pr-5 text-right font-medium sm:pr-6">Wasted</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => {
            const h = href(r);
            return (
              <tr key={r.key} className="border-t border-line">
                <td className="px-5 py-2 sm:px-6">{h ? <Link href={h} className="text-ink hover:text-violet-pale hover:underline">{r.name}</Link> : r.name}</td>
                <td className="px-2 py-2 text-right tabular-nums text-muted">{fmt(r.seats)}</td>
                <td className="px-2 py-2 text-right tabular-nums text-success">{fmt(r.joined)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{fmt(r.notJoined)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{fmt(r.unfilled)}</td>
                <td className="px-2 py-2 pr-5 text-right font-semibold tabular-nums text-danger sm:pr-6">{fmt(r.wasted)} <span className="text-xs font-normal text-muted">{pct(r.pct)}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** A line on hospital and speciality pages: last induction's joining for this place. */
export function WasteNote({ data, what }: { data: { induction: number; row: WasteRow } | null; what: string }) {
  if (!data) return null;
  const r = data.row;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-line bg-card px-4 py-3 text-sm">
      <span className="font-semibold text-heading">Joining · induction {data.induction}</span>
      <span className="text-muted">{fmt(r.seats)} seats {what}</span>
      <span className="text-success">{fmt(r.joined)} joined</span>
      <span className={r.wasted ? "text-danger" : "text-muted"}>{fmt(r.wasted)} wasted ({pct(r.pct)})</span>
      <span className="flex-1" />
      <Link href={`/portal/history/${data.induction}/joining`} className="font-semibold text-signal hover:underline">Wasted seats →</Link>
    </div>
  );
}
