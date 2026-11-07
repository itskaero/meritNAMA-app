/** Workspace settings shared by the server and the settings forms. */

export const FEATURES = {
  community: { label: "Community", description: "Discussions, Q&A, polls and hospital reviews.", href: "/portal/community" },
  calculator: { label: "Merit calculator", description: "Work out merit marks under a scoring policy.", href: "/portal/calculator" },
  planner: { label: "Preference planner", description: "Draft preference lists checked against closing merit.", href: "/portal/preferences" },
  simulation: { label: "What-if simulation", description: "Change your own consent and simulate the next list.", href: "/portal/simulation" },
} as const;
export type Feature = keyof typeof FEATURES;
export type FeatureFlags = Record<Feature, boolean>;

/** Days to keep each kind of short-lived data. The audit history is never purged. */
export const RETENTION = {
  signInLinks: { label: "Used or expired sign-in links", min: 1, max: 365, default: 7 },
  sessions: { label: "Expired sessions", min: 1, max: 365, default: 30 },
  devMailbox: { label: "Development mailbox", min: 1, max: 365, default: 7 },
  readNotifications: { label: "Read inbox notifications", min: 7, max: 3650, default: 180 },
  whatIfRuns: { label: "Candidates' what-if simulation runs", min: 7, max: 3650, default: 90 },
  evidence: { label: "Proof documents of decided verification requests", min: 7, max: 3650, default: 180 },
} as const;
export type RetentionKey = keyof typeof RETENTION;
export type Retention = Record<RetentionKey, number>;
