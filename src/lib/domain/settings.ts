/** Workspace settings shared by the server and the settings forms. */

export const FEATURES = {
  community: { label: "Community", description: "Discussions, Q&A, polls and hospital reviews.", href: "/portal/community" },
  calculator: { label: "Merit calculator", description: "Work out merit marks under a scoring policy.", href: "/portal/calculator" },
  planner: { label: "Preference planner", description: "Draft preference lists checked against closing merit.", href: "/portal/preferences" },
  simulation: { label: "What-if simulation", description: "Change your own consent and simulate the next list.", href: "/portal/simulation" },
  // Privacy switches a linked candidate gets on Me. Off: the switch is gone and nothing is hidden
  // (their choice is kept, and applies again when the switch comes back).
  hideName: { label: "Hide my name", description: "Lists show the candidate's applicant ID instead, and nobody finds them by name.", href: "/portal/workspace", group: "privacy" },
  hidePmdc: { label: "Hide my PMDC number", description: "Not shown on lists, and nobody finds them by it.", href: "/portal/workspace", group: "privacy" },
  hideRecord: { label: "Hide my record notes", description: "PHF's verification remarks and any corrections, on their Candidates profile.", href: "/portal/workspace", group: "privacy" },
  // What the owner sees of candidates' use (Admin → Activity). Staff are never recorded.
  replay: { label: "Session replay", description: "Record candidates' tabs (clicks, scrolling, pages; typed text masked) to watch back on Activity. Stored on this server only.", href: "/admin/activity", group: "monitoring" },
  watermark: { label: "Screenshot watermark", description: "A near-invisible code of the account on every portal page, so a leaked screenshot can be traced on Activity.", href: "/admin/activity", group: "monitoring" },
} as const;
export type Feature = keyof typeof FEATURES;
/** The privacy switches, in the order Me shows them. */
export const PRIVACY_SWITCHES = ["hideName", "hidePmdc", "hideRecord"] as const satisfies readonly Feature[];
export type PrivacySwitch = (typeof PRIVACY_SWITCHES)[number];
export const MONITORING_SWITCHES = ["replay", "watermark"] as const satisfies readonly Feature[];
export const isPrivacySwitch = (k: string): k is PrivacySwitch => (PRIVACY_SWITCHES as readonly string[]).includes(k);
export type FeatureFlags = Record<Feature, boolean>;

/** Days to keep each kind of short-lived data. The audit history is never purged. */
export const RETENTION = {
  signInLinks: { label: "Used or expired sign-in links", min: 1, max: 365, default: 7 },
  sessions: { label: "Expired sessions", min: 1, max: 365, default: 30 },
  devMailbox: { label: "Development mailbox", min: 1, max: 365, default: 7 },
  readNotifications: { label: "Read inbox notifications", min: 7, max: 3650, default: 180 },
  whatIfRuns: { label: "Candidates' what-if simulation runs", min: 7, max: 3650, default: 90 },
  evidence: { label: "Proof documents of decided verification requests", min: 7, max: 3650, default: 180 },
  roomMessages: { label: "Members' round-room messages (round-day posts are kept)", min: 30, max: 3650, default: 730 },
  pageVisits: { label: "Page visits on Activity (who opened what, device, network)", min: 7, max: 730, default: 90 },
  replays: { label: "Session replays (recordings of candidates' tabs)", min: 1, max: 90, default: 14 },
} as const;
export type RetentionKey = keyof typeof RETENTION;
export type Retention = Record<RetentionKey, number>;
