import { notFound } from "next/navigation";
import { FollowButton } from "@/components/community/follow-button";
import { AuroraHeader } from "@/components/ui/aurora-header";
import { cn } from "@/components/ui/cn";
import { Pill } from "@/components/ui/segmented";
import { myMerit } from "@/lib/data/candidates";
import { computeOptions } from "@/lib/data/finder";
import { followerCount, isFollowing } from "@/lib/data/notifications";
import { wasteFor } from "@/lib/data/joining";
import { ChartSource } from "@/components/charts/chart-source";
import { AreaPage } from "@/components/area-page";
import { DiscussionPanel } from "@/components/community/discussion-panel";
import { BarList } from "@/components/charts/bar-list";
import { Card, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { EntityLink } from "@/components/entity-link";
import { EmptyState } from "@/components/ui/empty-state";
import { getSession } from "@/lib/auth/session";
import { hospitalAccreditation } from "@/lib/data/accreditation";
import { hospitalProfile, hospitalRoundPeople } from "@/lib/data/merit";
import { listJobs } from "@/lib/data/jobs";
import { Badge } from "@/components/ui/badge";
import { ProgramTag } from "@/components/program-tag";
import { listHospitalReviews, reviewChoices } from "@/lib/data/reviews";
import { RatingMeter } from "@/components/community/rating-meter";
import { ReviewCard } from "@/components/community/review-card";
import { ReviewForm } from "@/components/community/review-form";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { selectClass } from "@/components/ui/styles";
import { can } from "@/lib/auth/roles";
import { REVIEW_DIMENSIONS } from "@/lib/domain/community";
import Link from "next/link";
import { getDb } from "@/lib/db/client";
import { formatMarks } from "@/lib/format";
import { intParam } from "@/lib/params";

export const metadata = { title: "Hospital" };
export const dynamic = "force-dynamic";

export default async function HospitalPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ spec?: string }> }) {
  const id = intParam((await params).id, 6);
  if (id === null) notFound();
  const db = getDb();
  const session = await getSession();
  const p = await hospitalProfile(db, session, id);
  if (!p) notFound();
  const choices = await reviewChoices(db, session, id);
  const jobsHere = (await listJobs(db, session, { hospitalId: id }).catch(() => null))?.jobs.slice(0, 4) ?? [];
  const wanted = intParam((await searchParams).spec ?? undefined, 6);
  const specFilter = choices.specialities.find((x) => x.id === wanted) ?? null;
  const rv = await listHospitalReviews(db, session, { hospitalId: id, specialityId: specFilter?.id ?? null });
  const path = `/portal/explore/hospitals/${id}`;
  const waste = await wasteFor(db, session, { kind: "hospital", id });

  const seatsBySpec = new Map<string, { id: number; seats: number }>();
  for (const r of p.seats) seatsBySpec.set(r.speciality, { id: r.speciality_id, seats: (seatsBySpec.get(r.speciality)?.seats ?? 0) + r.seats });
  const seatItems = [...seatsBySpec].sort((a, b) => b[1].seats - a[1].seats).map(([label, v]) => ({ label, value: v.seats, href: `/portal/explore/specialities/${v.id}` }));
  const acc = await hospitalAccreditation(db, session, { hospital: p.hospital.name, specialities: [...new Set([...seatsBySpec.keys(), ...p.closing.map((c) => c.speciality)])] });
  const latest = p.closing[0];
  // Summary band: seats and programmes in the latest matrix, the closing range in the latest round.
  const totalSeats = p.seats.reduce((n, r) => n + r.seats, 0);
  const programmes = [...new Set(p.seats.map((r) => r.program.trim()))].sort();
  const closings = p.closing.map((c) => Number(c.closing)).filter(Number.isFinite);
  const max = latest ? p.maxMarks[latest.induction_id] : undefined;

  // The member's own marks, for safe / target / reach at this hospital.
  const merit = await myMerit(db, session).catch(() => null);
  const mine = merit?.rows[0] ?? null;
  const total = mine ? p.maxMarks[mine.induction] ?? null : null;
  const target = { kind: "hospital" as const, key: String(id) };
  const [following, followers, options, people] = await Promise.all([
    isFollowing(db, session, target).catch(() => false),
    followerCount(db, session, target).catch(() => null),
    mine && total ? computeOptions(db, { induction: mine.induction, program: mine.program, quota: mine.quota, marks: mine.marks, total }).catch(() => null) : null,
    latest ? hospitalRoundPeople(db, session, { induction: latest.induction_id, roundNo: latest.round_no, hospitalId: id, limit: 4 }) : null,
  ]);
  const here = options?.options.filter((o) => o.hospital === p.hospital.name) ?? [];
  const statusOf = new Map(here.map((o) => [o.speciality, o.status]));
  const tally = { safe: here.filter((o) => o.status === "safe").length, borderline: here.filter((o) => o.status === "borderline").length, out: here.filter((o) => o.status === "out").length };
  const placed = p.closing.reduce((n, r) => n + Number(r.allocations), 0);
  const lineKey = (s: string, prog: string, q: string) => `${s}|${prog.trim()}|${q.trim()}`;
  const seatsOf = new Map<string, number>();
  for (const r of p.seats) seatsOf.set(lineKey(r.speciality, r.program, r.quota), (seatsOf.get(lineKey(r.speciality, r.program, r.quota)) ?? 0) + r.seats);
  const sortedClosing = [...closings].sort((a, b) => a - b);
  const medianClosing = sortedClosing.length ? sortedClosing[Math.floor(sortedClosing.length / 2)]! : null;
  const rating = rv.averages.filter((a) => a.value != null);
  const IVORY = "text-[#F3EEE5]", DIM = "text-[#F3EEE5]/70";
  const initials = (s: string) => s.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");

  return (
    <AreaPage area="portal" trail={[{ label: "Hospitals & specialities", href: "/portal/explore" }, { label: p.hospital.name }]} title={p.hospital.name} bare>
      <AuroraHeader as="section" className="relative overflow-hidden p-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/v4/night-ward.jpg" alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover opacity-25" />
        <div className="relative grid gap-4 bg-gradient-to-t from-black/60 via-black/20 to-transparent p-5 sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className={cn("text-xs", DIM)}><Link href="/portal/explore" className="hover:underline">Hospitals</Link>{p.hospital.name.includes(",") ? ` / ${p.hospital.name.split(",").pop()!.trim()}` : ""}</p>
            {latest ? <Link href={`/portal/history/${latest.induction_id}/rounds/${latest.round_no}#room`} className={cn("rounded-full border border-white/15 px-3 py-1 text-xs", IVORY)}><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-danger" />Round room</Link> : null}
          </div>
          <div className="mt-8 grid gap-2 sm:mt-14">
            <h1 className={cn("text-3xl font-semibold tracking-tight sm:text-4xl", IVORY)}>{p.hospital.name}</h1>
            <p className={cn("text-sm", DIM)}>
              {[acc?.matched ? `CPSP accredited in ${acc.covered.length} specialit${acc.covered.length === 1 ? "y" : "ies"}` : null, `${seatsBySpec.size || p.closing.length} specialities offered`, programmes.length ? programmes.join(" · ") : null].filter(Boolean).join(" · ")}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <a href="#reviews" className={cn("rounded-full border border-white/15 px-3 py-1 text-xs", IVORY)}>
              {rv.count && rating.length ? `★ ${(rating.reduce((s, a) => s + a.value!, 0) / rating.length).toFixed(1)} · ${rv.count} review${rv.count === 1 ? "" : "s"}` : "No reviews yet"}
            </a>
            <FollowButton target={target} following={following} path={path} count={followers} />
          </div>
        </div>
      </AuroraHeader>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-line bg-card p-4">
          <p className="flex justify-between text-xs text-muted"><span>Seats filled{latest ? ` · round ${latest.round_no}` : ""}</span>{totalSeats ? <Pill tone="success">{Math.round((placed / totalSeats) * 100)}%</Pill> : null}</p>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-heading">{placed.toLocaleString("en-US")}{totalSeats ? <span className="ml-1 text-base text-muted">of {totalSeats.toLocaleString("en-US")}</span> : null}</p>
        </div>
        <div className="rounded-2xl border border-line bg-card p-4">
          <p className="text-xs text-muted">Joining{waste ? ` · induction ${waste.induction}` : ""}</p>
          {waste ? (
            <>
              <p className="mt-2 text-3xl font-semibold tabular-nums text-success">{waste.row.joined.toLocaleString("en-US")}<span className="ml-1 text-base text-muted">joined</span></p>
              <p className="text-xs text-danger">{waste.row.wasted} wasted ({Math.round(waste.row.pct * 100)}%) · <Link href={`/portal/history/${waste.induction}/joining`} className="text-signal hover:underline">where</Link></p>
            </>
          ) : <p className="mt-2 text-sm text-muted">Shows once the joining file is in.</p>}
        </div>
        <div className="rounded-2xl border border-line bg-card p-4">
          <p className="text-xs text-muted">Median closing{latest ? ` · round ${latest.round_no}` : ""}</p>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-heading">{medianClosing != null ? formatMarks(medianClosing) : "—"}</p>
          {closings.length > 1 ? <p className="text-xs text-muted">from {formatMarks(sortedClosing[0]!)} to {formatMarks(sortedClosing.at(-1)!)}{max ? ` of ${max}` : ""}</p> : null}
        </div>
        <div className="rounded-2xl border border-line bg-card p-4">
          {here.length ? (
            <>
              <p className="flex justify-between text-xs text-muted"><span>For your {formatMarks(mine!.marks)}</span><Link href="/portal/finder" className="text-signal hover:underline">details</Link></p>
              <p className="mt-2 text-2xl font-semibold text-success">Safe in {tally.safe}</p>
              <div className="mt-2 flex h-2 gap-1 overflow-hidden rounded-full" aria-hidden>
                <span className="bg-success" style={{ flex: tally.safe || 0.01 }} /><span className="bg-amber" style={{ flex: tally.borderline || 0.01 }} /><span className="bg-danger" style={{ flex: tally.out || 0.01 }} />
              </div>
              <p className="mt-1 text-xs text-muted">{tally.safe} safe · {tally.borderline} target · {tally.out} reach</p>
            </>
          ) : (
            <><p className="text-xs text-muted">Your chances here</p><p className="mt-2 text-sm text-muted">Link your record, or put your marks in <Link href="/portal/finder" className="text-signal hover:underline">My chances</Link>, to see safe, target and reach here.</p></>
          )}
        </div>
      </div>

      {seatItems.length === 0 && p.closing.length === 0 ? (
        <EmptyState title="No seats or merit data for this hospital yet" />
      ) : (
        <div id="seats" className="grid scroll-mt-20 gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <Card className="min-w-0">
            <CardHeader title="Specialities here" description={latest ? `Seats from the latest seat matrix; closing merit in round ${latest.round_no} of induction ${latest.induction_id}${max ? `, out of ${max}` : ""}.` : undefined} />
            {p.closing.length ? (
              <div className="-mx-5 overflow-x-auto sm:-mx-6">
                <table className="w-full min-w-[38rem] text-sm">
                  <thead className="text-left text-xs text-subtle">
                    <tr><th className="px-5 py-2 font-medium sm:px-6">Speciality</th><th className="px-2 py-2 font-medium">Seats filled</th><th className="px-2 py-2 text-right font-medium">Closing</th><th className="px-2 py-2 pr-5 font-medium sm:pr-6">{here.length ? "You" : ""}</th></tr>
                  </thead>
                  <tbody>
                    {p.closing.map((r, i) => {
                      const seats = seatsOf.get(lineKey(r.speciality, r.program, r.quota)) ?? 0;
                      const n = Number(r.allocations);
                      const st = mine && r.program.trim() === mine.program.trim() && r.quota.trim() === mine.quota.trim() ? statusOf.get(r.speciality) : undefined;
                      return (
                        <tr key={`${lineKey(r.speciality, r.program, r.quota)}|${i}`} className="border-t border-line">
                          <td className="px-5 py-2 sm:px-6"><EntityLink kind="speciality" id={r.speciality_id} name={r.speciality} /><span className="block"><ProgramTag program={r.program} quota={r.quota} className="text-xs" /></span></td>
                          <td className="px-2 py-2">
                            <span className="block h-1.5 w-32 overflow-hidden rounded-full bg-white/10"><span className={cn("block h-full rounded-full", seats && n >= seats ? "bg-success" : "bg-amber")} style={{ width: `${seats ? Math.min(100, (n / seats) * 100) : 100}%` }} /></span>
                            <span className="text-xs text-muted">{n}{seats ? ` / ${seats}` : ""}</span>
                          </td>
                          <td className="px-2 py-2 text-right font-mono tabular-nums">{formatMarks(Number(r.closing))}</td>
                          <td className="px-2 py-2 pr-5 sm:pr-6">{st ? <Pill tone={st === "safe" ? "success" : st === "borderline" ? "amber" : "danger"}>{st === "safe" ? "Safe" : st === "borderline" ? "Target" : "Reach"}</Pill> : null}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : <p className="text-sm text-muted">No merit rounds include this hospital yet.</p>}
            <ChartSource tone="official" data="seats" source="PHF seat matrix and merit list" />
          </Card>
          <div className="grid content-start gap-5">
            {people && people.total ? (
              <Card>
                <CardHeader title="Got in this round" action={<Pill tone="success">{people.total}</Pill>} />
                <ul className="grid gap-2.5">
                  {people.rows.map((x) => (
                    <li key={`${x.applicantId}|${x.program}`} className="flex items-center gap-2.5 text-sm">
                      <span aria-hidden className="grid h-8 w-8 flex-none place-items-center rounded-full bg-[var(--mn-violet-fill)] text-[0.7rem] font-semibold text-violet-pale">{initials(x.name ?? x.applicantId)}</span>
                      <span className="min-w-0 flex-1"><span className="block truncate font-medium text-heading">{x.name ?? `Applicant ${x.applicantId}`}</span><span className="block truncate text-xs text-muted">{x.speciality} · pref #{x.preferenceNo || "?"}</span></span>
                      <span className="font-mono tabular-nums">{formatMarks(x.marks)}</span>
                    </li>
                  ))}
                </ul>
                {latest ? <Link href={`/portal/history/${latest.induction_id}/rounds/${latest.round_no}`} className="mt-3 block text-sm font-semibold text-signal hover:underline">See the round →</Link> : null}
              </Card>
            ) : null}
            {seatItems.length ? (
              <Card>
                <CardHeader title={p.seats[0] ? `Seats · induction ${p.seats[0].induction_id}` : "Seats"} description="All programmes and quotas together." />
                <BarList items={seatItems.slice(0, 10)} />
              </Card>
            ) : null}
          </div>
        </div>
      )}
      {acc ? (
        <Card id="accreditation">
          <CardHeader
            title="CPSP accreditation"
            description={acc.matched ? `Matched by name to “${acc.matched}” in CPSP's list. Check with CPSP before relying on it.` : "No entry in CPSP's accreditation list matches this hospital's name. That does not mean it is not accredited."}
            action={acc.matched ? <Badge tone={acc.covered.length ? "success" : "neutral"}>{acc.covered.length} of {seatsBySpec.size || acc.covered.length} seat specialities covered</Badge> : undefined}
          />
          {acc.programs.length ? (
            <DataTable
              caption="Accredited programmes"
              rows={acc.programs}
              rowKey={(r) => `${r.speciality}|${r.unit}|${r.type}`}
              maxHeight="22rem"
              columns={[
                { key: "s", header: "Speciality (as CPSP writes it)", cell: (r) => r.speciality },
                { key: "u", header: "Unit", tone: "muted", cell: (r) => r.unit || "—" },
                { key: "t", header: "Type", cell: (r) => r.type },
                { key: "y", header: "Since", align: "right", tone: "mono", cell: (r) => r.since },
              ]}
            />
          ) : null}
        </Card>
      ) : null}
      <Card id="reviews" className="scroll-mt-6">
        <CardHeader
          title={`Reviews${rv.count ? ` (${rv.count})` : ""}`}
          description="From verified candidates. Higher is better on every scale. Not official."
          action={
            choices.specialities.length ? (
              <form method="get" action={`${path}#reviews`} className="flex flex-wrap items-center gap-2">
                <label className="sr-only" htmlFor="rv-spec">Speciality</label>
                <select id="rv-spec" name="spec" defaultValue={specFilter?.id ?? ""} className={`${selectClass} w-auto max-w-[14rem]`}>
                  <option value="">All specialities</option>
                  {choices.specialities.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
                <Button type="submit" size="sm" variant="secondary">Show</Button>
              </form>
            ) : null
          }
        />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
          <div className="grid content-start gap-3">
            {REVIEW_DIMENSIONS.map((d) => (
              <div key={d.key} className="grid gap-1">
                <span className="text-sm text-muted">{d.label}</span>
                <RatingMeter value={rv.averages.find((a) => a.key === d.key)?.value ?? null} label={`${d.label}, average`} />
              </div>
            ))}
            <p className="text-xs text-subtle">{rv.count ? `Average of ${rv.count} ${rv.count === 1 ? "review" : "reviews"}${specFilter ? ` for ${specFilter.name}` : ""}.` : "No reviews yet."}</p>
          </div>
          <div className="grid min-w-0 content-start gap-3">
            {rv.reviews.length ? rv.reviews.map((r) => <ReviewCard key={r.id} r={r} path={path} moderator={can(session, "community.moderate")} />) : (
              <p className="text-sm text-muted">Nobody has reviewed {specFilter ? `${specFilter.name} at ` : ""}this hospital yet.</p>
            )}
          </div>
        </div>
        <div className="mt-6 border-t border-line pt-5">
          <h3 className="mb-3 font-semibold">{rv.mine ? "Edit your review" : "Write a review"}</h3>
          {rv.mayWrite && choices.inductions.length ? (
            <ReviewForm hospitalId={id} specialities={choices.specialities} inductions={choices.inductions} existing={rv.mine} defaultSpecialityId={specFilter?.id ?? null} />
          ) : (
            <Notice title="Verify your account to review">
              Reviews come from candidates whose account is linked to their merit record. <Link href="/portal/profile" className="font-semibold text-signal hover:underline">Verify on your profile →</Link>
            </Notice>
          )}
        </div>
      </Card>
      {jobsHere.length ? (
        <Card>
          <CardHeader title="Jobs here" description="Open adverts that name this hospital. Follow the hospital to hear about new ones." action={<Link href="/portal/jobs" className="text-sm font-semibold text-signal hover:underline">All jobs →</Link>} />
          <ul className="grid gap-2 sm:grid-cols-2">
            {jobsHere.map((j) => (
              <li key={j.id}>
                <Link href={`/portal/jobs?job=${j.id}`} className="mn-lift block rounded-xl border border-line bg-canvas/50 p-3">
                  <span className="line-clamp-2 text-sm font-semibold text-heading">{j.title}</span>
                  <span className={j.state === "closing" ? "mt-1 block text-xs text-amber" : "mt-1 block text-xs text-muted"}>{j.lastDate ? `Apply by ${j.lastDate}` : "Last date in the advert"}{j.official ? " · official" : ""}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      <DiscussionPanel topic={{ kind: "hospital", key: String(p.hospital.id) }} label={p.hospital.name} />
    </AreaPage>
  );
}
