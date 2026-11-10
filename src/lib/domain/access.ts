import { z } from "zod";
import { normalizeEmail } from "./identity";

/*
 * The paywall: while it is on, signing in needs an approved access request. People pay by
 * bank transfer, tell us the amount and the bank's reference, and staff check the payment
 * by hand before approving. Pure rules; src/lib/data/access.ts does the reading and writing.
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
  bankName: "Mashreq Pakistan",
  accountNumber: "",
  accountTitle: "",
  raastId: "",
  note: "Send the amount to the account below from your banking app, then paste the transaction reference. We check each payment by hand, so approval can take a little while.",
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
    note: z.string().trim().max(600),
    closedMessage: z.string().trim().max(300),
    refundNote: z.string().trim().max(500),
    keepExisting: z.boolean(),
  })
  .refine((s) => s.priceMinPkr <= s.priceMaxPkr, { path: ["priceMaxPkr"], message: "The highest amount cannot be below the lowest." })
  .refine((s) => !s.paywall || !s.paymentRequired || s.accountNumber.length > 0 || s.raastId.length > 0, {
    path: ["accountNumber"],
    message: "Add the account number or Raast ID people should pay, before turning the paywall on.",
  });

/** "PKR 250–670", or one amount when both are the same. */
export function priceText(s: Pick<AccessSettings, "priceMinPkr" | "priceMaxPkr">): string {
  const f = (n: number) => n.toLocaleString("en-US");
  return s.priceMinPkr === s.priceMaxPkr ? `PKR ${f(s.priceMinPkr)}` : `PKR ${f(s.priceMinPkr)}–${f(s.priceMaxPkr)}`;
}

/** The request form's fields, checked against the settings. */
export function accessRequestSchema(s: Pick<AccessSettings, "paymentRequired" | "priceMinPkr">) {
  return z.object({
    email: z.string().transform((v) => normalizeEmail(v) ?? "").pipe(z.string().min(3, "Enter a valid email address.")),
    applicantId: z
      .string()
      .trim()
      .max(20)
      .regex(/^\d*$/, "The applicant ID is numbers only.")
      .transform((v) => v || null),
    amountPkr: s.paymentRequired
      ? z.number({ message: "Enter the amount you sent." }).min(s.priceMinPkr, `The lowest amount is PKR ${s.priceMinPkr.toLocaleString("en-US")}.`).max(1_000_000, "That amount is too large.")
      : z.number().min(0).max(1_000_000).nullable(),
    reference: s.paymentRequired
      ? z.string().trim().min(4, "Paste the transaction reference from your banking app.").max(120)
      : z.string().trim().max(120).transform((v) => v || null),
    message: z.string().trim().max(500).transform((v) => v || null),
  });
}

export type AccessDecision = { allowed: true } | { allowed: false; reason: "paywall" };

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
}): AccessDecision {
  if (!input.settings.paywall) return { allowed: true };
  if (input.ownerEmail) return { allowed: true };
  if (input.existingRole && input.existingRole !== "candidate") return { allowed: true };
  if (input.approved) return { allowed: true };
  const since = input.settings.since ? Date.parse(input.settings.since) : NaN;
  if (input.settings.keepExisting && input.existingSince && Number.isFinite(since) && input.existingSince.getTime() < since) return { allowed: true };
  return { allowed: false, reason: "paywall" };
}

export const ACCESS_DENIED = "Sign-in needs approval first. Use Request access on the sign-in page.";
