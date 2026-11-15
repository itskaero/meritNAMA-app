import Link from "next/link";
import { notFound } from "next/navigation";
import { AreaPage } from "@/components/area-page";
import { whenDatabaseDown } from "@/components/database-unavailable";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { requireSection } from "@/lib/auth/session";
import { userActivity } from "@/lib/data/activity-log";
import { getDb } from "@/lib/db/client";

export const metadata = { title: "Account activity" };
export const dynamic = "force-dynamic";

const when = (d: Date) => d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Karachi" });
const TONE = { strong: "danger", watch: "warning", ok: "success" } as const;

/** One account: devices and networks, the sharing verdict, every recent page, sign-ins and replays. */
export default async function AccountActivityPage({ params }: { params: Promise<{ userId: string }> }) {
  const session = await requireSection("/admin/activity");
  const frame = { area: "admin" as const, trail: [{ label: "Activity", href: "/admin/activity" }, { label: "Account" }], title: "Account activity" };
  const down = await whenDatabaseDown(frame);
  if (down) return down;
  const a = await userActivity(getDb(), session, (await params).userId);
  if (!a) notFound();

  return (
    <AreaPage {...frame} title={a.user.name ?? a.user.email} description={`${a.user.email}${a.user.applicantId ? ` · applicant ${a.user.applicantId}` : " · not linked"} · watermark code ${a.user.watermark} · account since ${when(a.user.createdAt)}`}>
      <Card>
        <CardHeader title="Is this account shared?" description="Last 14 days. Networks are numbered in the order this account first used them; addresses are never stored." />
        <ul className="grid gap-2 text-sm">
          {a.signals.length ? a.signals.map((s, i) => <li key={i} className="flex items-start gap-2"><Badge tone={TONE[s.level]}>{s.level === "strong" ? "Likely shared" : s.level === "watch" ? "Watch" : "Looks normal"}</Badge><span>{s.text}</span></li>) : <li className="text-muted">No visits in the last 14 days.</li>}
        </ul>
      </Card>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="Devices" />
          <ul className="divide-y divide-line text-sm">
            {a.devices.map((d) => (
              <li key={d.device} className="py-2.5">
                <p className="font-medium">{d.device}</p>
                <p className="text-xs text-muted">{d.views} pages · {d.nets.join(", ")} · {when(d.first)} to {when(d.last)}</p>
              </li>
            ))}
            {!a.devices.length ? <li className="py-2 text-muted">No visits logged.</li> : null}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Sign-ins" description="Each sign-in is one browser." />
          <ul className="divide-y divide-line text-sm">
            {a.signIns.map((s, i) => <li key={i} className="flex justify-between gap-3 py-2.5"><span>{s.device}</span><span className="text-xs text-muted">{when(s.createdAt)} · last seen {when(s.lastSeenAt)}</span></li>)}
            {!a.signIns.length ? <li className="py-2 text-muted">No live sign-ins.</li> : null}
          </ul>
        </Card>
      </div>

      <Card>
        <CardHeader title="Replays" />
        <ul className="divide-y divide-line text-sm">
          {a.replays.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <span>{r.device} · {r.net}<span className="block text-xs text-muted">from {r.firstPath} · {r.events.toLocaleString("en-US")} events</span></span>
              <span className="flex items-center gap-3 text-xs text-muted">{when(r.startedAt)}<Link href={`/admin/activity/replay/${r.id}`} className="mn-ob">Watch</Link></span>
            </li>
          ))}
          {!a.replays.length ? <li className="py-2 text-muted">No recordings.</li> : null}
        </ul>
      </Card>

      <Card>
        <CardHeader title="Pages opened" description="Newest first, last 300." />
        <div className="overflow-x-auto">
          <table className="mn-tbl min-w-[36rem] text-sm">
            <thead><tr><th scope="col">When</th><th scope="col">Page</th><th scope="col">Device</th><th scope="col">Network</th></tr></thead>
            <tbody>
              {a.visits.map((v, i) => (
                <tr key={i}><td className="whitespace-nowrap text-muted">{when(v.at)}</td><td className="font-mono text-xs">{v.path}</td><td className="text-xs">{v.device}</td><td className="text-xs text-muted">{v.net}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </AreaPage>
  );
}
