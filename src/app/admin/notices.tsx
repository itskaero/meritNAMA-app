import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import type { Session } from "@/lib/auth/roles";
import { can } from "@/lib/auth/roles";
import { listAnnouncements, liveNotices } from "@/lib/data/announcements";
import type { Database } from "@/lib/db/client";
import { removeNoticeAction } from "./notices-actions";
import { PostNoticeForm } from "./notices-form";

const day = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Karachi" });

/** Admin overview card: what the notification bar shows now, the team's posts, and a form to post one. */
export async function NoticesCard({ db, session }: { db: Database; session: Session }) {
  const [live, posts] = await Promise.all([liveNotices(db, session), listAnnouncements(db, session)]);
  const mayPost = can(session, "data.edit");
  return (
    <Card>
      <CardHeader title="Notification bar" description="The thin bar at the top of every page. Deadlines from PHF's schedule, a new round and a new estimate show by themselves; the team can add one." action={<Badge tone={live.length ? "success" : "neutral"}>{live.length ? `Live · ${live.length}` : "Nothing showing"}</Badge>} />
      <ul className="grid gap-2">
        {live.map((n) => (
          <li key={n.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm">
            <span aria-hidden className={n.tone === "warning" ? "h-2 w-2 rounded-full bg-amber" : n.tone === "highlight" ? "h-2 w-2 rounded-full bg-violet-soft" : "h-2 w-2 rounded-full bg-info"} />
            <span className="min-w-0 flex-1">{n.text}</span>
            <span className="text-xs text-muted">{n.auto ? "automatic" : "team"}</span>
          </li>
        ))}
        {posts.filter((p) => !live.some((n) => n.id === p.id)).map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-line px-3 py-2 text-sm text-muted">
            <span className="min-w-0 flex-1">{p.text}</span>
            <span className="text-xs">{p.endsAt < new Date() ? "ended" : `from ${day(p.startsAt)}`} · until {day(p.endsAt)}</span>
          </li>
        ))}
      </ul>
      {mayPost ? (
        <>
          {posts.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {posts.filter((p) => p.endsAt > new Date()).map((p) => (
                <form key={p.id} action={removeNoticeAction}>
                  <input type="hidden" name="id" value={p.id} />
                  <button type="submit" className="mn-btn-ghost h-8 rounded-lg px-2.5 text-xs">Remove “{p.text.slice(0, 30)}{p.text.length > 30 ? "…" : ""}”</button>
                </form>
              ))}
            </div>
          ) : null}
          <div className="mt-4 border-t border-line pt-4"><PostNoticeForm /></div>
        </>
      ) : null}
    </Card>
  );
}
