import { parse, type HTMLElement } from "node-html-parser";

/**
 * Job source parsers. Pure: HTML in, plain job records out. Each source has its own
 * function so one site changing its markup never breaks the others. We keep a summary
 * and the link to the original advert; PDFs are never downloaded.
 */

export type JobSource = "jobzpk" | "shcme" | "pshd" | "ppsc";

export type RawJob = {
  source: JobSource;
  /** Stable id within the source (an id from the URL, or a hash of the link). */
  sourceId: string;
  title: string;
  employer: string | null;
  city: string | null;
  /** ISO dates (YYYY-MM-DD) or null. */
  postedOn: string | null;
  lastDate: string | null;
  link: string;
  official: boolean;
  education: string[];
  vacancies: string[];
  applyOnline: boolean | null;
  /** PPSC advertisement and case numbers, when known. */
  adNo: string | null;
};

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => (y > 2000 && m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${pad(m)}-${pad(d)}` : null);

/** "12-Nov-2026", "30 November, 2026", "13.11.2026", "26/11/2026", "30-11-2026" → "2026-11-30". */
export function parseDate(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  let m = /(\d{1,2})[\s-]+([A-Za-z]{3,9})[\s,-]+(\d{4})/.exec(s);
  if (m) return iso(Number(m[3]), MONTHS[m[2]!.slice(0, 3).toLowerCase()] ?? 0, Number(m[1]));
  m = /(\d{1,2})[./-](\d{1,2})[./-](\d{4})/.exec(s);
  if (m) return iso(Number(m[3]), Number(m[2]), Number(m[1]));
  return null;
}

const text = (el: HTMLElement | null | undefined) => (el?.text ?? "").replace(/\s+/g, " ").trim();
const abs = (href: string, base: string) => {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
};
/** djb2, base 36: a short stable id for a link. */
export function shortHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

// ── jobz.pk (medical category) ─────────────────────────────────────────────────

export type JobzListItem = { id: string; title: string; link: string; city: string | null; postedOn: string | null };

/** The listing page: one row per advert (title, city, date posted). */
export function parseJobzList(html: string): JobzListItem[] {
  const root = parse(html);
  const out: JobzListItem[] = [];
  for (const row of root.querySelectorAll("div.row_container")) {
    const a = row.querySelector("div.cell31 a");
    const href = a?.getAttribute("href") ?? "";
    const id = /_jobs-(\d+)\.html/.exec(href)?.[1];
    if (!a || !id) continue;
    out.push({ id, title: text(a), link: href, city: text(row.querySelector("div.cell32")) || null, postedOn: parseDate(text(row.querySelector("div.cell33"))) });
  }
  return out;
}

export type JobzDetail = { organization: string | null; education: string[]; lastDate: string | null; applyOnline: boolean | null; vacancies: string[]; location: string | null; postedOn: string | null };

/** A job's own page: label/value rows, and the "Vacancies in …" block. */
export function parseJobzDetail(html: string): JobzDetail {
  const root = parse(html);
  const fields = new Map<string, string>();
  for (const row of root.querySelectorAll("div.row_job_detail")) {
    const t = text(row);
    const i = t.indexOf(":");
    if (i > 0) fields.set(t.slice(0, i).trim().toLowerCase(), t.slice(i + 1).trim());
  }
  const vacancies: string[] = [];
  const heading = root.querySelectorAll("h3").find((h) => /^Vacancies in/i.test(text(h)));
  const block = heading?.parentNode?.querySelector("div.row_cont_onecell");
  for (const c of block?.querySelectorAll("div.one_cell") ?? []) {
    const v = text(c);
    if (v) vacancies.push(v);
  }
  const apply = fields.get("apply online if applicable");
  return {
    organization: fields.get("organization") || null,
    education: (fields.get("education") ?? "").split(/[|,]/).map((s) => s.trim()).filter(Boolean),
    lastDate: parseDate(fields.get("expected last date")),
    applyOnline: apply == null ? null : !/not|n\/a/i.test(apply),
    vacancies: [...new Set(vacancies)],
    location: fields.get("vacancy location") || null,
    postedOn: parseDate(fields.get("date posted / updated")),
  };
}

export function jobzToRaw(item: JobzListItem, d: JobzDetail | null): RawJob {
  return {
    source: "jobzpk",
    sourceId: item.id,
    title: item.title,
    employer: d?.organization ?? null,
    city: item.city ?? (d?.location?.split(",")[0]?.trim() || null),
    postedOn: d?.postedOn ?? item.postedOn,
    lastDate: d?.lastDate ?? null,
    link: item.link,
    official: false,
    education: d?.education ?? [],
    vacancies: d?.vacancies ?? [],
    applyOnline: d?.applyOnline ?? null,
    adNo: null,
  };
}

// ── Specialized Healthcare & Medical Education (health.punjab.gov.pk/Jobs.aspx) ──

/** Table GridView1: description, last date, and the advert file name (served under /uploads/jobs/). */
export function parseShcme(html: string, base = "https://health.punjab.gov.pk/"): RawJob[] {
  const root = parse(html);
  const out: RawJob[] = [];
  for (const tr of root.querySelectorAll("table[id$=GridView1] tr")) {
    const td = tr.querySelectorAll("td");
    if (td.length < 4) continue;
    const title = text(td[1]);
    const file = td[3]!.querySelector("[data-id-attr]")?.getAttribute("data-id-attr") ?? td[3]!.querySelector("a")?.getAttribute("href") ?? "";
    if (!title) continue;
    const link = file ? abs(/^https?:|^\//.test(file) ? file : `uploads/jobs/${encodeURIComponent(file).replace(/%2F/g, "/")}`, base) : null;
    out.push({
      source: "shcme", sourceId: shortHash(`${title}|${file}`), title, employer: "Specialized Healthcare & Medical Education Department",
      city: null, postedOn: null, lastDate: parseDate(text(td[2])), link: link ?? `${base}Jobs.aspx`, official: true,
      education: [], vacancies: [], applyOnline: null, adNo: null,
    });
  }
  return out;
}

// ── Primary & Secondary Healthcare (pshealthpunjab.gov.pk/Home/Jobs) ──────────

/** Table: title (often with "Close date-…" inside), a date, and the advert link under /Upload/Jobs/. */
export function parsePshd(html: string, base = "https://pshealthpunjab.gov.pk/"): RawJob[] {
  const root = parse(html);
  const out: RawJob[] = [];
  for (const tr of root.querySelectorAll("table tr")) {
    const td = tr.querySelectorAll("td");
    if (td.length < 3) continue;
    const a = td[1]!.querySelector("a") ?? td[td.length - 1]!.querySelector("a");
    const title = text(td[1]).replace(/\s*-?\s*Close date\s*-?\s*[\d/.-]+.*$/i, "").trim();
    const href = a?.getAttribute("href") ?? "";
    if (!title || !href) continue;
    const closing = /Close date\s*-?\s*([\d./-]+)/i.exec(text(td[1]))?.[1];
    out.push({
      source: "pshd", sourceId: shortHash(href), title, employer: "Primary & Secondary Healthcare Department",
      city: null, postedOn: null, lastDate: parseDate(closing ?? text(td[2])), link: abs(href, base) ?? `${base}Home/Jobs`, official: true,
      education: [], vacancies: [], applyOnline: null, adNo: null,
    });
  }
  return out;
}

// ── Punjab Public Service Commission (ppsc.gop.pk/Jobs.aspx) ──────────────────

/** Table tbl_Jobs: ad no, case no, post, fee, department, ad date, closing date. Links go to the jobs page (PDFs are not fetched). */
export function parsePpsc(html: string, base = "https://ppsc.gop.pk/"): RawJob[] {
  const root = parse(html);
  const out: RawJob[] = [];
  for (const tr of root.querySelectorAll("table[id$=tbl_Jobs] tr")) {
    const td = tr.querySelectorAll("td").map(text);
    if (td.length < 8) continue;
    const [, adNo, caseNo, post, , department, adDate, closing] = td;
    if (!post) continue;
    out.push({
      source: "ppsc", sourceId: (caseNo || shortHash(`${adNo}|${post}`)).toLowerCase(), title: post.replace(/\s+/g, " "),
      employer: department ? department.replace(/\s+/g, " ") : null, city: null, postedOn: parseDate(adDate), lastDate: parseDate(closing),
      link: `${base}Jobs.aspx`, official: true, education: [], vacancies: [], applyOnline: true, adNo: adNo || null,
    });
  }
  return out;
}
