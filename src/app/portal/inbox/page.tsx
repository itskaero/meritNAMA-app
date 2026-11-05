import Link from "next/link";
import { AreaPage } from "@/components/area-page";
import { timeAgo } from "@/components/community/thread-list";
import { whenDatabaseDown } from "@/components/database-unavailable";
import { Icon, type IconName } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { EmptyState } from "@/components/ui/empty-state";
import { getSession } from "@/lib/auth/session";
import { describeTopics } from "@/lib/data/community";
import { listInbox } from "@/lib/data/notifications";
import { getDb } from "@/lib/db/client";
import { findSection } from "@/lib/navigation";
import { markAllReadAction } from "./actions";
import { FollowButton } from "@/components/community/follow-button";

export const metadata = { title: "Inbox" };
export const dynamic = "force-dynamic";

const ICON: Record<string, IconName> = { answer: "chat", accepted: "check", new_thread: "chat", new_round: "list" };

export default async function InboxPage() {
  const s = findSection("/portal/inbox");
  const frame = { area: "portal" as const, trail: [{ label: s.label }], title: s.label, description: s.description };
  const down = await whenDatabaseDown(frame);
  if (down) return down;
  const db = getDb();
  const session = await getSession();
  const { items, followed, threadTitles: threadTitle } = await listInbox(db, session);
  const unread = items.filter((i) => !i.readAt).length;

  // Labels for what is followed.
  const topics = await describeTopics(db, followed.filter((f) => f.kind !== "thread").map((f) => ({ kind: f.kind as "induction", key: f.key })));
  const label = (f: (typeof followed)[number]) =>
    f.kind === "thread"
      ? { text: threadTitle.get(f.key) ?? "A removed question", href: `/portal/community/${f.key}` }
      : { text: topics.get(`${f.kind}:${f.key}`)?.label ?? f.key, href: topics.get(`${f.kind}:${f.key}`)?.href ?? "/portal/community" };

  return (
    <AreaPage {...frame}>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card className="min-w-0">
          <CardHeader
            title={unread ? `${unread} new` : "All caught up"}
            description="Kept for 90 days once read. No email is sent."
            action={unread ? <form action={markAllReadAction}><Button type="submit" size="sm" variant="secondary">Mark all read</Button></form> : null}
          />
          {items.length === 0 ? (
            <EmptyState title="Nothing yet">Follow a question, an induction, a speciality or a hospital, and new answers and rounds arrive here.</EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {items.map((n) => (
                <li key={n.id}>
                  <a href={`/portal/inbox/open/${n.id}`} className={cn("flex items-start gap-3 rounded-xl px-2 py-3 hover:bg-hover", !n.readAt && "font-semibold")}>
                    <span className={cn("mt-0.5 grid h-8 w-8 flex-none place-items-center rounded-full", n.readAt ? "bg-elevated text-muted" : "bg-signal/15 text-signal")}>
                      <Icon name={ICON[n.kind] ?? "bell"} className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-sm">{n.title}</span>
                      <time dateTime={n.createdAt.toISOString()} className="text-xs font-normal text-subtle">{timeAgo(n.createdAt)}</time>
                    </span>
                    {!n.readAt ? <span aria-label="unread" className="mt-2 h-2 w-2 flex-none rounded-full bg-ember" /> : null}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="min-w-0 content-start">
          <CardHeader title="Following" description="Questions you ask or answer are followed for you." />
          {followed.length === 0 ? (
            <p className="text-sm text-muted">Nothing yet. Use <strong>Follow</strong> on a question, induction, round, speciality or hospital page.</p>
          ) : (
            <ul className="grid gap-2">
              {followed.map((f) => {
                const l = label(f);
                return (
                  <li key={`${f.kind}:${f.key}`} className="flex items-center justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block text-xs uppercase tracking-wider text-subtle">{f.kind === "thread" ? "question" : f.kind}</span>
                      <Link href={l.href} className="block truncate text-sm font-medium hover:underline">{l.text}</Link>
                    </span>
                    <FollowButton target={{ kind: f.kind, key: f.key }} following path="/portal/inbox" />
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </AreaPage>
  );
}
