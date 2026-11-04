import Link from "next/link";
import { AreaPage } from "@/components/area-page";
import { StatTiles } from "@/components/charts/stat-tiles";
import { ThreadList } from "@/components/community/thread-list";
import { whenDatabaseDown } from "@/components/database-unavailable";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { EmptyState } from "@/components/ui/empty-state";
import { getSession } from "@/lib/auth/session";
import { communityStats, describeTopics, getMyProfile, listThreads } from "@/lib/data/community";
import { getDb } from "@/lib/db/client";
import { parseTopicParam, topicParam } from "@/lib/domain/topic-param";
import { findSection } from "@/lib/navigation";
import { DisplayNameForm } from "./forms";

export const metadata = { title: "Community" };
export const dynamic = "force-dynamic";

export default async function CommunityPage({ searchParams }: { searchParams: Promise<{ topic?: string; sort?: string }> }) {
  const s = findSection("/portal/community");
  const down = await whenDatabaseDown({ area: "portal", trail: [{ label: s.label }], title: s.label, description: s.description });
  if (down) return down;const sp = await searchParams;
  const topic = parseTopicParam(sp.topic);
  const sort = sp.sort === "helpful" ? "helpful" : "active";
  const db = getDb();
  const session = await getSession();
  const [threads, stats, me, topicInfo] = await Promise.all([
    listThreads(db, session, { topic: topic ?? undefined, sort }),
    communityStats(db, session),
    getMyProfile(db, session),
    topic ? describeTopics(db, [topic]) : Promise.resolve(null),
  ]);
  const about = topic ? topicInfo?.get(`${topic.kind}:${topic.key}`) : null;
  const qs = (o: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(o)) if (v) p.set(k, v);
    const str = p.toString();
    return str ? `?${str}` : "";
  };
  const topicQ = topic ? topicParam(topic) : undefined;

  return (
    <AreaPage
      area="portal"
      trail={about ? [{ label: s.label, href: "/portal/community" }, { label: about.label }] : [{ label: s.label }]}
      title={about ? `Discussions: ${about.label}` : s.label}
      description={s.description}
    >
      <StatTiles stats={[{ label: "Discussions", value: stats.threads }, { label: "Replies", value: stats.replies }]} />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="grid min-w-0 content-start gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <nav aria-label="Sort discussions" className="inline-flex rounded-full border border-line bg-canvas p-1">
              {(["active", "helpful"] as const).map((k) => (
                <Link
                  key={k}
                  href={`/portal/community${qs({ topic: topicQ, sort: k === "active" ? undefined : k })}`}
                  aria-current={sort === k ? "page" : undefined}
                  className={cn("rounded-full px-4 py-1.5 text-sm font-semibold", sort === k ? "bg-ink text-canvas" : "text-muted hover:text-ink")}
                >
                  {k === "active" ? "Latest activity" : "Most helpful"}
                </Link>
              ))}
            </nav>
            <div className="flex flex-wrap gap-2">
              {about ? <ButtonLink href="/portal/community" variant="ghost" size="sm">All topics</ButtonLink> : null}
              {about?.href ? <ButtonLink href={about.href} variant="secondary" size="sm">Open {about.label}</ButtonLink> : null}
              <ButtonLink href={`/portal/community/new${qs({ topic: topicQ })}`} size="sm">Start a discussion</ButtonLink>
            </div>
          </div>
          {threads.length ? (
            <ThreadList threads={threads} showTopic={!topic} />
          ) : (
            <EmptyState title="No discussions yet" action={<ButtonLink href={`/portal/community/new${qs({ topic: topicQ })}`}>Start the first one</ButtonLink>}>
              Ask about closing merit, a hospital or a speciality. Others who went through the same rounds can answer.
            </EmptyState>
          )}
        </div>
        <div className="grid content-start gap-5">
          <Card>
            <CardHeader title="You" description={`You post as ${me.displayName}.`} />
            <DisplayNameForm current={me.displayName ?? ""} />
          </Card>
          <Card>
            <CardHeader title="House rules" />
            <ul className="grid list-disc gap-2 pl-5 text-sm text-muted">
              <li>Be kind; everyone here is going through the same process.</li>
              <li>No CNIC, phone numbers or email addresses. Posts with them are refused.</li>
              <li>Say where a number comes from (round, quota, programme).</li>
              <li>Report anything wrong; moderators review every report.</li>
              <li>meritNAMA is not an official admissions authority.</li>
            </ul>
          </Card>
        </div>
      </div>
    </AreaPage>
  );
}
