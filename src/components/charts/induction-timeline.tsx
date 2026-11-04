import { Timeline, type TimelineRow } from "./timeline";

type Induction = { id: number; maxMarks: number | null; rounds: { roundNo: number; cycleName: string; startsOn: string | null; endsOn: string | null; allocations: number }[] };

/** Inductions with dated cycles as timeline rows: newest is the white pill, a cycle still running is teal. */
export function InductionTimeline({ inductions, now = new Date() }: { inductions: Induction[]; now?: Date }) {
  const today = now.toISOString().slice(0, 10);
  const dated = inductions.filter((i) => i.rounds[0]?.startsOn && i.rounds[0]?.endsOn);
  const newest = Math.max(...dated.map((i) => i.id));
  const rows: TimelineRow[] = dated
    .sort((a, b) => a.id - b.id)
    .map((i) => {
      const first = i.rounds[0]!;
      return {
        id: i.id,
        label: `Induction ${i.id}`,
        sub: `${first.cycleName}${i.maxMarks ? ` · out of ${i.maxMarks}` : ""}`,
        start: first.startsOn!,
        end: first.endsOn!,
        rounds: i.rounds.map((r) => r.roundNo),
        href: (n: number) => `/portal/history/${i.id}/rounds/${n}`,
        tone: first.endsOn! >= today ? "active" : i.id === newest ? "latest" : "past",
      };
    });
  return <Timeline rows={rows} now={now} caption={`Induction cycles from ${rows[0]?.start ?? ""} with their rounds, and today's date`} />;
}
