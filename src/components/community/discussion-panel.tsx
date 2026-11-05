import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { listThreads } from "@/lib/data/community";
import { isFollowing } from "@/lib/data/notifications";
import { getDb } from "@/lib/db/client";
import type { Topic } from "@/lib/domain/community";
import { ButtonLink } from "../ui/button";
import { Card, CardHeader } from "../ui/card";
import { FollowButton } from "./follow-button";
import { ThreadList } from "./thread-list";

/** The page a topic lives on, for re-rendering after Follow. */
function topicPath(t: Topic) {
  switch (t.kind) {
    case "induction": return `/portal/history/${t.key}`;
    case "round": { const [i, r] = t.key.split(":"); return `/portal/history/${i}/rounds/${r}`; }
    case "speciality": return `/portal/explore/specialities/${t.key}`;
    case "hospital": return `/portal/explore/hospitals/${t.key}`;
    default: return "/portal/community";
  }
}

/**
 * Latest questions about one topic, shown on that topic's page, with Follow (new
 * questions and rounds go to the inbox) and a way to ask.
 */
export async function DiscussionPanel({ topic, label, ask }: { topic: Topic; label: string; ask?: string }) {
  const db = getDb();
  const session = await getSession();
  const target = topic.kind === "general" ? null : { kind: topic.kind, key: topic.key };
  const [threads, following] = await Promise.all([
    listThreads(db, session, { topic, limit: 3 }),
    target ? isFollowing(db, session, target) : Promise.resolve(false),
  ]);
  const q = encodeURIComponent(`${topic.kind}|${topic.key}`);
  return (
    <Card id="discussion">
      <CardHeader
        title="Questions"
        description={threads.length ? `What members are asking about ${label}.` : `No one has asked about ${label} yet.`}
        action={
          <div className="flex flex-wrap gap-2">
            {target ? <FollowButton target={target} following={following} path={topicPath(topic)} /> : null}
            <ButtonLink href={ask ?? `/portal/community/new?topic=${q}`} size="sm">Ask a question</ButtonLink>
          </div>
        }
      />
      {threads.length ? <ThreadList threads={threads} showTopic={false} /> : null}
      {threads.length === 3 ? (
        <p className="mt-3 text-sm"><Link href={`/portal/community?topic=${q}`} className="text-signal hover:underline">See all questions about {label}</Link></p>
      ) : null}
    </Card>
  );
}
