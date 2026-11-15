import { z } from "zod";
import { normalizeEmail } from "./identity";

/*
 * The paywall: while it is on, signing in needs an approved access request. People pay by
 * Easypaisa, JazzCash or bank transfer and give the transaction ID (TID). A TID found in an
 * imported statement with the right amount approves the request at once
 * (src/lib/domain/payments.ts); anything else waits for a person. A voucher code also lets
 * someone in. Access lasts one induction cycle. Pure rules; src/lib/data/access.ts does the
 * reading and writing.
 */

export type AccessSettings = {
  /** Sign-in needs an approved request. */
  paywall: boolean;
  /** Requests can be sent (turn off to close the door without lifting the paywall). */
  requestsOpen: boolean;
  /** A payment amount and reference are required with a request. */
  paymentRequired: boolean;
  priceMinPkr: number;
  priceMaxPkr: number;
  bankName: string;
  accountNumber: string;
  accountTitle: string;
  raastId: string;
  easypaisaNumber: string;
  jazzcashNumber: string;
  /** Account title of the wallets, shown to payers. */
  walletTitle: string;
  /** Access ends with the induction cycle it was bought in. */
  perInduction: boolean;
  /** The induction access is sold for now; null = the latest one PHF's files show. */
  saleInduction: number | null;
  /** When that induction's access ends (YYYY-MM-DD, Pakistan time); null = PHF's schedule, else no end yet. */
  accessEndsOn: string | null;
  /** Shown above the payment details. */
  note: string;
  closedMessage: string;
  /** What happens if a payment is made and access is not given; shown on the request form and in the terms. */
  refundNote: string;
  /** People who already had an account when the paywall went on keep signing in. */
  keepExisting: boolean;
  /** When the paywall was switched on (ISO), for keepExisting. */
  since: string | null;
};

export const DEFAULT_ACCESS: AccessSettings = {
  paywall: false,
  requestsOpen: true,
  paymentRequired: true,
  priceMinPkr: 250,
  priceMaxPkr: 670,
  bankName: "",
  accountNumber: "",
  accountTitle: "",
  raastId: "",
  easypaisaNumber: "",
  jazzcashNumber: "",
  walletTitle: "",
  perInduction: true,
  saleInduction: null,
  accessEndsOn: null,
  note: "Send the amount from Easypaisa, JazzCash or your bank app, then enter the transaction ID (TID) from the confirmation. If we already have the payment you are in at once; otherwise we check it, usually the same day.",
  closedMessage: "Access requests are closed for now. Please check back later.",
  refundNote: "If your request is rejected, or you ask within 7 days and have not used the site, we send your payment back. Write to us from the Contact page with your transaction reference.",
  keepExisting: true,
  since: null,
};

export const accessSettingsSchema = z
  .object({
    paywall: z.boolean(),
    requestsOpen: z.boolean(),
    paymentRequired: z.boolean(),
    priceMinPkr: z.number().int().min(0).max(1_000_000),
    priceMaxPkr: z.number().int().min(0).max(1_000_000),
    bankName: z.string().trim().max(80),
    accountNumber: z.string().trim().max(60),
    accountTitle: z.string().trim().max(80),
    raastId: z.string().trim().max(60),
    easypaisaNumber: z.string().trim().max(30),
    jazzcashNumber: z.string().trim().max(30),
    walletTitle: z.string().trim().max(80),
    perInduction: z.boolean(),
    saleInduction: z.number().int().min(1).max(999).nullable(),
    accessEndsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date.").nullable(),
    note: z.string().trim().max(600),
    closedMessage: z.string().trim().max(300),
    refundNote: z.string().trim().max(500),
    keepExisting: z.boolean(),
  })
  .refine((s) => s.priceMinPkr <= s.priceMaxPkr, { path: ["priceMaxPkr"], message: "The highest amount cannot be below the lowest." })
  .refine((s) => !s.paywall || !s.paymentRequired || [s.accountNumber, s.raastId, s.easypaisaNumber, s.jazzcashNumber].some((x) => x.length > 0), {
    path: ["easypaisaNumber"],
    message: "Add a wallet number, account number or Raast ID people should pay, before turning the paywall on.",
  });

export type SaleTerms = { induction: number | null; start: Date | null; end: Date | null; source: "set" | "schedule" | "none" };

/** The end of a calendar day in Pakistan (UTC+5). */
export const endOfDayPk = (iso: string) => new Date(`${iso}T18:59:59Z`);

/**
 * What access bought now is for: the induction the owner chose (else the latest in PHF's
 * files), ending on the owner's date, else on PHF's schedule for that induction, else with
 * no end until a date is set. PHF rarely publishes the whole schedule up front.
 */
export function saleTerms(s: Pick<AccessSettings, "saleInduction" | "accessEndsOn">, cycle: { induction: number | null; start: Date | null; end: Date | null }): SaleTerms {
  const induction = s.saleInduction ?? cycle.induction;
  const same = induction != null && induction === cycle.induction;
  const start = same ? cycle.start : null;
  if (s.accessEndsOn) return { induction, start, end: endOfDayPk(s.accessEndsOn), source: "set" };
  if (same && cycle.end) return { induction, start, end: cycle.end, source: "schedule" };
  return { induction, start, end: null, source: "none" };
}

/** "PKR 250–670", or one amount when both are the same. */
export function priceText(s: Pick<AccessSettings, "priceMinPkr" | "priceMaxPkr">): string {
  const f = (n: number) => n.toLocaleString("en-US");
  return s.priceMinPkr === s.priceMaxPkr ? `PKR ${f(s.priceMinPkr)}` : `PKR ${f(s.priceMinPkr)}–${f(s.priceMaxPkr)}`;
}

/** The request form's fields, checked against the settings. A voucher code replaces the payment. */
export function accessRequestSchema(s: Pick<AccessSettings, "paymentRequired" | "priceMinPkr">) {
  return z
    .object({
      email: z.string().transform((v) => normalizeEmail(v) ?? "").pipe(z.string().min(3, "Enter a valid email address.")),
      applicantId: z
        .string()
        .trim()
        .max(20)
        .regex(/^\d*$/, "The applicant ID is numbers only.")
        .transform((v) => v || null),
      channel: z.enum(["easypaisa", "jazzcash", "bank"]).nullable().catch(null),
      amountPkr: z.number().min(0).max(1_000_000).nullable(),
      /** Transaction ID (TID) or bank reference. */
      reference: z.string().trim().max(120).transform((v) => v || null),
      voucher: z.string().trim().max(40).optional().transform((v) => v || null),
      message: z.string().trim().max(500).transform((v) => v || null),
    })
    .superRefine((v, ctx) => {
      if (v.voucher || !s.paymentRequired) return;
      if (!v.reference || v.reference.replace(/[^A-Za-z0-9]/g, "").length < 6) ctx.addIssue({ code: "custom", path: ["reference"], message: "Enter the transaction ID (TID) from your payment confirmation." });
      if (v.amountPkr != null && v.amountPkr < s.priceMinPkr) ctx.addIssue({ code: "custom", path: ["amountPkr"], message: `The lowest amount is PKR ${s.priceMinPkr.toLocaleString("en-US")}.` });
    });
}

export type AccessDecision = { allowed: true } | { allowed: false; reason: "paywall" | "expired" };

/**
 * May this email sign in? Always when the paywall is off, for owners and team members,
 * for an approved request, and (if kept) for accounts that existed before the paywall.
 */
export function accessDecision(input: {
  settings: Pick<AccessSettings, "paywall" | "keepExisting" | "since">;
  ownerEmail: boolean;
  existingRole: string | null;
  existingSince: Date | null;
  approved: boolean;
  /** When the approved access ends (null = no end). */
  expiresAt?: Date | null;
  now?: Date;
}): AccessDecision {
  if (!input.settings.paywall) return { allowed: true };
  if (input.ownerEmail) return { allowed: true };
  if (input.existingRole && input.existingRole !== "candidate") return { allowed: true };
  const expired = input.approved && input.expiresAt != null && input.expiresAt <= (input.now ?? new Date());
  if (input.approved && !expired) return { allowed: true };
  const since = input.settings.since ? Date.parse(input.settings.since) : NaN;
  if (input.settings.keepExisting && input.existingSince && Number.isFinite(since) && input.existingSince.getTime() < since) return { allowed: true };
  return { allowed: false, reason: expired ? "expired" : "paywall" };
}

export const ACCESS_DENIED = "Sign-in needs approval first. Use Request access on the sign-in page.";
export const ACCESS_EXPIRED = "Your access ended with the last induction. Renew it at /access with the same email; your account stays as it is.";
