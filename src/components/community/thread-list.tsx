import Link from "next/link";
import { Icon } from "../icon";
import { Badge } from "../ui/badge";

export type ThreadSummary = {
  id: string;
  title: string;
  excerpt: string;
  author: string | null;
  authorIsTeam: boolean;
  authorVerified: boolean;
  answered: boolean;
  duplicateOf: string | null;
  hasSnippet: boolean;
  hasPoll: boolean;
  status: "visible" | "hidden";
  locked: boolean;
  pinned: boolean;
  replies: number;
  helpful: number;
  lastActivityAt: Date;
  topic: { label: string; href: string | null };
};

export function timeAgo(d: Date) {
  const s = Math.max(1, Math.round((Date.now() - d.getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const days = Math.round(h / 24);
  return days < 30 ? `${days} d ago` : d.toISOString().slice(0, 10);
}

/** Discussion rows; each rises in, staggered. */
export function ThreadList({ threads, showTopic = true }: { threads: ThreadSummary[]; showTopic?: boolean }) {
  return (
    <ul className="grid gap-3">
      {threads.map((t, i) => (
        <li key={t.id} className="mn-rise" style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}>
          <article className="grid gap-2 rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-ember/40 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <div className="min-w-0">
              <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
                {t.pinned ? <Badge tone="current">Pinned</Badge> : null}
                {t.answered ? <Badge tone="success">Answered</Badge> : null}
                {t.duplicateOf ? <Badge>Duplicate</Badge> : t.locked ? <Badge>Locked</Badge> : null}
                {t.hasSnippet ? <Badge tone="historical">Merit card</Badge> : null}
                {t.hasPoll ? <Badge tone="current">Poll</Badge> : null}
                {t.status === "hidden" ? <Badge tone="danger">Hidden</Badge> : null}
                {showTopic ? <span className="text-ember">{t.topic.label}</span> : null}
              </div>
              <h3 className="text-base font-semibold leading-snug">
                <Link href={`/portal/community/${t.id}`} className="hover:underline">{t.title}</Link>
              </h3>
              <p className="mt-1 line-clamp-2 text-sm text-muted">{t.excerpt}</p>
              <p className="mt-2 text-xs text-subtle">
                {t.author}{t.authorIsTeam ? " · team" : t.authorVerified ? " · verified" : ""} · active {timeAgo(t.lastActivityAt)}
              </p>
            </div>
            <div className="flex gap-4 text-sm text-muted sm:flex-col sm:items-end sm:gap-1">
              <span className="inline-flex items-center gap-1.5"><Icon name="chat" className="h-4 w-4" /><span className="tabular-nums">{t.replies}</span><span className="sr-only">replies</span></span>
              <span className="inline-flex items-center gap-1.5"><Icon name="heart" className="h-4 w-4" /><span className="tabular-nums">{t.helpful}</span><span className="sr-only">found it helpful</span></span>
            </div>
          </article>
        </li>
      ))}
    </ul>
  );
}
