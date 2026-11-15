// Plain-JS copy of the identity rules in src/lib/domain/identity.ts, for the
// backfill script (which runs without the TypeScript build). tests/identity.test.ts
// checks that both give the same HMACs.
import { createHmac } from "node:crypto";

export const DEV_SECRET = "development-only-candidate-index-secret-0000";

export function normalizeEmail(value) {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= 254 ? v : null;
}

export function normalizePmdc(value) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const v = String(value).toUpperCase().replace(/[^0-9A-Z]/g, "");
  return v.length >= 3 ? v : null;
}

export function normalizeCnic(value) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const v = String(value).replace(/\D/g, "");
  return /^\d{13}$/.test(v) && !/^0+$/.test(v) ? v : null;
}

export const identityHmac = (secret, kind, normalised) => createHmac("sha256", secret).update(`${kind}:${normalised}`).digest("hex");

/**
 * Index rows ({ applicantId, emailHmac, pmdcHmac, cnicHmac, lastInduction }) from a parsed
 * merit-round or gazette file (both are { Table: [cycle], Table5: [rows] }), or null if it is neither.
 */
export function identitiesFromRound(file, secret) {
  const induction = file?.Table?.[0]?.inductionId;
  if (!Number.isInteger(induction) || !Array.isArray(file?.Table5)) return null;
  const out = new Map();
  for (const r of file.Table5) {
    if (r?.applicantId == null) continue;
    const email = normalizeEmail(r.emailId);
    const pmdc = normalizePmdc(r.pmdcNo);
    const cnic = normalizeCnic(r.cnic);
    if (!email && !pmdc && !cnic) continue;
    out.set(String(r.applicantId), {
      applicantId: String(r.applicantId),
      emailHmac: email ? identityHmac(secret, "email", email) : null,
      pmdcHmac: pmdc ? identityHmac(secret, "pmdc", pmdc) : null,
      cnicHmac: cnic ? identityHmac(secret, "cnic", cnic) : null,
      lastInduction: induction,
    });
  }
  return [...out.values()];
}
