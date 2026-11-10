import Link from "next/link";
import { AreaPage } from "@/components/area-page";
import { whenDatabaseDown } from "@/components/database-unavailable";
import { timeAgo } from "@/components/community/thread-list";
import { Icon } from "@/components/icon";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/components/ui/cn";
import { EmptyState } from "@/components/ui/empty-state";
import { getSession } from "@/lib/auth/session";
import { FEED_FILTERS, listFeed, type FeedFilter } from "@/lib/data/feed";
import { getDb } from "@/lib/db/client";
import { findSection } from "@/lib/navigation";

export const metadata = { title: "Feed" };
export const dynamic = "force-dynamic";

const LABELS: Record<FeedFilter, string> = { all: "Everything", rounds: "Round days", questions: "Questions" };

export default async function FeedPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const s = findSection("/portal/feed");
  const down = await whenDatabaseDown({ area: "portal", trail: [{ label: s.label }], title: s.label, description: s.description });
  if (down) return down;
  const sp = await searchParams;
  const filter: FeedFilter = (FEED_FILTERS as readonly string[]).includes(sp.show ?? "") ? (sp.show as FeedFilter) : "all";
  const items = await listFeed(getDb(), await getSession(), { filter });

  return (
    <AreaPage area="portal" trail={[{ label: s.label }]} title={s.label} description={s.description}>
      <nav aria-label="Filter the feed" className="flex flex-wrap gap-2">
        {FEED_FILTERS.map((f) => (
          <Link key={f} href={f === "all" ? "/portal/feed" : `/portal/feed?show=${f}`} aria-current={f === filter ? "page" : undefined}
            className={cn("rounded-full border px-3 py-1.5 text-sm", f === filter ? "border-action bg-tint font-semibold text-heading" : "border-line text-muted hover:border-line-strong")}>
            {LABELS[f]}
          </Link>
        ))}
      </nav>
      {items.length === 0 ? (
        <EmptyState title="Nothing yet">New merit lists and community questions will show up here as they happen.</EmptyState>
      ) : (
        <ul className="grid gap-3">
          {items.map((it, i) => (
            <li key={`${it.type}-${it.id}`} className="mn-rise" style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}>
              <Link href={it.href} className="mn-lift flex gap-3 rounded-2xl border border-line bg-surface p-4">
                <span aria-hidden className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-tint text-signal">
                  <Icon name={it.type === "round_day" ? "trend" : "chat"} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2 text-xs text-muted">
                    {it.type === "round_day" ? <Badge tone="calculated">Round {it.roundNo} · induction {it.induction}</Badge> : it.type === "answered" ? <Badge tone="success">Answered</Badge> : <Badge tone="current">Question</Badge>}
                    {it.type !== "round_day" ? <span>{it.topic}</span> : null}
                    <time dateTime={it.at}>{timeAgo(new Date(it.at))}</time>
                  </span>
                  {it.type === "round_day" ? (
                    <span className="mt-1 block text-sm text-ink">{it.body}</span>
                  ) : (
                    <>
                      <span className="mt-1 block font-semibold leading-snug text-heading">{it.title}</span>
                      <span className="mt-0.5 line-clamp-2 block text-sm text-muted">{it.excerpt}</span>
                      <span className="mt-1.5 block text-xs text-subtle">{it.author}{it.team ? " · team" : ""} · {it.replies} {it.replies === 1 ? "reply" : "replies"} · {it.helpful} helpful</span>
                    </>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AreaPage>
  );
}
