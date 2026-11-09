import { HelpfulButton, ReportButton } from "@/app/portal/community/forms";
import { ModerationControls } from "@/app/admin/community/forms";
import { REVIEW_DIMENSIONS, type ReviewDimension } from "@/lib/domain/community";
import { Badge } from "../ui/badge";
import { timeAgo } from "./thread-list";
import { RatingMeter } from "./rating-meter";

export type ReviewRow = {
  id: string; author: string | null; authorIsTeam: boolean; authorVerified: boolean; allocatedHere: boolean;
  speciality: string | null; induction: number; body: string; status: "visible" | "hidden";
  helpful: number; voted: boolean; mine: boolean; updatedAt: Date;
} & Record<ReviewDimension, number>;

/** One review: who (anonymous name and trust badges), what it covers, four meters, the text. */
export function ReviewCard({ r, path, moderator }: { r: ReviewRow; path: string; moderator: boolean }) {
  return (
    <article className={`grid gap-3 rounded-2xl border bg-canvas p-4 ${r.status === "hidden" ? "border-danger/40 opacity-70" : "border-line"}`}>
      <header className="flex flex-wrap items-center gap-2 text-xs text-subtle">
        <span className="font-semibold text-muted">{r.author}</span>
        {r.authorIsTeam ? <Badge tone="current">Team</Badge> : null}
        {r.authorVerified && !r.authorIsTeam ? <Badge tone="success">Verified</Badge> : null}
        {r.allocatedHere ? <Badge tone="historical">Allocated here</Badge> : null}
        <span>{r.speciality ?? "Whole hospital"} · induction {r.induction}</span>
        <time dateTime={r.updatedAt.toISOString()}>{timeAgo(r.updatedAt)}</time>
        {r.status === "hidden" ? <Badge tone="danger">Hidden from members</Badge> : null}
      </header>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {REVIEW_DIMENSIONS.map((d) => (
          <div key={d.key} className="grid grid-cols-[minmax(0,9.5rem)_minmax(0,1fr)] items-center gap-2">
            <dt className="truncate text-xs text-muted">{d.label}</dt>
            <dd><RatingMeter value={r[d.key]} size="sm" label={d.label} /></dd>
          </div>
        ))}
      </dl>
      <p className="whitespace-pre-line text-sm leading-relaxed text-ink/95">{r.body}</p>
      <div className="flex flex-wrap items-center gap-2">
        <HelpfulButton kind="review" id={r.id} path={path} count={r.helpful} voted={r.voted} disabled={r.mine} />
        {!r.mine ? <ReportButton kind="review" id={r.id} /> : <span className="text-xs text-subtle">Your review</span>}
        {moderator ? <ModerationControls kind="review" id={r.id} state={{ hidden: r.status === "hidden" }} /> : null}
      </div>
    </article>
  );
}
