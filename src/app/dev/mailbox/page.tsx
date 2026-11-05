import { desc } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Card } from "@/components/ui/card";
import { getDb } from "@/lib/db/client";
import { devOutbox } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { formatUtc } from "@/lib/format";

export const metadata: Metadata = { title: "Dev mailbox", robots: { index: false } };

/** Development only: mail written instead of sent when SMTP_URL is unset. 404 in production. */
export default async function DevMailbox() {
  await connection();
  if (env().NODE_ENV === "production" || !env().DATABASE_URL) notFound();
  const mail = await getDb().select().from(devOutbox).orderBy(desc(devOutbox.id)).limit(20);
  const linkify = (text: string) =>
    text.split(/(https?:\/\/\S+)/g).map((part, i) =>
      /^https?:\/\//.test(part) ? <a key={i} href={part.replace(/^https?:\/\/[^/]+/, "")} className="break-all font-semibold text-signal hover:underline">{part}</a> : part,
    );
  return (
    <main id="main" className="mx-auto grid max-w-3xl gap-4 px-4 py-10">
      <h1 className="text-2xl font-bold tracking-tight">Dev mailbox</h1>
      <p className="text-sm text-muted">Mail the app would have sent. Only in development, when SMTP_URL is not set. Links open on this server.</p>
      {mail.length === 0 ? <p className="text-sm text-subtle">Nothing yet. Ask for a sign-in link first.</p> : null}
      {mail.map((m) => (
        <Card key={m.id} className="p-5">
          <p className="text-xs text-subtle">{formatUtc(m.createdAt)} · to <span className="font-mono text-ink">{m.to}</span></p>
          <p className="mt-1 font-semibold">{m.subject}</p>
          <pre className="mt-3 whitespace-pre-wrap font-sans text-sm text-muted">{linkify(m.body)}</pre>
        </Card>
      ))}
    </main>
  );
}
