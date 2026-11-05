import Link from "next/link";
import { notFound } from "next/navigation";
import { AreaPage } from "@/components/area-page";
import { timeAgo } from "@/components/community/thread-list";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { can } from "@/lib/auth/roles";
import { getSession } from "@/lib/auth/session";
import { getThread } from "@/lib/data/community";
import { getDb } from "@/lib/db/client";
import { isUuid } from "@/lib/format";
import { ModerationControls } from "@/app/admin/community/forms";
import { HelpfulButton, ReplyForm, ReportButton } from "../forms";

export const metadata = { title: "Discussion" };
export const dynamic = "force-dynamic";

function Byline({ author, team, verified, at }: { author: string | null; team: boolean; verified: boolean; at: Date }) {
  return (
    <p className="flex flex-wrap items-center gap-2 text-xs text-subtle">
      <span aria-hidden className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-ember/40 to-elevated text-[0.65rem] font-bold text-ink">{(author ?? "?").slice(0, 2).toUpperCase()}</span>
      <span className="font-semibold text-muted">{author}</span>
      {team ? <Badge tone="current">Team</Badge> : null}
      {verified && !team ? <Badge tone="success">Verified</Badge> : null}
      <time dateTime={at.toISOString()}>{timeAgo(at)}</time>
    </p>
  );
}

/** Plain text with paragraphs; React escapes everything. */
function Body({ text }: { text: string }) {
  return <div className="grid gap-3 text-[0.95rem] leading-relaxed text-ink/95">{text.split(/\n{2,}/).map((p, i) => <p key={i} className="whitespace-pre-line">{p}</p>)}</div>;
}

export default async function ThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const session = await getSession();
  const view = await getThread(getDb(), session, id);
  if (!view) notFound();
  const { thread: t, posts, topic } = view;
  const isAdmin = can(session, "community.moderate");

  return (
    <AreaPage area="portal" trail={[{ label: "Community", href: "/portal/community" }, { label: topic.label, href: `/portal/community?topic=${encodeURIComponent(`${topic.kind}|${topic.key}`)}` }, { label: "Discussion" }]} title={t.title}>
      <div className="grid max-w-3xl gap-5">
        {t.status === "hidden" ? <Notice tone="warning" title="Hidden">Members cannot see this discussion. Only admins can.</Notice> : null}
        <Card className="mn-rise grid gap-4">
          <div className="flex flex-wrap items-center gap-2">
            {topic.href ? <Link href={topic.href} className="text-sm text-ember-hot hover:underline">{topic.label}</Link> : <span className="text-sm text-ember-hot">{topic.label}</span>}
            {t.pinned ? <Badge tone="current">Pinned</Badge> : null}
            {t.locked ? <Badge>Locked</Badge> : null}
          </div>
          <Byline author={t.author} team={t.authorIsTeam} verified={t.authorVerified} at={t.createdAt} />
          <Body text={t.body} />
          <div className="flex flex-wrap items-center gap-2">
            <HelpfulButton kind="thread" id={t.id} threadId={t.id} count={t.helpful} voted={t.voted} disabled={t.mine} />
            {!t.mine ? <ReportButton kind="thread" id={t.id} /> : null}
          </div>
          {isAdmin ? <ModerationControls kind="thread" id={t.id} state={{ hidden: t.status === "hidden", locked: t.locked, pinned: t.pinned }} /> : null}
        </Card>

        <h2 className="text-lg font-semibold">{posts.length} {posts.length === 1 ? "reply" : "replies"}</h2>
        <ol className="grid gap-3">
          {posts.map((p, i) => (
            <li key={p.id} className="mn-rise" style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}>
              <article className={`grid gap-3 rounded-2xl border bg-surface p-4 ${p.status === "hidden" ? "border-danger/40 opacity-70" : "border-line"}`}>
                <Byline author={p.author} team={p.authorIsTeam} verified={p.authorVerified} at={p.createdAt} />
                {p.status === "hidden" ? <Badge tone="danger">Hidden from members</Badge> : null}
                <Body text={p.body} />
                <div className="flex flex-wrap items-center gap-2">
                  <HelpfulButton kind="post" id={p.id} threadId={t.id} count={p.helpful} voted={p.voted} disabled={p.mine} />
                  {!p.mine ? <ReportButton kind="post" id={p.id} /> : null}
                  {isAdmin ? <ModerationControls kind="post" id={p.id} state={{ hidden: p.status === "hidden" }} /> : null}
                </div>
              </article>
            </li>
          ))}
        </ol>

        {t.locked && !isAdmin ? (
          <Notice title="Replies are closed">A moderator locked this discussion.</Notice>
        ) : view.me.mayPost ? (
          <Card><ReplyForm threadId={t.id} /></Card>
        ) : (
          <Notice title="Verify your account to reply">
            Replies come from candidates whose account is linked to their merit record. <Link href="/portal/profile" className="font-semibold text-signal hover:underline">Verify on your profile →</Link>
          </Notice>
        )}
      </div>
    </AreaPage>
  );
}
