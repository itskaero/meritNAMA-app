import { notFound } from "next/navigation";
import { FollowButton } from "@/components/community/follow-button";
import { cn } from "@/components/ui/cn";
import { myMerit } from "@/lib/data/candidates";
import { computeOptions } from "@/lib/data/finder";
import { followerCount, isFollowing } from "@/lib/data/notifications";
import { wasteFor } from "@/lib/data/joining";
import { AreaPage } from "@/components/area-page";
import { DiscussionPanel } from "@/components/community/discussion-panel";
import { Card, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { EntityLink } from "@/components/entity-link";
import { EmptyState } from "@/components/ui/empty-state";
import { getSession } from "@/lib/auth/session";
import { hospitalAccreditation } from "@/lib/data/accreditation";
import { hospitalProfile, hospitalRoundPeople, hospitalStats } from "@/lib/data/merit";
import { listJobs } from "@/lib/data/jobs";
import { Badge } from "@/components/ui/badge";
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
  const max = latest ? p.maxMarks[latest.induction_id] : undefined;

  // The member's own marks, for safe / target / reach at this hospital.
  const merit = await myMerit(db, session).catch(() => null);
  const mine = merit?.rows[0] ?? null;
  const total = mine ? p.maxMarks[mine.induction] ?? null : null;
  const target = { kind: "hospital" as const, key: String(id) };
  const [following, followers, options, people, stats] = await Promise.all([
    isFollowing(db, session, target).catch(() => false),
    followerCount(db, session, target).catch(() => null),
    mine && total ? computeOptions(db, { induction: mine.induction, program: mine.program, quota: mine.quota, marks: mine.marks, total }).catch(() => null) : null,
    latest ? hospitalRoundPeople(db, session, { induction: latest.induction_id, roundNo: latest.round_no, hospitalId: id, limit: 6 }) : null,
    hospitalStats(db, session, id).catch(() => null),
  ]);
  const here = options?.options.filter((o) => o.hospital === p.hospital.name) ?? [];
  const statusOf = new Map(here.map((o) => [o.speciality, o.status]));
  const tally = { safe: here.filter((o) => o.status === "safe").length, borderline: here.filter((o) => o.status === "borderline").length, out: here.filter((o) => o.status === "out").length };
  const placed = p.closing.reduce((n, r) => n + Number(r.allocations), 0);
  const lineKey = (s: string, prog: string, q: string) => `${s}|${prog.trim()}|${q.trim()}`;
  const seatsOf = new Map<string, number>();
  for (const r of p.seats) seatsOf.set(lineKey(r.speciality, r.program, r.quota), (seatsOf.get(lineKey(r.speciality, r.program, r.quota)) ?? 0) + r.seats);
  const rating = rv.averages.filter((a) => a.value != null);
  const stars = rating.length ? rating.reduce((s, a) => s + a.value!, 0) / rating.length : null;
  const initials = (s: string) => s.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
  const AV = ["#5B3FF5", "#176B67", "#8C5426", "#263C4D"];
  // Median closing in the last round of each induction scored like the latest one (totals differ across years).
  const sameScale = (stats?.medians ?? []).filter((m) => m.median != null && p.maxMarks[m.induction] === (latest ? p.maxMarks[latest.induction_id] : undefined));
  const medNow = sameScale.at(-1)?.median ?? null, medBefore = sameScale.at(-2)?.median ?? null;
  const sparkPath = (v: number[], w = 200, h = 34) => {
    if (v.length < 2) return null;
    const lo = Math.min(...v), hi = Math.max(...v), span = hi - lo || 1;
    return v.map((x, i) => `${i ? "L" : "M"}${((i / (v.length - 1)) * (w - 4) + 2).toFixed(1)} ${(2 + (1 - (x - lo) / span) * (h - 4)).toFixed(1)}`).join(" ");
  };
  const ticker = (people?.rows ?? []).map((x) => ({ dot: "#3DDC97", text: `${(x.name ?? `Applicant ${x.applicantId}`).split(" ").slice(0, 2).join(" ")} took ${x.speciality} · pref #${x.preferenceNo || "?"}` }));
  if (waste) ticker.push({ dot: "#E5A04B", text: `${waste.row.wasted} seats went unused after joining, induction ${waste.induction}` });
  if (rv.count) ticker.push({ dot: "#B9AAFF", text: `${rv.count} review${rv.count === 1 ? "" : "s"} from verified candidates` });
  const pctFilled = totalSeats ? Math.round((placed / totalSeats) * 100) : null;

  return (
    <AreaPage area="portal" trail={[{ label: "Hospitals & specialities", href: "/portal/explore" }, { label: p.hospital.name }]} title={p.hospital.name} bare>
      <section aria-label={p.hospital.name} className="relative h-[250px] overflow-hidden rounded-[18px] shadow-[0_20px_50px_rgba(0,0,0,.5),0_0_0_1px_rgba(255,255,255,.06)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/v4/night-ward.jpg" alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover [object-position:center_45%]" />
        <div aria-hidden className="absolute inset-0 [background:linear-gradient(90deg,rgba(10,14,22,.92)_0%,rgba(16,36,58,.55)_50%,rgba(16,36,58,.15)_100%),radial-gradient(400px_260px_at_30%_120%,rgba(23,107,103,.45),transparent_70%)]" />
        <div className="absolute inset-x-5 inset-y-5 flex flex-col justify-between text-[#F3EEE5] sm:inset-x-7 sm:inset-y-6">
          <div className="flex flex-wrap justify-between gap-2">
            <p className="text-[13px] text-[#F3EEE5]/75"><Link href="/portal/explore" className="hover:underline">Hospitals</Link>{p.hospital.name.includes(",") ? ` / ${p.hospital.name.split(",").pop()!.trim()}` : ""}</p>
            <div className="hidden gap-2 sm:flex">
              {people?.total ? <span className="mn-glassp"><span className="h-2 w-2 rounded-full bg-[#3DDC97] shadow-[0_0_10px_#3DDC97]" />{people.total} placed in round {latest?.round_no}</span> : null}
              {latest ? <Link href={`/portal/history/${latest.induction_id}/rounds/${latest.round_no}#room`} className="mn-glassp"><span className="text-[#FF7A7A]">●</span> Round room</Link> : null}
            </div>
          </div>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-[1.75rem] font-bold tracking-[-0.03em] sm:text-[34px]">{p.hospital.name}</h1>
              <p className="mt-1.5 text-[#F3EEE5]/[.68]">{[acc?.matched ? `CPSP accredited in ${acc.covered.length} specialit${acc.covered.length === 1 ? "y" : "ies"}` : null, `${seatsBySpec.size || p.closing.length} specialities offered`].filter(Boolean).join(" · ")}</p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <a href="#reviews" className="mn-glassp">{stars != null ? <><span className="text-[#E5A04B]">{"★".repeat(Math.round(stars))}</span><span className="opacity-50">{"★".repeat(5 - Math.round(stars))}</span> {stars.toFixed(1)} · {rv.count} review{rv.count === 1 ? "" : "s"}</> : "No reviews yet"}</a>
                {people?.rows.length ? (
                  <span className="flex items-center">
                    {people.rows.slice(0, 4).map((x, i) => <span key={x.applicantId} aria-hidden className={cn("mn-av ring-2 ring-[#10243A]", i > 0 && "-ml-2")} style={{ background: AV[i % AV.length] }}>{initials(x.name ?? x.applicantId)}</span>)}
                    <span className="ml-2 text-[13px] text-[#F3EEE5]/[.68]">{followers ? `${followers} following` : `${people.total} placed here`}</span>
                  </span>
                ) : null}
              </div>
            </div>
            <FollowButton target={target} following={following} path={path} count={followers} />
          </div>
        </div>
      </section>

      {ticker.length ? (
        <div aria-label="Latest at this hospital" className="overflow-hidden whitespace-nowrap rounded-xl border border-white/[.07] bg-[rgba(23,23,28,.82)] py-2.5 text-[13px]">
          <div className="mn-ticker pl-4">
            {[...ticker, ...ticker].map((x, i) => <span key={i} aria-hidden={i >= ticker.length ? true : undefined}><span style={{ color: x.dot }}>●</span> {x.text}</span>)}
          </div>
        </div>
      ) : null}

      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <section aria-label="Seats" className="mn-card-glass mn-hover rounded-[20px] border border-line p-5">
          <div className="flex justify-between"><p className="text-xs text-muted">Seats filled{latest ? ` · round ${latest.round_no}` : ""}</p>{pctFilled != null ? <span className="mn-pill g">{pctFilled}%</span> : null}</div>
          <p className="mt-2 text-[26px] font-bold tabular-nums">{placed.toLocaleString("en-US")} {totalSeats ? <span className="text-[13px] font-medium text-muted">of {totalSeats.toLocaleString("en-US")}</span> : null}</p>
          <div aria-hidden className="mt-2.5 flex h-[22px] gap-[2px]">
            {Array.from({ length: 30 }, (_, i) => {
              const lit = pctFilled != null && i < Math.round((pctFilled / 100) * 30);
              return <span key={i} className="flex-1 rounded-[2px]" style={{ background: lit ? "#3DDC97" : "rgba(255,255,255,0.08)", boxShadow: lit ? "0 0 6px rgba(61,220,151,.45)" : "none" }} />;
            })}
          </div>
          {waste ? <p className="mt-2 text-[11px] text-muted">Induction {waste.induction}: {waste.row.joined} joined · <Link href={`/portal/history/${waste.induction}/joining`} className="text-[#FF7A7A]">{waste.row.wasted} wasted</Link></p> : null}
        </section>
        <section aria-label="Applications per seat" className="mn-card-glass mn-hover flex items-center gap-3.5 rounded-[20px] border border-line p-5">
          {stats?.demand ? (
            <>
              <svg role="img" aria-label={`${stats.demand.perSeat.toFixed(1)} applications per seat`} width="92" height="92" viewBox="0 0 92 92" className="flex-none">
                <circle cx="46" cy="46" r="36" fill="none" stroke="#26262B" strokeWidth="10" />
                <circle cx="46" cy="46" r="36" fill="none" stroke={stats.demand.busierThan >= 66 ? "#FF7A7A" : stats.demand.busierThan >= 33 ? "#E5A04B" : "#3DDC97"} strokeWidth="10" strokeLinecap="round" pathLength="100" strokeDasharray={`${Math.max(4, stats.demand.busierThan)} 100`} transform="rotate(-90 46 46)" />
                <text x="46" y="52" textAnchor="middle" fill="#EDEDEF" fontSize="18" fontWeight="700" fontFamily="Inter">{stats.demand.perSeat.toFixed(1)}</text>
              </svg>
              <div><p className="text-xs text-muted">Applications per seat</p><p className="mt-1 font-semibold">Busier than {stats.demand.busierThan}% of hospitals</p><span className={cn("mn-pill mt-1.5", stats.demand.busierThan >= 66 ? "r" : stats.demand.busierThan >= 33 ? "a" : "g")}>{stats.demand.busierThan >= 66 ? "High demand" : stats.demand.busierThan >= 33 ? "Usual demand" : "Low demand"}</span></div>
            </>
          ) : <div><p className="text-xs text-muted">Applications per seat</p><p className="mt-2 text-sm text-muted">Shows once the induction&apos;s portal preferences are in.</p></div>}
        </section>
        <section aria-label="Median closing" className="mn-card-glass mn-hover rounded-[20px] border border-line p-5 [background:radial-gradient(240px_140px_at_100%_100%,rgba(61,220,151,.16),transparent_70%),rgba(23,23,28,.82)]">
          <div className="flex justify-between"><p className="text-xs text-muted">Median closing · {sameScale.length} induction{sameScale.length === 1 ? "" : "s"}</p>{medNow != null && medBefore != null ? <span className={cn("mn-pill", medNow <= medBefore ? "g" : "r")}>{medNow <= medBefore ? "▼" : "▲"} {Math.abs(medNow - medBefore).toFixed(2)}</span> : null}</div>
          <p className="mt-2 text-[26px] font-bold tabular-nums">{medNow != null ? formatMarks(medNow) : "—"}</p>
          {sparkPath(sameScale.map((m) => m.median!)) ? <svg aria-hidden width="100%" height="34" viewBox="0 0 200 34" preserveAspectRatio="none"><path className="mn-draw-line" d={sparkPath(sameScale.map((m) => m.median!))!} fill="none" stroke="#3DDC97" strokeWidth="2.5" style={{ filter: "drop-shadow(0 0 5px rgba(61,220,151,0.7))" }} /></svg> : null}
        </section>
        <section aria-label="For your marks" className="mn-card-glass mn-hover rounded-[20px] border border-line p-5">
          {here.length ? (
            <>
              <div className="flex justify-between"><p className="text-xs text-muted">For your {formatMarks(mine!.marks)}</p><Link href="/portal/finder" className="text-xs text-[#A797FF]">details</Link></div>
              <p className="mt-2 text-[26px] font-bold text-[#3DDC97]">Safe in {tally.safe}</p>
              <div aria-hidden className="mt-2.5 flex h-2.5 gap-[3px]">
                <span className="rounded-full bg-[#3DDC97] shadow-[0_0_10px_rgba(61,220,151,.5)]" style={{ flex: tally.safe || 0.01 }} /><span className="rounded-full bg-[#E5A04B]" style={{ flex: tally.borderline || 0.01 }} /><span className="rounded-full bg-[#FF7A7A]" style={{ flex: tally.out || 0.01 }} />
              </div>
              <p className="mt-1.5 text-[11px] text-muted">{tally.safe} safe · {tally.borderline} target · {tally.out} reach</p>
            </>
          ) : <><p className="text-xs text-muted">Your chances here</p><p className="mt-2 text-sm text-muted">Link your record, or put your marks in <Link href="/portal/finder" className="text-[#A797FF]">My chances</Link>.</p></>}
        </section>
      </div>

      {seatItems.length === 0 && p.closing.length === 0 ? (
        <EmptyState title="No seats or merit data for this hospital yet" />
      ) : (
        <div id="seats" className="grid scroll-mt-20 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <section aria-labelledby="sp" className="mn-card-glass overflow-hidden rounded-[20px] border border-line">
            <header className="flex items-center justify-between px-4 pb-2 pt-4">
              <div><h2 id="sp" className="text-[15px] font-semibold text-heading">Specialities here</h2><p className="mt-0.5 text-xs text-muted">{mine ? `${mine.program.trim()} · ${mine.quota.trim()} · ` : ""}{latest ? `round ${latest.round_no} of induction ${latest.induction_id}` : ""}{max ? ` · out of ${max}` : ""}</p></div>
            </header>
            {p.closing.length ? (
              <div className="overflow-x-auto">
                <table className="mn-tbl min-w-[44rem]">
                  <thead><tr><th scope="col">Speciality</th><th scope="col">Seats filled</th><th scope="col" className="!text-right">Per seat</th><th scope="col" className="!text-right">Closing</th><th scope="col">Trend</th><th scope="col">{here.length ? "You" : ""}</th></tr></thead>
                  <tbody>
                    {p.closing.map((r, i) => {
                      const seats = seatsOf.get(lineKey(r.speciality, r.program, r.quota)) ?? 0;
                      const n = Number(r.allocations);
                      const st = mine && r.program.trim() === mine.program.trim() && r.quota.trim() === mine.quota.trim() ? statusOf.get(r.speciality) : undefined;
                      const per = r.speciality_id != null ? stats?.perSpec.get(r.speciality_id) : undefined;
                      const tr = r.speciality_id != null ? stats?.trend.get(r.speciality_id) ?? [] : [];
                      const path = sparkPath(tr.slice(-5), 80, 22);
                      const rising = tr.length > 1 && tr.at(-1)! > tr.at(-2)!;
                      return (
                        <tr key={`${lineKey(r.speciality, r.program, r.quota)}|${i}`}>
                          <td><b><EntityLink kind="speciality" id={r.speciality_id} name={r.speciality} /></b><span className="block text-[11px] text-muted">{r.program.trim()} · {r.quota.trim()}</span></td>
                          <td className="w-[130px]"><div className="mn-fill"><span style={{ width: `${seats ? Math.min(100, (n / seats) * 100) : 100}%`, background: seats && n >= seats ? "#3DDC97" : "#E5A04B" }} /></div><span className="text-[11px] text-muted">{n}{seats ? ` / ${seats}` : ""}</span></td>
                          <td className="text-right font-mono">{per != null ? per.toFixed(1) : "—"}</td>
                          <td className="text-right font-mono">{formatMarks(Number(r.closing))}</td>
                          <td>{path ? <svg aria-hidden width="80" height="22" viewBox="0 0 80 22"><path d={path} fill="none" stroke={rising ? "#FF7A7A" : "#3DDC97"} strokeWidth="2" /></svg> : <span className="text-muted">—</span>}</td>
                          <td>{st ? <span className={cn("mn-pill", st === "safe" ? "g" : st === "borderline" ? "a" : "r")}>{st === "safe" ? "Safe" : st === "borderline" ? "Target" : "Reach"}</span> : null}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : <p className="px-4 pb-4 text-sm text-muted">No merit rounds include this hospital yet.</p>}
          </section>
          <aside className="grid gap-3.5">
            {people && people.total ? (
              <section aria-label="Got in this round" className="mn-card-glass rounded-[20px] border border-line p-5">
                <div className="flex items-center justify-between"><h2 className="text-[15px] font-semibold text-heading">Got in this round</h2><span className="mn-pill g">{people.total}</span></div>
                <ul className="mt-3 grid gap-2.5 text-[13px]">
                  {people.rows.slice(0, 4).map((x, i) => (
                    <li key={`${x.applicantId}|${x.program}`} className="flex items-center gap-2.5">
                      <span aria-hidden className="mn-av" style={{ background: AV[i % AV.length] }}>{initials(x.name ?? x.applicantId)}</span>
                      <span className="min-w-0 flex-1"><span className="block truncate">{x.name ?? `Applicant ${x.applicantId}`}</span><span className="block truncate text-[11px] text-muted">{x.speciality} · pref #{x.preferenceNo || "?"}</span></span>
                      <span className="font-mono">{formatMarks(x.marks)}</span>
                    </li>
                  ))}
                </ul>
                {latest ? <Link href={`/portal/history/${latest.induction_id}/rounds/${latest.round_no}`} className="mt-3 block text-[13px] text-[#A797FF]">See all {people.total} →</Link> : null}
              </section>
            ) : null}
            <section aria-label="What trainees say" className="mn-card-glass rounded-[20px] border border-line p-5">
              <div className="flex items-center justify-between"><h2 className="text-[15px] font-semibold text-heading">What trainees say</h2>{stars != null ? <span className="font-semibold">{stars.toFixed(1)} <span className="text-[#E5A04B]">★</span></span> : null}</div>
              {rating.length ? (
                <div className="mt-3 grid gap-1.5 text-[11px] text-muted">
                  {rv.averages.filter((a) => a.value != null).slice(0, 3).map((a, i) => (
                    <div key={a.key} className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-2"><span className="truncate">{REVIEW_DIMENSIONS.find((d) => d.key === a.key)?.label ?? a.key}</span><span className="h-1.5 overflow-hidden rounded-full bg-white/[.08]"><span className="block h-full rounded-full" style={{ width: `${(a.value! / 5) * 100}%`, background: ["#3DDC97", "#E5A04B", "#FF7A7A"][i] }} /></span></div>
                  ))}
                </div>
              ) : <p className="mt-2 text-[13px] text-muted">No reviews yet.</p>}
              <a href="#reviews" className="mt-3 block text-[13px] text-[#A797FF]">{rv.count ? `Read ${rv.count} review${rv.count === 1 ? "" : "s"}` : "Write the first review"}</a>
            </section>
          </aside>
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
