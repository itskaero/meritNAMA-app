import Link from "next/link";
import { AreaPage } from "@/components/area-page";
import { StatTiles } from "@/components/charts/stat-tiles";
import { whenDatabaseDown } from "@/components/database-unavailable";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { fieldClass } from "@/components/ui/form";
import { requireSection } from "@/lib/auth/session";
import { activityOverview, traceWatermark } from "@/lib/data/activity-log";
import { loadFeatures } from "@/lib/data/settings";
import { getDb } from "@/lib/db/client";
import { findSection } from "@/lib/navigation";

export const metadata = { title: "Activity" };
export const dynamic = "force-dynamic";

const time = (d: Date) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Karachi" });
const when = (d: Date) => d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Karachi" });
const ago = (d: Date) => {
  const m = Math.round((Date.now() - d.getTime()) / 60_000);
  return m < 1 ? "now" : `${m} min ago`;
};
const mb = (b: number) => (b < 1048576 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1048576).toFixed(1)} MB`);

/** The owner's view of candidates using the site. */
export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ trace?: string }> }) {
  const session = await requireSection("/admin/activity");
  const s = findSection("/admin/activity");
  const frame = { area: "admin" as const, trail: [{ label: s.label }], title: s.label, description: s.description };
  const down = await whenDatabaseDown(frame);
  if (down) return down;
  const db = getDb();
  const { trace } = await searchParams;
  const [o, flags] = await Promise.all([activityOverview(db, session), loadFeatures(db)]);
  const traced = trace
    ? await traceWatermark(db, session, trace).then((u) => ({ u, error: null as string | null })).catch((e: Error) => ({ u: null, error: e.message }))
    : null;
  const peak = Math.max(1, ...o.daily.map((d) => d.users));

  return (
    <AreaPage {...frame}>
      <StatTiles
        stats={[
          { label: "Online now", value: o.online.length, hint: "a page in the last 5 minutes" },
          { label: "Candidates today", value: o.today.visitors },
          { label: "Pages opened today", value: o.today.views },
          { label: "Sign-ins today", value: o.today.signIns },
        ]}
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title="Online now" description="Candidates with a page open in the last five minutes. Team members are never logged." />
          {o.online.length ? (
            <ul className="divide-y divide-line text-sm">
              {o.online.map((u) => (
                <li key={u.userId} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <span className="min-w-0">
                    <Link href={`/admin/activity/${u.userId}`} className="font-medium text-heading hover:underline">{u.email}</Link>
                    <span className="block truncate text-xs text-muted">{u.applicantId ? `Applicant ${u.applicantId} · ` : ""}{u.device}</span>
                  </span>
                  <span className="text-right text-xs"><span className="font-mono text-ink">{u.path}</span><span className="block text-muted">{ago(u.at)}</span></span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted">Nobody right now.</p>}
        </Card>

        <Card>
          <CardHeader title="Last 14 days" description="Candidates using the site each day." />
          {o.daily.length ? (
            <div className="flex h-36 items-end gap-1.5" role="img" aria-label={`Daily candidates: ${o.daily.map((d) => `${d.day} ${d.users}`).join(", ")}`}>
              {o.daily.map((d) => (
                <div key={d.day} className="flex max-w-12 flex-1 flex-col items-center gap-1" title={`${d.day}: ${d.users} candidates, ${d.views} pages`}>
                  <span className="text-[10px] tabular-nums text-muted">{d.users}</span>
                  <span className="w-full rounded-t bg-signal/70" style={{ height: `${Math.max(4, (d.users / peak) * 100)}px` }} />
                  <span className="text-[10px] text-subtle">{d.day.slice(8)}</span>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-muted">No visits logged yet.</p>}
          {o.pages.length ? (
            <>
              <p className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-subtle">Most opened today</p>
              <ul className="grid gap-1.5 text-sm">
                {o.pages.map((p) => <li key={p.path} className="flex justify-between gap-3"><span className="truncate font-mono text-xs">{p.path}</span><span className="tabular-nums text-muted">{p.n}</span></li>)}
              </ul>
            </>
          ) : null}
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="Accounts that look shared" description="Two devices on two different networks within minutes of each other means two people. A phone and a laptop at home, or one phone moving between Wi-Fi and mobile data, is normal and not listed. Last 14 days." />
          {o.flagged.length ? (
            <ul className="divide-y divide-line text-sm">
              {o.flagged.map((f) => (
                <li key={f.userId} className="grid gap-1 py-2.5">
                  <span className="flex items-center gap-2">
                    <Badge tone={f.signals[0]!.level === "strong" ? "danger" : "warning"}>{f.signals[0]!.level === "strong" ? "Likely shared" : "Watch"}</Badge>
                    <Link href={`/admin/activity/${f.userId}`} className="font-medium hover:underline">{f.email}</Link>
                  </span>
                  {f.signals.map((x, i) => <span key={i} className="text-xs text-muted">{x.text}</span>)}
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted">No account looks shared.</p>}
        </Card>

        <Card>
          <CardHeader
            title="Trace a screenshot"
            description={flags.watermark
              ? "Every portal page carries a faint code and the time it was opened. Open the screenshot in any photo editor, push contrast or levels right up, and type the 6 characters you see."
              : "The watermark is off (Team & settings, Candidate features, Monitoring)."}
          />
          <form action="/admin/activity" className="flex gap-2">
            <input name="trace" defaultValue={trace ?? ""} maxLength={12} placeholder="e.g. K7Q2XM" autoComplete="off" aria-label="Code from the screenshot" className={`${fieldClass} max-w-48 font-mono uppercase placeholder:normal-case placeholder:font-sans`} />
            <button type="submit" className="mn-ob">Find</button>
          </form>
          {traced ? (
            traced.u
              ? <p className="mt-3 text-sm">Belongs to <Link href={`/admin/activity/${traced.u.id}`} className="font-semibold text-signal hover:underline">{traced.u.email}</Link>. The time next to the code is when they opened that page.</p>
              : <p className="mt-3 text-sm text-muted">{traced.error ?? "No account has that code. Codes never use 0, O, 1 or I."}</p>
          ) : null}
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Latest replays"
          description={flags.replay
            ? "Recordings of candidates' tabs: clicks, scrolling and pages. Everything typed is masked. Kept for the replays period in Team & settings."
            : "Session replay is off (Team & settings, Candidate features, Monitoring)."}
        />
        {o.recent.length ? (
          <ul className="divide-y divide-line text-sm">
            {o.recent.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <span className="min-w-0">
                  <Link href={`/admin/activity/${r.userId}`} className="font-medium hover:underline">{r.email}</Link>
                  <span className="block text-xs text-muted">{r.device} · from {r.firstPath}</span>
                </span>
                <span className="flex items-center gap-3 text-xs text-muted">{when(r.startedAt)}–{time(r.lastAt)} · {mb(r.bytes)}<Link href={`/admin/activity/replay/${r.id}`} className="mn-ob">Watch</Link></span>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted">No recordings yet.</p>}
      </Card>
    </AreaPage>
  );
}
