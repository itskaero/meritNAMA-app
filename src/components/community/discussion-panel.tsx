import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { listThreads } from "@/lib/data/community";
import { getDb } from "@/lib/db/client";
import type { Topic } from "@/lib/domain/community";
import { ButtonLink } from "../ui/button";
import { Card, CardHeader } from "../ui/card";
import { ThreadList } from "./thread-list";

/** Latest discussions about one topic, shown on that topic's page, with a way to start one. */
export async function DiscussionPanel({ topic, label }: { topic: Topic; label: string }) {
  const threads = await listThreads(getDb(), await getSession(), { topic, limit: 3 });
  const q = encodeURIComponent(`${topic.kind}|${topic.key}`);
  return (
    <Card id="discussion">
      <CardHeader
        title="Discussion"
        description={threads.length ? `What members are saying about ${label}.` : `No one has started a discussion about ${label} yet.`}
        action={<ButtonLink href={`/portal/community/new?topic=${q}`} size="sm">Start a discussion</ButtonLink>}
      />
      {threads.length ? <ThreadList threads={threads} showTopic={false} /> : null}
      {threads.length === 3 ? (
        <p className="mt-3 text-sm"><Link href={`/portal/community?topic=${q}`} className="text-signal hover:underline">See all discussions about {label}</Link></p>
      ) : null}
    </Card>
  );
}
