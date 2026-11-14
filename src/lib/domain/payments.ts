/**
 * The automatic payment check for access requests. Pure: the data layer passes in the
 * request, the payment with the same transaction ID (if imported) and who else used it.
 *
 * Approved without a person only when it is provable: the transaction ID is in an imported
 * statement, the amount is enough, it was not used for another email, and the payment is
 * recent. Everything else goes to a person with the reason written out ("near miss").
 */

export type AutoResult = "matched" | "voucher" | "amount_short" | "tid_reused" | "duplicate_tid" | "tid_unseen" | "stale";

export const AUTO_LABELS: Record<AutoResult, { label: string; tone: "success" | "amber" | "danger" | "neutral"; note: string }> = {
  matched: { label: "Payment found", tone: "success", note: "Transaction ID found in an imported statement with the right amount." },
  voucher: { label: "Voucher", tone: "success", note: "A valid access code." },
  amount_short: { label: "Amount short", tone: "amber", note: "The transaction is in the statement, but the amount is below the price." },
  tid_reused: { label: "ID used before", tone: "danger", note: "This transaction ID already let another email in." },
  duplicate_tid: { label: "Same ID twice", tone: "danger", note: "Another waiting request gives the same transaction ID." },
  tid_unseen: { label: "Not in a statement yet", tone: "neutral", note: "No imported statement has this transaction ID yet. Import the latest statement, or check by hand." },
  stale: { label: "Old payment", tone: "amber", note: "The payment is older than this induction's access window." },
};

export type MatchInput = {
  request: { id: string; email: string; tid: string | null };
  /** The imported payment with the same transaction ID, if any. */
  payment: { id: string; amountPkr: number; paidAt: Date | null; matchedRequestId: string | null } | null;
  /** Email of the request the payment already let in, when it was another request. */
  matchedEmail: string | null;
  /** Other waiting requests giving the same transaction ID. */
  othersWithTid: number;
  priceMinPkr: number;
  /** Payments before this are too old (e.g. the induction's start); null = any age. */
  notBefore: Date | null;
};

export function matchPayment(i: MatchInput): { result: AutoResult; approve: boolean } {
  if (!i.request.tid) return { result: "tid_unseen", approve: false };
  if (i.othersWithTid > 0) return { result: "duplicate_tid", approve: false };
  if (!i.payment) return { result: "tid_unseen", approve: false };
  if (i.payment.matchedRequestId && i.payment.matchedRequestId !== i.request.id && i.matchedEmail !== i.request.email) return { result: "tid_reused", approve: false };
  if (i.payment.amountPkr + 0.5 < i.priceMinPkr) return { result: "amount_short", approve: false };
  if (i.notBefore && i.payment.paidAt && i.payment.paidAt < i.notBefore) return { result: "stale", approve: false };
  return { result: "matched", approve: true };
}

/**
 * When access bought now ends: the running cycle's end, but never sooner than 30 days from
 * now (someone paying in the cycle's last week still gets a month). Null = no known end.
 */
export function accessEnds(cycleEnd: Date | null, now: Date): Date | null {
  if (!cycleEnd) return null;
  const floor = new Date(now.getTime() + 30 * 86_400_000);
  return cycleEnd > floor ? cycleEnd : floor;
}

/** Remind once, in the last 7 days. */
export function dueForReminder(expiresAt: Date | null, remindedAt: Date | null, now: Date): boolean {
  if (!expiresAt || remindedAt) return false;
  const left = expiresAt.getTime() - now.getTime();
  return left > 0 && left <= 7 * 86_400_000;
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I

/** "MN-7K3Q-X9PD": 8 random characters from `bytes` (at least 8). */
export function voucherCode(bytes: Uint8Array): string {
  const c = Array.from(bytes.slice(0, 8), (b) => ALPHABET[b % ALPHABET.length]).join("");
  return `MN-${c.slice(0, 4)}-${c.slice(4, 8)}`;
}

/** What a person typed → the stored form: upper case, letters and digits only, "MN" prefix kept. */
export function normalizeVoucher(s: string): string {
  const t = s.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return t.startsWith("MN") ? t : `MN${t}`;
}
