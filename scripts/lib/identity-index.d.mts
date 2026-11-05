export const DEV_SECRET: string;
export function normalizeEmail(value: unknown): string | null;
export function normalizePmdc(value: unknown): string | null;
export function identityHmac(secret: string, kind: "email" | "pmdc", normalised: string): string;
export function identitiesFromRound(
  file: unknown,
  secret: string,
): { applicantId: string; emailHmac: string | null; pmdcHmac: string | null; lastInduction: number }[] | null;
