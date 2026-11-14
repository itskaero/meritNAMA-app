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
    <section aria-labelledby="bar" className="mn-card-glass rounded-[20px] border border-white/[.07] p-5">
      <div className="mb-2.5 flex items-center justify-between"><h2 id="bar" className="text-[15px] font-semibold text-[#F7F7FA]">Notification bar</h2><span className={`mn-pill ${live.length ? "g" : "n"}`}>{live.length ? `Live · ${live.length}` : "Nothing showing"}</span></div>
      <ul className="flex flex-col gap-2 text-[13px]">
        {live.map((n) => {
          const c = n.tone === "warning" ? "229,160,75" : n.tone === "highlight" ? "155,135,255" : "92,225,230";
          return (
            <li key={n.id} className="flex items-center gap-2 rounded-[10px] border px-2.5 py-2" style={{ borderColor: `rgba(${c},.3)` }}>
              <span aria-hidden className="h-[9px] w-[9px] flex-none rounded-full" style={{ background: `rgb(${c})` }} />
              <span className="min-w-0 flex-1">{n.text} <span className="text-muted">· {n.auto ? "auto" : "team"}</span></span>
            </li>
          );
        })}
        {posts.filter((p) => !live.some((n) => n.id === p.id)).map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-2 rounded-[10px] border border-dashed border-white/10 px-2.5 py-2 text-muted">
            <span className="min-w-0 flex-1">{p.text}</span>
            <span className="text-xs">{p.endsAt < new Date() ? "ended" : `from ${day(p.startsAt)}`} · until {day(p.endsAt)}</span>
          </li>
        ))}
        {!live.length && !posts.length ? <li className="text-muted">Deadlines from PHF&apos;s schedule, a new round and a new estimate show by themselves.</li> : null}
      </ul>
      {mayPost ? (
        <>
          {posts.some((p) => p.endsAt > new Date()) ? (
            <div className="mt-2.5 flex flex-wrap gap-2">
              {posts.filter((p) => p.endsAt > new Date()).map((p) => (
                <form key={p.id} action={removeNoticeAction}>
                  <input type="hidden" name="id" value={p.id} />
                  <button type="submit" className="mn-ob">Remove “{p.text.slice(0, 30)}{p.text.length > 30 ? "…" : ""}”</button>
                </form>
              ))}
            </div>
          ) : null}
          <div className="mt-3"><PostNoticeForm /></div>
        </>
      ) : null}
    </section>
  );
}
