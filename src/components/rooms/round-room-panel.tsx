import { can } from "@/lib/auth/roles";
import { getSession } from "@/lib/auth/session";
import { listRoom } from "@/lib/data/rooms";
import { featureFlags } from "@/lib/data/settings";
import { myBand, socialPrefs } from "@/lib/data/social";
import { getDb } from "@/lib/db/client";
import { RoundRoom } from "./round-room";

/** Loads a round's room for the round page. Hidden when the community is switched off for candidates. */
export async function RoundRoomPanel({ induction, roundNo, live }: { induction: number; roundNo: number; live: boolean }) {
  const db = getDb();
  const session = await getSession();
  const flags = await featureFlags(db, session);
  if (!flags.community && !can(session, "staff")) return null;
  const [room, prefs, band] = await Promise.all([listRoom(db, session, { induction, roundNo }), socialPrefs(db, session), myBand(db, session)]);
  if (!room) return null;
  return (
    <RoundRoom
      induction={induction}
      roundNo={roundNo}
      initial={room.messages}
      mayPost={room.mayPost}
      live={live}
      showBand={prefs.showBand}
      myBand={band}
      signedInAs={session ? "member" : null}
    />
  );
}
