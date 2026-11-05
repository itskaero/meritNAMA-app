import { AreaPage } from "@/components/area-page";
import { Card } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import Link from "next/link";
import { Notice } from "@/components/ui/notice";
import { mayPost } from "@/lib/data/candidates";
import { describeTopics } from "@/lib/data/community";
import { parseSnippetParam } from "@/lib/domain/community";
import { listInductionsWithRounds } from "@/lib/data/merit";
import { getDb } from "@/lib/db/client";
import { parseTopicParam, topicParam } from "@/lib/domain/topic-param";
import { NewThreadForm } from "../forms";

export const metadata = { title: "Ask a question" };
export const dynamic = "force-dynamic";

export default async function NewThreadPage({ searchParams }: { searchParams: Promise<{ topic?: string; snippet?: string }> }) {
  const db = getDb();
  const session = await getSession();
  const sp = await searchParams;
  const pre = parseTopicParam(sp.topic);
  const snippet = parseSnippetParam(sp.snippet);
  const inductions = await listInductionsWithRounds(db, session);
  const topics = [{ value: "general|", label: "General" }];
  if (pre && pre.kind !== "general") {
    const info = (await describeTopics(db, [pre])).get(`${pre.kind}:${pre.key}`);
    if (info) topics.push({ value: topicParam(pre), label: info.label });
  }
  for (const i of inductions) {
    const v = `induction|${i.id}`;
    if (!topics.some((t) => t.value === v)) topics.push({ value: v, label: `Induction ${i.id} · ${i.rounds[0]?.cycleName ?? ""}` });
  }
  return (
    <AreaPage area="portal" trail={[{ label: "Community", href: "/portal/community" }, { label: "Start a discussion" }]} title="Start a discussion" description="Ask a clear question. Pick the topic it belongs to so others find it on that page.">
      {(await mayPost(db, session)) ? (
        <Card className="max-w-3xl">
          <NewThreadForm topics={topics} defaultTopic={pre ? topicParam(pre) : "general|"} snippet={snippet} />
        </Card>
      ) : (
        <div className="max-w-3xl">
          <Notice title="Verify your account to ask">
            Discussions are started by candidates whose account is linked to their merit record, so answers come from people who went through the rounds. Reading stays open to everyone. <Link href="/portal/profile" className="font-semibold text-signal hover:underline">Verify on your profile →</Link>
          </Notice>
        </div>
      )}
    </AreaPage>
  );
}
