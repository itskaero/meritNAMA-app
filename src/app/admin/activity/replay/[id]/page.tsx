import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { AreaPage } from "@/components/area-page";
import { whenDatabaseDown } from "@/components/database-unavailable";
import { Card } from "@/components/ui/card";
import { assertCan } from "@/lib/auth/roles";
import { requireSection } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { replays, users } from "@/lib/db/schema";
import { isUuid } from "@/lib/format";
import { ReplayPlayer } from "./player";

export const metadata = { title: "Replay" };
export const dynamic = "force-dynamic";

const when = (d: Date) => d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Karachi" });

/** Watch one recorded tab. */
export default async function ReplayPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSection("/admin/activity");
  assertCan(session, "roles.manage");
  const frame = { area: "admin" as const, trail: [{ label: "Activity", href: "/admin/activity" }, { label: "Replay" }], title: "Replay" };
  const down = await whenDatabaseDown(frame);
  if (down) return down;
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const [r] = await getDb().select({ r: replays, email: users.email }).from(replays).innerJoin(users, eq(users.id, replays.userId)).where(eq(replays.id, id)).limit(1);
  if (!r) notFound();
  return (
    <AreaPage {...frame} description={`${r.email} · ${r.r.device} · ${when(r.r.startedAt)} to ${when(r.r.lastAt)} · typed text is masked`}>
      <p className="text-sm"><Link href={`/admin/activity/${r.r.userId}`} className="font-semibold text-signal hover:underline">All of this account&apos;s activity →</Link></p>
      <Card><ReplayPlayer id={id} /></Card>
    </AreaPage>
  );
}
