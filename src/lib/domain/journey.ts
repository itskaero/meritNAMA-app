/*
 * The "Me" journey: a person's own rounds, consent replies and notices as one timeline,
 * and the seat-flow of their latest allocation (preference → seat → how close it was).
 * Pure helpers; the page feeds them rows it already reads (myMerit, listInbox).
 */

export type JourneyRound = {
  induction: number;
  roundNo: number;
  program: string;
  quota: string;
  speciality: string;
  hospital: string;
  marks: number;
  preferenceNo: number;
  consent: string;
  closing: number | null;
};

export type JourneyNotice = { id: number; title: string; href: string; at: Date; read: boolean };

export type JourneyEvent =
  | { kind: "round"; key: string; induction: number; roundNo: number; title: string; detail: string; href: string; tone: "success" | "warning" | "neutral" }
  | { kind: "consent"; key: string; induction: number; roundNo: number; title: string; detail: string; href: string; tone: "success" | "warning" | "neutral" }
  | { kind: "notice"; key: string; at: Date; title: string; detail: string; href: string; tone: "neutral"; unread: boolean };

const fmt = (n: number) => n.toFixed(2);

/** How far above (+) or below (−) the round's closing merit this allocation's marks are. */
export function marginOf(marks: number, closing: number | null): number | null {
  return closing == null ? null : Math.round((marks - closing) * 10000) / 10000;
}

export function marginText(margin: number | null): string {
  if (margin == null) return "Closing merit not known for this round";
  if (Math.abs(margin) < 0.005) return "Exactly at the closing merit";
  return margin > 0 ? `${fmt(margin)} marks above the closing merit` : `${fmt(-margin)} marks below the closing merit`;
}

/**
 * Rounds and consent as events, newest round first, with notices (newest first) after
 * them. A round with no recorded consent reply is shown as waiting for one; the
 * official file only says Accepted/Rejected after the round is closed.
 */
export function buildJourney(rounds: JourneyRound[], notices: JourneyNotice[]): { rounds: JourneyEvent[]; notices: JourneyEvent[] } {
  const ordered = [...rounds].sort((a, b) => b.induction - a.induction || b.roundNo - a.roundNo);
  const out: JourneyEvent[] = [];
  for (const r of ordered) {
    const href = `/portal/history/${r.induction}/rounds/${r.roundNo}`;
    const margin = marginOf(r.marks, r.closing);
    out.push({
      kind: "round",
      key: `r-${r.induction}-${r.roundNo}`,
      induction: r.induction,
      roundNo: r.roundNo,
      title: `Induction ${r.induction} · round ${r.roundNo}: ${r.speciality}`,
      detail: `${r.hospital} · ${r.program} ${r.quota} · preference ${r.preferenceNo} · ${marginText(margin)}`,
      href,
      tone: margin == null ? "neutral" : margin >= 0 ? "success" : "warning",
    });
    const c = r.consent.trim();
    const done = c === "Accepted" || c === "Rejected";
    out.push({
      kind: "consent",
      key: `c-${r.induction}-${r.roundNo}`,
      induction: r.induction,
      roundNo: r.roundNo,
      title: done ? `You ${c === "Accepted" ? "accepted" : "rejected"} this seat` : "Consent: no reply recorded yet",
      detail: done ? "From the official consent list." : "Replies appear after the round's consent list is published.",
      href,
      tone: c === "Accepted" ? "success" : c === "Rejected" ? "warning" : "neutral",
    });
  }
  const notes = [...notices]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .map((n): JourneyEvent => ({ kind: "notice", key: `n-${n.id}`, at: n.at, title: n.title, detail: n.at.toISOString().slice(0, 10), href: n.href, tone: "neutral", unread: !n.read }));
  return { rounds: out, notices: notes };
}

export type SeatFlow = {
  preference: { no: number; label: string };
  seat: { speciality: string; hospital: string; track: string; marks: number };
  outcome: { closing: number | null; margin: number | null; text: string; safe: boolean | null };
  consent: string;
  round: { induction: number; roundNo: number };
};

/** The three nodes of the latest allocation: the preference it came from, the seat, and how close it was. */
export function seatFlow(rounds: JourneyRound[]): SeatFlow | null {
  const latest = [...rounds].sort((a, b) => b.induction - a.induction || b.roundNo - a.roundNo)[0];
  if (!latest) return null;
  const margin = marginOf(latest.marks, latest.closing);
  return {
    preference: { no: latest.preferenceNo, label: latest.preferenceNo === 1 ? "Your first choice" : `Your choice number ${latest.preferenceNo}` },
    seat: { speciality: latest.speciality, hospital: latest.hospital, track: `${latest.program} · ${latest.quota}`, marks: latest.marks },
    outcome: { closing: latest.closing, margin, text: marginText(margin), safe: margin == null ? null : margin >= 0 },
    consent: latest.consent.trim() || "Not recorded",
    round: { induction: latest.induction, roundNo: latest.roundNo },
  };
}
