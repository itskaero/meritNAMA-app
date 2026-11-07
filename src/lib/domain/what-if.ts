import type { CascadeConsentRow } from "@/lib/engine/cascade";

/**
 * Simulated consent ("what if"): each allocation on a list gets a status, officially or
 * as a person changed it, and the cascade reads them as consent replies. Pure.
 */

export const CONSENT_STATUSES = ["Accepted", "Rejected", "Awaited"] as const;
export type ConsentStatus = (typeof CONSENT_STATUSES)[number];

export type ListAllocation = {
  applicantId: string;
  program: string;
  quota: string;
  speciality: string;
  hospital: string;
  preferenceNo: number;
  mark: number;
  /** "program|speciality|hospital|quota", as the cascade keys seats. */
  seatKey: string;
};

export type OfficialReply = {
  applicantId: string;
  status: string;
  program: string;
  quota: string;
  preferenceNo: number;
  /** From the reply's title, when it could be parsed. */
  speciality?: string | null;
  hospital?: string | null;
};

const norm = (s: string) => s.trim().replace(/\s+/g, " ");

/** A reply is about an allocation: same programme and quota, and the same seat by title or preference number. */
function replyIsFor(r: OfficialReply, a: ListAllocation) {
  if (norm(r.program) !== norm(a.program) || norm(r.quota) !== norm(a.quota)) return false;
  if (r.speciality && r.hospital) return norm(r.speciality) === norm(a.speciality) && norm(r.hospital) === norm(a.hospital);
  return r.preferenceNo > 0 && r.preferenceNo === a.preferenceNo;
}

export const allocationKey = (applicantId: string, seatKey: string) => `${applicantId}|${seatKey}`;

/** The next status when a person taps the toggle (as on the legacy site). */
export function nextStatus(s: ConsentStatus): ConsentStatus {
  return s === "Accepted" ? "Rejected" : s === "Rejected" ? "Awaited" : "Accepted";
}

const asStatus = (s: string): ConsentStatus => (s === "Accepted" || s === "Rejected" ? s : "Awaited");

/**
 * Each allocation's official status from the round's replies. A reply names its seat in
 * its title (else by programme, quota and preference number: some exports leave the
 * preference number 0). A candidate who accepted one seat gave up the others;
 * one who replied otherwise has that status on every seat; no reply is Awaited.
 */
export function officialStatuses(list: readonly ListAllocation[], replies: readonly OfficialReply[]): Map<string, ConsentStatus> {
  const byApplicant = new Map<string, OfficialReply[]>();
  for (const r of replies) (byApplicant.get(r.applicantId) ?? byApplicant.set(r.applicantId, []).get(r.applicantId)!).push(r);
  const out = new Map<string, ConsentStatus>();
  for (const a of list) {
    const rs = byApplicant.get(a.applicantId) ?? [];
    const own = rs.find((r) => replyIsFor(r, a));
    let status: ConsentStatus;
    if (own) status = asStatus(own.status);
    else if (rs.some((r) => r.status === "Accepted")) status = "Rejected";
    else if (rs.length && rs.every((r) => r.status === "Rejected")) status = "Rejected";
    else status = "Awaited";
    out.set(allocationKey(a.applicantId, a.seatKey), status);
  }
  return out;
}

/**
 * Per-allocation statuses → consent replies, as the legacy site built them: each accepted
 * seat is an acceptance; a candidate with no acceptance and every seat rejected has
 * rejected; anyone else is awaited.
 */
export function consentRows(list: readonly ListAllocation[], statusOf: (key: string) => ConsentStatus): CascadeConsentRow[] {
  const byApplicant = new Map<string, ListAllocation[]>();
  for (const a of list) (byApplicant.get(a.applicantId) ?? byApplicant.set(a.applicantId, []).get(a.applicantId)!).push(a);
  const rows: CascadeConsentRow[] = [];
  for (const [id, seats] of byApplicant) {
    const statuses = seats.map((s) => statusOf(allocationKey(id, s.seatKey)));
    const accepted = seats.filter((_, i) => statuses[i] === "Accepted");
    if (accepted.length) for (const s of accepted) rows.push({ applicantId: Number(id), status: "Accepted", preferenceNo: s.preferenceNo, seatKey: s.seatKey });
    else rows.push({ applicantId: Number(id), status: statuses.every((s) => s === "Rejected") ? "Rejected" : "Awaited", preferenceNo: 0, seatKey: null });
  }
  return rows;
}

export function isConsentStatus(v: unknown): v is ConsentStatus {
  return typeof v === "string" && (CONSENT_STATUSES as readonly string[]).includes(v);
}
