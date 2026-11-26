// What a musician may do on a date's screen (D17, the monthly cycle), as the
// phone shows it. The database enforces the same rules; these decide which
// buttons appear. No imports, so tests/unit/date-rules.test.ts checks them
// with plain Node.

export type MonthStage = "team_editing" | "team_confirmed" | "sent_to_partner" | "partner_changes" | "final";

export type DateFacts = {
  /** The month's stage at this building, or null when the month wasn't opened through the cycle. */
  stage: MonthStage | null;
  /** A calendar version exists for the month (reviewed or confirmed). */
  reviewed: boolean;
  scheduleState: "draft" | "published" | "canceled" | string;
  /** I lead this date. */
  iLead: boolean;
  /** I'm the program's admin lead this season. */
  adminLead: boolean;
  /** My own assignment on the date, if any. */
  myStatus: "assigned" | "absent" | "substitute" | string | null;
  /** Someone leads the date. */
  hasLeader: boolean;
  /** Musicians playing the date who aren't its leader. */
  nonLeaders: number;
  /** The date has started. */
  past: boolean;
};

export function dateActions(f: DateFacts) {
  const canceled = f.scheduleState === "canceled";
  const draft = f.scheduleState === "draft";
  const teamEditing = f.stage === "team_editing";
  const iPlay = f.myStatus !== null && f.myStatus !== "absent";
  const partnerStage = f.stage === "sent_to_partner" || f.stage === "partner_changes";
  // Same as the website (session-card.tsx): a month not opened through the
  // cycle and not yet reviewed still lets the date's leader set its title.
  const titleWindow = teamEditing || (!f.stage && !f.reviewed);
  return {
    /** The leader adds the title while the team edits; the admin lead changes it for the partner. */
    canEditTitle: !canceled && ((titleWindow && f.iLead && draft) || (f.adminLead && partnerStage)),
    partnerChange: !canceled && f.adminLead && partnerStage,
    /** "I can't play": while the team edits, on drafts, not for substitutes. */
    canMarkOff: !canceled && teamEditing && draft && f.myStatus !== null && f.myStatus !== "substitute",
    /** Propose a leader swap: while the team edits, when there's someone to swap with. */
    canSwap: !canceled && teamEditing && draft && iPlay && f.hasLeader && f.nonLeaders > 0,
    /** After the month is final, changes go to the point person as requests. */
    afterFinal: !canceled && f.stage === "final" && iPlay && !f.past,
  };
}
