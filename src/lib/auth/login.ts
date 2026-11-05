import "server-only";
import { and, count, eq, gt, isNull, lt } from "drizzle-orm";
import type { Database } from "@/lib/db/client";
import { loginTokens, sessions, users } from "@/lib/db/schema";
import { autoLink } from "@/lib/data/candidates";
import { writeAudit } from "@/lib/data/shared";
import { defaultDisplayName } from "@/lib/domain/community";
import {
  LOGIN_LIMITS,
  LOGIN_TOKEN_TTL_MS,
  SESSION_TOUCH_MS,
  SESSION_TTL_MS,
  newSecret,
  normalizeEmail,
  parseEmailList,
  sha256,
} from "@/lib/domain/identity";
import { env } from "@/lib/env";
import { UserFacingError } from "@/lib/errors";
import { sendMail } from "@/lib/mail";
import { normalizeRole, type Session } from "./roles";

/**
 * Email one-time-link sign-in. A link carries a random token; the database keeps
 * only its SHA-256, it works once and for 15 minutes. Signing in creates a session
 * whose random id lives in an HttpOnly cookie (again only the hash is stored).
 */

export const SESSION_COOKIE = "mn_session";

/**
 * Send a sign-in link. The answer never says whether an account exists, and over
 * the rate limits it silently sends nothing (the caller shows the same message).
 */
export async function requestLoginLink(db: Database, input: { email: string; ip?: string | null; now?: Date }) {
  const email = normalizeEmail(input.email);
  if (!email) throw new UserFacingError("Enter a valid email address.");
  const now = input.now ?? new Date();
  const since = new Date(now.getTime() - LOGIN_LIMITS.windowMs);
  const ipHash = input.ip ? sha256(`ip:${input.ip}`) : null;

  const [byEmail] = await db.select({ n: count() }).from(loginTokens).where(and(eq(loginTokens.email, email), gt(loginTokens.createdAt, since)));
  if ((byEmail?.n ?? 0) >= LOGIN_LIMITS.perEmail) return { sent: false as const };
  if (ipHash) {
    const [byIp] = await db.select({ n: count() }).from(loginTokens).where(and(eq(loginTokens.ipHash, ipHash), gt(loginTokens.createdAt, since)));
    if ((byIp?.n ?? 0) >= LOGIN_LIMITS.perIp) return { sent: false as const };
  }

  const token = newSecret();
  await db.insert(loginTokens).values({ tokenHash: sha256(token), email, ipHash, createdAt: now, expiresAt: new Date(now.getTime() + LOGIN_TOKEN_TTL_MS) });
  const link = `${env().APP_URL.replace(/\/$/, "")}/auth/verify?token=${encodeURIComponent(token)}`;
  await sendMail(db, {
    to: email,
    subject: "Your meritNAMA sign-in link",
    text: [
      "Use this link to sign in to meritNAMA. It works once, for 15 minutes:",
      "",
      link,
      "",
      "If you did not ask for it, ignore this email: nobody can sign in without the link.",
    ].join("\n"),
  });
  return { sent: true as const };
}

/**
 * Use a sign-in link: single use, not expired. Creates the account on first sign-in
 * (owner when the email is in OWNER_EMAILS), links it to a candidate record when the
 * email matches one, and opens a session. Returns the session id for the cookie.
 */
export async function consumeLoginLink(db: Database, input: { token: string; userAgent?: string | null; now?: Date }) {
  const now = input.now ?? new Date();
  const token = input.token.trim();
  if (!token || token.length > 200) throw new UserFacingError("This sign-in link is not valid.");
  const [used] = await db
    .update(loginTokens)
    .set({ usedAt: now })
    .where(and(eq(loginTokens.tokenHash, sha256(token)), isNull(loginTokens.usedAt), gt(loginTokens.expiresAt, now)))
    .returning({ email: loginTokens.email });
  if (!used) throw new UserFacingError("This sign-in link has expired or was already used. Ask for a new one.");

  const owner = parseEmailList(env().OWNER_EMAILS).has(used.email);
  const [created] = await db
    .insert(users)
    .values({ email: used.email, role: owner ? "owner" : "candidate", displayName: defaultDisplayName(used.email) })
    .onConflictDoNothing({ target: users.email })
    .returning({ id: users.id });
  const [user] = await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.email, used.email)).limit(1);
  if (!user) throw new Error("user row missing after upsert");
  if (created) await writeAudit(db, user.email, { action: "user.create", entityType: "user", entityId: user.id, after: { role: owner ? "owner" : "candidate" }, reason: "First sign-in" });

  await autoLink(db, user);

  const sessionId = newSecret();
  await db.insert(sessions).values({
    idHash: sha256(sessionId),
    userId: user.id,
    userAgent: input.userAgent?.slice(0, 300) ?? null,
    createdAt: now,
    lastSeenAt: now,
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
  });
  await pruneAuth(db, now);
  return { sessionId, userId: user.id, expiresAt: new Date(now.getTime() + SESSION_TTL_MS) };
}

/** The session behind a cookie value, sliding its expiry at most once a day. */
export async function sessionFromId(db: Database, sessionId: string | undefined, now = new Date()): Promise<Session | null> {
  if (!sessionId || sessionId.length > 200) return null;
  const idHash = sha256(sessionId);
  const [row] = await db
    .select({ userId: users.id, email: users.email, role: users.role, lastSeenAt: sessions.lastSeenAt })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.idHash, idHash), gt(sessions.expiresAt, now)))
    .limit(1);
  if (!row) return null;
  if (now.getTime() - row.lastSeenAt.getTime() > SESSION_TOUCH_MS) {
    await db.update(sessions).set({ lastSeenAt: now, expiresAt: new Date(now.getTime() + SESSION_TTL_MS) }).where(eq(sessions.idHash, idHash));
  }
  return { userId: row.userId, email: row.email, role: normalizeRole(row.role) ?? "candidate", isStub: false };
}

export async function endSession(db: Database, sessionId: string | undefined) {
  if (sessionId) await db.delete(sessions).where(eq(sessions.idHash, sha256(sessionId)));
}

/** Housekeeping: drop expired sessions and old tokens. */
export async function pruneAuth(db: Database, now = new Date()) {
  await db.delete(sessions).where(lt(sessions.expiresAt, now));
  await db.delete(loginTokens).where(lt(loginTokens.createdAt, new Date(now.getTime() - 7 * 24 * 60 * 60_000)));
}
