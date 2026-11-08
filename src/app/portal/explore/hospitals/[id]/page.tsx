import { notFound } from "next/navigation";
import { PageSections } from "@/components/ui/page-sections";
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
import { hospitalProfile } from "@/lib/data/merit";
import { Badge } from "@/components/ui/badge";
import { ProgramTag, programColor } from "@/components/program-tag";
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
  const wanted = intParam((await searchParams).spec ?? undefined, 6);
  const specFilter = choices.specialities.find((x) => x.id === wanted) ?? null;
  const rv = await listHospitalReviews(db, session, { hospitalId: id, specialityId: specFilter?.id ?? null });
  const path = `/portal/explore/hospitals/${id}`;

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

  return (
    <AreaPage
      area="portal"
      trail={[{ label: "Hospitals & specialities", href: "/portal/explore" }, { label: p.hospital.name }]}
      title={p.hospital.name}
      description="Seats by speciality from the latest seat matrix, and closing merit in the latest merit round."
    >
      <PageSections
        items={[
          ...(totalSeats || closings.length ? [{ id: "summary", label: "Summary" }] : []),
          ...(seatItems.length || p.closing.length ? [{ id: "seats", label: "Seats and closing merit" }] : []),
          ...(acc ? [{ id: "accreditation", label: "CPSP accreditation" }] : []),
          { id: "reviews", label: "Reviews" },
          { id: "discussion", label: "Questions" },
        ]}
      />
      {totalSeats || closings.length ? (
        <section id="summary" aria-label="Summary" className="scroll-mt-20 grid gap-5 rounded-xl bg-feature p-6 text-feature-ink shadow-[var(--mn-shadow-2)] sm:grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,1.4fr)] sm:p-7">
          <div><p className="text-xs text-feature-muted">Seats{p.seats[0] ? ` · induction ${p.seats[0].induction_id}` : ""}</p><p className="mt-1 font-serif text-4xl font-semibold tabular-nums">{totalSeats.toLocaleString("en-US")}</p></div>
          <div><p className="text-xs text-feature-muted">Specialities</p><p className="mt-1 font-serif text-4xl font-semibold tabular-nums">{seatsBySpec.size}</p></div>
          <div>
            <p className="text-xs text-feature-muted">Closing merit{latest ? ` · round ${latest.round_no}` : ""}</p>
            <p className="mt-1 font-serif text-4xl font-semibold tabular-nums">{closings.length ? formatMarks(Math.max(...closings)) : "—"}</p>
            {closings.length > 1 ? <p className="text-xs text-feature-muted">highest; lowest {formatMarks(Math.min(...closings))}{max ? ` of ${max}` : ""}</p> : null}
          </div>
          <div className="grid content-start gap-2 sm:border-l sm:border-feature-line sm:pl-6">
            <p className="text-xs text-feature-muted">Programmes</p>
            <ul className="flex flex-wrap gap-1.5">
              {programmes.map((pr) => (
                <li key={pr} className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-sm font-medium">
                  <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: `color-mix(in srgb, ${programColor(pr)} 55%, white)` }} />{pr}
                </li>
              ))}
            </ul>
            {acc?.matched ? <p className="text-xs text-feature-muted">CPSP accredited for {acc.covered.length} of {seatsBySpec.size} specialities (matched by name)</p> : null}
          </div>
        </section>
      ) : null}
      {seatItems.length === 0 && p.closing.length === 0 ? (
        <EmptyState title="No seats or merit data for this hospital yet" />
      ) : (
        <div id="seats" className="grid scroll-mt-20 grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
          <Card className="self-start">
            <CardHeader title={p.seats[0] ? `Seats · induction ${p.seats[0].induction_id}` : "Seats"} description="All programmes and quotas together." />
            {seatItems.length ? <BarList items={seatItems} /> : <p className="text-sm text-muted">Not in a seat matrix yet.</p>}
            <ChartSource tone="official" data="seats" source="PHF seat matrix" />
          </Card>
          <Card className="min-w-0">
            <CardHeader title={latest ? `Closing merit · induction ${latest.induction_id}, round ${latest.round_no}` : "Closing merit"} description={max ? `Out of ${max}.` : undefined} />
            {p.closing.length ? (
              <DataTable
                caption="Closing merit by speciality"
                rows={p.closing}
                rowKey={(r) => `${r.speciality}|${r.program}|${r.quota}`}
                columns={[
                  { key: "s", header: "Speciality", sort: (r) => r.speciality, cell: (r) => <EntityLink kind="speciality" id={r.speciality_id} name={r.speciality} /> },
                  { key: "pq", header: "Programme · quota", sort: (r) => `${r.program} ${r.quota}`, cell: (r) => <ProgramTag program={r.program} quota={r.quota} /> },
                  { key: "n", header: "Allocated", align: "right", sort: (r) => Number(r.allocations), cell: (r) => r.allocations },
                  { key: "c", header: "Closing", align: "right", tone: "mono", sort: (r) => Number(r.closing), cell: (r) => formatMarks(Number(r.closing)) },
                ]}
              />
            ) : <p className="text-sm text-muted">No merit rounds include this hospital yet.</p>}
          </Card>
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
      <DiscussionPanel topic={{ kind: "hospital", key: String(p.hospital.id) }} label={p.hospital.name} />
    </AreaPage>
  );
}
