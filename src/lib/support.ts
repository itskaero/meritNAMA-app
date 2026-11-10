import "server-only";
import { env } from "@/lib/env";

/** The public contact address: SUPPORT_EMAIL, else the address inside MAIL_FROM, else none. */
export function supportEmail(): string | null {
  const e = env();
  if (e.SUPPORT_EMAIL) return e.SUPPORT_EMAIL;
  const m = /<([^>]+)>/.exec(e.MAIL_FROM) ?? /^([^\s<>]+@[^\s<>]+)$/.exec(e.MAIL_FROM);
  const addr = m?.[1]?.trim() ?? null;
  return addr && !/@localhost$/i.test(addr) && !/^no-?reply@/i.test(addr) ? addr : null;
}
