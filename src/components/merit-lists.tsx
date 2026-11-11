import Link from "next/link";
import type { ReactNode } from "react";
import type { ListStep } from "@/lib/data/lists";
import { formatMarks } from "@/lib/format";
import { EntityLink } from "./entity-link";
import { Badge, type BadgeTone } from "./ui/badge";
import { Button, ButtonLink } from "./ui/button";
import { cn } from "./ui/cn";
import { DataTable } from "./ui/data-table";
import { fieldClass, selectClass } from "./ui/styles";

/*
 * Building blocks of the merit-list pages: the list navigator of an induction, view
 * tabs, filters, paging and the list of candidates (cards on a phone, a table above).
 */

const STEP_TONE: Record<ListStep["kind"], string> = {
  gazette: "border-navy/30",
  official: "border-line-strong",
  estimate: "border-dashed border-amber/70",
  simulate: "border-dashed border-line-strong",
};
const NOTE_TONE: Record<ListStep["kind"], string> = {
  gazette: "text-muted",
  official: "text-muted",
  estimate: "text-amber",
  simulate: "text-signal",
};

/**
 * Every list of an induction as large buttons in reading order (gazette, round 1,
 * round 2, …), two to a row on a phone so nothing is cut off or stacked on top of
 * another. The open list is filled in.
 */
export function ListNav({ steps, current, title }: { steps: ListStep[]; current?: string; title?: string }) {
  if (!steps.length) return null;
  return (
    <nav aria-label={title ?? "Lists in this induction"} className="grid gap-2">
      {title ? <h2 className="text-sm font-semibold text-heading">{title}</h2> : null}
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))]">
        {steps.map((s) => {
          const on = s.href === current;
          return (
            <li key={s.href}>
              <Link
                href={s.href}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "flex h-full min-h-14 flex-col justify-center rounded-xl border px-3 py-2 transition-colors",
                  on ? "border-signal bg-signal text-signal-ink" : cn("bg-surface hover:bg-hover", STEP_TONE[s.kind]),
                )}
              >
                <span className={cn("text-sm font-semibold", on ? "" : "text-heading")}>{s.label}</span>
                <span className={cn("text-xs", on ? "opacity-90" : NOTE_TONE[s.kind])}>{s.kind === "simulate" ? "→ " : ""}{s.note}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Two or three views of one page as a segmented control; links, so they work without JavaScript. */
export function ViewTabs({ items, current, label }: { items: { key: string; href: string; label: string }[]; current: string; label: string }) {
  return (
    <nav aria-label={label} className="grid auto-cols-fr grid-flow-col gap-1 rounded-xl border border-line bg-elevated p-1">
      {items.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.key === current ? "page" : undefined}
          className={cn(
            "grid min-h-10 place-items-center rounded-lg px-2 py-1.5 text-center text-sm font-semibold leading-tight transition-colors",
            t.key === current ? "bg-surface text-heading shadow-[var(--mn-shadow-1)]" : "text-muted hover:text-ink",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

export type FilterField = { name: string; label: string; options: string[]; value?: string };

/**
 * GET filter form: the name-or-id search always in view, the dropdowns folded away
 * behind "Filters" (open when one is set) so a phone sees the list, not a wall of
 * selects. Hidden fields keep the rest of the page's state (e.g. the view).
 */
export function ListFilters({ fields, search, keep = {}, clearHref, filtered }: {
  fields: FilterField[];
  search?: { value?: string; placeholder: string };
  keep?: Record<string, string>;
  clearHref: string;
  filtered: boolean;
}) {
  const active = fields.filter((f) => f.value).length;
  return (
    <form method="get" className="grid gap-3">
      {Object.entries(keep).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <div className="flex flex-wrap items-end gap-2">
        {search ? (
          <label className="grid min-w-0 flex-1 basis-56 gap-1.5 text-sm font-medium">
            Search
            <input type="search" name="q" defaultValue={search.value ?? ""} placeholder={search.placeholder} autoComplete="off" className={cn(fieldClass, "h-10")} />
          </label>
        ) : null}
        <Button type="submit" variant="secondary">{search ? "Search" : "Show"}</Button>
        {filtered ? <ButtonLink href={clearHref} variant="ghost">Clear</ButtonLink> : null}
      </div>
      <details open={active > 0} className="group rounded-lg border border-line">
        <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-2 px-3 text-sm font-semibold text-heading [&::-webkit-details-marker]:hidden">
          <span>Filters{active ? ` · ${active} on` : ""} <span className="font-normal text-muted">({fields.map((f) => f.label.toLowerCase()).join(", ")})</span></span>
          <span aria-hidden className="text-muted transition-transform group-open:rotate-180">▾</span>
        </summary>
        <div className="grid gap-3 border-t border-line p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {fields.map((f) => (
            <label key={f.name} className="grid min-w-0 gap-1.5 text-sm font-medium">
              {f.label}
              <select name={f.name} defaultValue={f.value ?? ""} className={selectClass}>
                <option value="">All</option>
                {f.options.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
          ))}
          <div className="flex items-end"><Button type="submit" variant="secondary">Apply filters</Button></div>
        </div>
      </details>
    </form>
  );
}

/** Previous / page n of m / next, as links that keep the other query parameters. */
export function Pager({ page, pages, hrefFor, total, noun }: { page: number; pages: number; hrefFor: (page: number) => string; total: number; noun: string }) {
  const from = total ? (page - 1) * 100 + 1 : 0, to = Math.min(total, page * 100);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <span className="text-muted" aria-live="polite">
        {total ? `${from.toLocaleString("en-US")}–${to.toLocaleString("en-US")} of ${total.toLocaleString("en-US")} ${noun}` : `No ${noun}`}
      </span>
      {pages > 1 ? (
        <span className="flex items-center gap-2">
          {page > 1 ? <ButtonLink href={hrefFor(page - 1)} variant="secondary" size="sm">← Previous</ButtonLink> : null}
          <span className="tabular-nums text-muted">Page {page} of {pages}</span>
          {page < pages ? <ButtonLink href={hrefFor(page + 1)} variant="secondary" size="sm">Next →</ButtonLink> : null}
        </span>
      ) : null}
    </div>
  );
}

const CONSENT_TONE: Record<string, BadgeTone> = { Accepted: "success", Rejected: "danger", "Not Avail": "neutral", Awaited: "warning", Eligible: "success" };

/** A consent or status as published, coloured by meaning. */
export function StatusBadge({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="text-subtle">—</span>;
  return <Badge tone={CONSENT_TONE[value] ?? (/reject/i.test(value) ? "danger" : "neutral")}>{value}</Badge>;
}

export type CandidateRow = {
  rank: number; applicantId: string; name: string | null; marks: number;
  program: string; quota: string; speciality: string; specialityId?: number | null; hospital: string; hospitalId?: number | null;
  preferenceNo: number; consent?: string | null;
};

const person = (r: CandidateRow, me?: string | null) => (
  <>
    <Link href={`/portal/history/find?id=${encodeURIComponent(r.applicantId)}`} className="font-semibold text-heading hover:underline">{r.name ?? "Name not published"}</Link>
    <span className="block font-mono text-xs text-muted">{r.applicantId}{r.applicantId === me ? <Badge tone="current" className="ml-2">you</Badge> : null}</span>
  </>
);
const seat = (r: CandidateRow) => (
  <>
    <span className="font-medium">{r.specialityId !== undefined ? <EntityLink kind="speciality" id={r.specialityId ?? null} name={r.speciality} /> : r.speciality}</span>
    <span className="block text-xs text-muted">{r.hospital}</span>
  </>
);

/**
 * Candidates on a list, best marks first. A phone gets one card per candidate (name,
 * marks, seat, preference and consent, no sideways scrolling); wider screens a table.
 */
export function CandidateList({ rows, me, caption, showConsent = true, extra }: {
  rows: CandidateRow[];
  me?: string | null;
  caption: string;
  showConsent?: boolean;
  /** Something to show at the end of each row (e.g. a link). */
  extra?: (r: CandidateRow) => ReactNode;
}) {
  return (
    <>
      <ol className="grid gap-2 sm:hidden" aria-label={caption}>
        {rows.map((r) => (
          <li key={`${r.rank}-${r.applicantId}-${r.program}-${r.quota}`} className={cn("rounded-xl border bg-surface p-3", r.applicantId === me ? "border-signal" : "border-line")}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="mr-2 font-mono text-xs text-subtle">#{r.rank}</span>
                {person(r, me)}
              </div>
              <span className="font-mono text-base font-semibold tabular-nums text-heading">{formatMarks(r.marks)}</span>
            </div>
            <div className="mt-2 text-sm">{seat(r)}</div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
              <span>{r.program} · {r.quota}{r.preferenceNo ? ` · preference #${r.preferenceNo}` : ""}</span>
              <span className="flex items-center gap-2">{showConsent ? <StatusBadge value={r.consent} /> : null}{extra?.(r)}</span>
            </div>
          </li>
        ))}
      </ol>
      <div className="hidden sm:block">
        <DataTable
          caption={caption}
          rows={rows}
          rowKey={(r) => `${r.rank}-${r.applicantId}-${r.program}-${r.quota}`}
          columns={[
            { key: "rank", header: "#", align: "right", tone: "mono", cell: (r) => r.rank },
            { key: "who", header: "Candidate", cell: (r) => person(r, me) },
            { key: "m", header: "Marks", align: "right", tone: "mono", cell: (r) => formatMarks(r.marks) },
            { key: "seat", header: "Seat", cell: seat },
            { key: "pq", header: "Programme · quota", tone: "muted", cell: (r) => `${r.program} · ${r.quota}` },
            { key: "p", header: "Pref.", align: "right", cell: (r) => (r.preferenceNo ? `#${r.preferenceNo}` : "—") },
            ...(showConsent ? [{ key: "c", header: "Consent", cell: (r: CandidateRow) => <StatusBadge value={r.consent} /> }] : []),
            ...(extra ? [{ key: "x", header: <span className="sr-only">More</span>, cell: (r: CandidateRow) => extra(r) }] : []),
          ]}
        />
      </div>
    </>
  );
}

/** Query string from the given values, leaving out empty ones. */
export function qs(values: Record<string, string | number | undefined | null>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(values)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}
