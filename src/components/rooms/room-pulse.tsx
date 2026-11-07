import Link from "next/link";
import { cn } from "../ui/cn";

type Room = { induction: number; roundNo: number; messages: number; today: number; latest: boolean };

/** Rooms with activity, newest round first: a compact list for the community page and dashboard. */
export function RoomPulseList({ rooms }: { rooms: Room[] }) {
  if (!rooms.length) return <p className="text-sm text-muted">Rooms open when a merit round is published.</p>;
  return (
    <ul className="grid gap-1.5">
      {rooms.map((r) => (
        <li key={`${r.induction}:${r.roundNo}`}>
          <Link
            href={`/portal/history/${r.induction}/rounds/${r.roundNo}#room`}
            className={cn("flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm hover:bg-hover", r.latest ? "border-teal/40 bg-tint" : "border-line")}
          >
            <span className="min-w-0">
              <span className="font-medium text-heading">Induction {r.induction} · round {r.roundNo}</span>
              {r.latest ? <span className="ml-2 text-xs font-medium text-signal-strong">Latest</span> : null}
            </span>
            <span className="flex-none text-xs tabular-nums text-muted">
              {r.today ? `${r.today} today` : r.messages ? `${r.messages} ${r.messages === 1 ? "message" : "messages"}` : "Open"}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
