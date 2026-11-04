import { AreaPage } from "@/components/area-page";
import { Card } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import { describeTopics } from "@/lib/data/community";
import { listInductionsWithRounds } from "@/lib/data/merit";
import { getDb } from "@/lib/db/client";
import { parseTopicParam, topicParam } from "@/lib/domain/topic-param";
import { NewThreadForm } from "../forms";

export const metadata = { title: "Start a discussion" };
export const dynamic = "force-dynamic";

export default async function NewThreadPage({ searchParams }: { searchParams: Promise<{ topic?: string }> }) {
  const db = getDb();
  const session = await getSession();
  const pre = parseTopicParam((await searchParams).topic);
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
      <Card className="max-w-3xl">
        <NewThreadForm topics={topics} defaultTopic={pre ? topicParam(pre) : "general|"} />
      </Card>
    </AreaPage>
  );
}
