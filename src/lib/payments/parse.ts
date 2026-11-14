/**
 * Payment statements in, payment rows out: transaction ID, amount, time and channel. Nothing
 * else leaves this file: payer names and phone numbers in an SMS or a statement line are
 * never copied into the result. Two formats:
 *   - pasted SMS / app notifications (Easypaisa, JazzCash, bank alerts), one or many;
 *   - a CSV statement export with a header row.
 * Tolerant on purpose: wallets reword their messages. A line we cannot read is reported back,
 * never guessed.
 */

export type Channel = "easypaisa" | "jazzcash" | "bank";
export const CHANNELS: Channel[] = ["easypaisa", "jazzcash", "bank"];
export const CHANNEL_LABELS: Record<Channel, string> = { easypaisa: "Easypaisa", jazzcash: "JazzCash", bank: "Bank transfer" };

export type ParsedPayment = { channel: Channel; tid: string; amountPkr: number; paidAt: Date | null };
export type ParseResult = { payments: ParsedPayment[]; skipped: number };

/** "TID: 123 456-789" → "123456789". Upper case, letters and digits only. */
export function normalizeTid(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** A transaction ID: 6–24 letters/digits with at least 6 digits (so a word is never taken for one). */
export function looksLikeTid(s: string): boolean {
  const t = normalizeTid(s);
  return t.length >= 6 && t.length <= 24 && (t.match(/\d/g)?.length ?? 0) >= 6;
}

const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

/** Pakistan time (UTC+5) date and optional time → Date. Accepts 14-Nov-2026, 14/11/2026, 2026-11-14, with 10:32 PM or 22:32. */
export function parsePkDate(s: string): Date | null {
  const t = s.trim();
  let y: number, mo: number, d: number;
  let m = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (m) [y, mo, d] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
  else if ((m = /(\d{1,2})[-/ ]([A-Za-z]{3})[A-Za-z]*[-/ ,]+(\d{2,4})/.exec(t))) [d, mo, y] = [Number(m[1]), MONTHS[m[2]!.toLowerCase()] ?? -1, Number(m[3])];
  else if ((m = /(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(t))) [d, mo, y] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
  else return null;
  if (y < 100) y += 2000;
  if (mo < 0 || mo > 11 || d < 1 || d > 31) return null;
  let hh = 0, mm = 0;
  const tm = /(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?/.exec(t.slice((m.index ?? 0) + m[0].length)) ?? /(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?/.exec(t);
  if (tm) {
    hh = Number(tm[1]) % 24; mm = Number(tm[2]);
    const ap = tm[3]?.toLowerCase();
    if (ap === "pm" && hh < 12) hh += 12;
    if (ap === "am" && hh === 12) hh = 0;
  }
  const out = new Date(Date.UTC(y, mo, d, hh - 5, mm));
  return Number.isNaN(out.getTime()) ? null : out;
}

const amountOf = (s: string) => Number(s.replace(/,/g, ""));

function channelOf(text: string, fallback: Channel): Channel {
  if (/easy\s*paisa|telenor/i.test(text)) return "easypaisa";
  if (/jazz\s*cash|mobilink/i.test(text)) return "jazzcash";
  return fallback;
}

const TID_RE = /\b(?:TID|Trx\.?\s*ID|TrxID|Txn\.?\s*ID|Transaction\s*(?:ID|No\.?|#)|Trans\s*ID|Ref(?:erence)?\.?\s*(?:No\.?|#|ID)?|RRN|STAN)\s*[:#.\-]?\s*([A-Za-z0-9]{3,24}(?:[ -]\d{2,12})*)/i;
const AMOUNT_RE = /\b(?:Rs\.?|PKR)\s*([\d,]+(?:\.\d{1,2})?)/i;
const DATE_RE = /(\d{4}-\d{1,2}-\d{1,2}(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?|\d{1,2}[-/ ][A-Za-z]{3}[A-Za-z]*[-/ ,]+\d{2,4}(?:,?\s*\d{1,2}:\d{2}(?::\d{2})?\s*[AaPp]?[Mm]?)?|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}(?:,?\s*\d{1,2}:\d{2}(?::\d{2})?\s*[AaPp]?[Mm]?)?)/;

/** Received money only: an SMS about money sent or a bill paid is skipped. */
const isOutgoing = (s: string) => /\b(sent|paid to|transferred to|debited|bill payment|withdraw)/i.test(s) && !/\b(received|credited|deposit)/i.test(s);

/** One or many pasted messages. Messages are split on blank lines. */
export function parseSms(text: string, fallback: Channel = "bank"): ParseResult {
  const blocks = text.replace(/\r/g, "").split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const payments: ParsedPayment[] = [];
  let skipped = 0;
  for (const b of blocks) {
    const tid = TID_RE.exec(b)?.[1];
    const amount = AMOUNT_RE.exec(b)?.[1];
    if (!tid || !amount || !looksLikeTid(tid) || isOutgoing(b)) { skipped++; continue; }
    const date = DATE_RE.exec(b)?.[1];
    payments.push({ channel: channelOf(b, fallback), tid: normalizeTid(tid), amountPkr: amountOf(amount), paidAt: date ? parsePkDate(date) : null });
  }
  return { payments, skipped };
}

/** Minimal CSV: commas or semicolons, double quotes. */
export function csvRows(text: string): string[][] {
  const delim = (text.split("\n")[0] ?? "").split(";").length > (text.split("\n")[0] ?? "").split(",").length ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cell.trim()); cell = ""; }
    else if (c === "\n") { row.push(cell.trim()); rows.push(row); row = []; cell = ""; }
    else if (c !== "\r") cell += c;
  }
  if (cell.trim() || row.length) { row.push(cell.trim()); rows.push(row); }
  return rows.filter((r) => r.some((x) => x));
}

const col = (header: string[], ...names: RegExp[]) => header.findIndex((h) => names.some((n) => n.test(h)));

/** A statement export: finds the transaction ID, amount (or credit) and date columns by their header. */
export function parseCsv(text: string, fallback: Channel = "bank"): ParseResult {
  const rows = csvRows(text);
  const hi = rows.findIndex((r) => col(r, /trans.*id|tid|trx|txn|reference|ref\b|rrn/i) >= 0);
  if (hi < 0) return { payments: [], skipped: rows.length };
  const h = rows[hi]!.map((x) => x.toLowerCase());
  const iTid = col(h, /trans.*id|^tid|trx.*id|txn.*id|reference|^ref|rrn/i);
  const iCredit = col(h, /credit|received|deposit/i);
  const iAmount = iCredit >= 0 ? iCredit : col(h, /amount|amt/i);
  const iDebit = col(h, /debit|sent|withdraw/i);
  const iDate = col(h, /date|time/i);
  const iType = col(h, /type|description|narration|details/i);
  const payments: ParsedPayment[] = [];
  let skipped = 0;
  for (const r of rows.slice(hi + 1)) {
    const tid = r[iTid] ?? "";
    const amount = amountOf((r[iAmount] ?? "").replace(/[^\d.,-]/g, ""));
    const debit = iDebit >= 0 && iDebit !== iAmount ? amountOf((r[iDebit] ?? "").replace(/[^\d.,]/g, "")) : 0;
    const type = iType >= 0 ? r[iType] ?? "" : "";
    if (!looksLikeTid(tid) || !(amount > 0) || debit > 0 || (type && isOutgoing(type))) { skipped++; continue; }
    payments.push({ channel: channelOf(type || text.slice(0, 200), fallback), tid: normalizeTid(tid), amountPkr: amount, paidAt: iDate >= 0 ? parsePkDate(r[iDate] ?? "") : null });
  }
  return { payments, skipped };
}

/** Pasted text: a CSV when the first line looks like a header with commas, otherwise messages. */
export function parseStatement(text: string, fallback: Channel = "bank"): ParseResult & { format: "csv" | "sms" } {
  const first = text.trim().split("\n")[0] ?? "";
  const csv = /[,;]/.test(first) && /(trans|tid|trx|txn|ref|rrn)/i.test(first) && /(amount|credit|amt)/i.test(first);
  const r = csv ? parseCsv(text, fallback) : parseSms(text, fallback);
  // The same transaction pasted twice counts once.
  const seen = new Set<string>();
  const payments = r.payments.filter((p) => (seen.has(p.tid) ? false : (seen.add(p.tid), true)));
  return { payments, skipped: r.skipped + (r.payments.length - payments.length), format: csv ? "csv" : "sms" };
}
