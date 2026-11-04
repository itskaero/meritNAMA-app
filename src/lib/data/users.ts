import "server-only";
import type { Session } from "@/lib/auth/roles";
import { users } from "@/lib/db/schema";
import { defaultDisplayName } from "@/lib/domain/community";
import type { Db } from "./shared";

/** The users row for this session, created on first use with an anonymous display name. */
export async function ensureUser(db: Db, session: Session) {
  const [row] = await db
    .insert(users)
    .values({ email: session.email, role: session.role, displayName: defaultDisplayName(session.email) })
    .onConflictDoUpdate({ target: users.email, set: { email: session.email } })
    .returning({ id: users.id, displayName: users.displayName, role: users.role });
  return row!;
}
