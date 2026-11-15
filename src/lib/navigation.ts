import type { IconName } from "@/components/icon";
import { can, type Capability, type Session } from "@/lib/auth/roles";

/**
 * Single source for app sections: drives the sidebars, page titles and the admin
 * section guards (requireSection). What is still to build is listed in the README.
 */
export type Section = {
  href: string;
  /** Sidebar group heading. */
  group: string;
  /** Icon name from src/components/icon.tsx. */
  icon: IconName;
  label: string;
  description: string;
  /** Admin sections: what a staff member needs to see and open it. */
  capability?: Capability;
  /** Not a menu item of its own (reached through another section's tabs). */
  hideInNav?: boolean;
  /** Other paths that light this menu item up (e.g. My chances owns the calculator). */
  match?: string[];
  /** Admin: left out of the menu in Simple mode (the page still works, and the Advanced hub links to it). */
  proOnly?: boolean;
  /** Admin: shown in Simple mode only, in place of the Pro-only pages it leads to. */
  simpleOnly?: boolean;
};

/*
 * The candidate menu (v4, meritnamav4.md §4): the main list in the order people need it
 * through a cycle, then their own things under "Mine". Feed is folded into Community,
 * My record into Me, and the What-if simulator sits behind Estimates.
 */
export const candidateSections: Section[] = [
  { href: "/portal", group: "Main", icon: "dashboard", label: "Overview", description: "Your merit, where the induction stands, and what to do next." },
  { href: "/portal/history", group: "Main", icon: "trend", label: "Merit lists", description: "Every merit list, official and estimated. Find anyone by name, PMDC number or applicant ID." },
  { href: "/portal/candidates", group: "Main", icon: "id", label: "Candidates", description: "The gazette for the running induction: verification, corrections, and each candidate's preferences." },
  { href: "/portal/estimates", group: "Main", icon: "spark", label: "Estimates", description: "Estimated next lists from consent replies so far. Never official.", match: ["/portal/simulation"] },
  {
    href: "/portal/finder", group: "Main", icon: "target", label: "My chances",
    description: "Where your marks can get a seat, based on past closing merit.",
    match: ["/portal/calculator", "/portal/preferences"],
  },
  { href: "/portal/explore", group: "Main", icon: "building", label: "Hospitals", description: "Every hospital and speciality: seats, closing merit, accreditation and reviews." },
  { href: "/portal/calendar", group: "Main", icon: "calendar", label: "Calendar", description: "Dates for the running induction: rounds, consent windows and deadlines." },
  { href: "/portal/jobs", group: "Main", icon: "briefcase", label: "Jobs", description: "Jobs for doctors from official department pages and jobz.pk, in one place." },
  { href: "/portal/community", group: "Main", icon: "users", label: "Community", description: "Questions and answers, what happened lately, and a room for every round.", match: ["/portal/feed", "/portal/rooms"] },
  { href: "/portal/chats", group: "Main", icon: "chat", label: "Chats", description: "Group chats and one-to-one messages with other candidates.", match: ["/portal/chats/new"] },
  { href: "/portal/workspace", group: "Mine", icon: "user", label: "Me", description: "Your seat, your journey so far, your shortlist, and what you follow.", match: ["/portal/profile"] },
  { href: "/portal/inbox", group: "Mine", icon: "inbox", label: "Inbox", description: "New lists, answers and alerts about what you follow." },
  { href: "/portal/guide", group: "Mine", icon: "book", label: "Help", description: "How the merit lists work, in plain words, and what each term means." },
  // Reached from other pages, not menu items of their own.
  { href: "/portal/simulation", group: "Main", icon: "pulse", label: "What if", description: "What if someone accepts or rejects? Change consent and see the next list.", hideInNav: true },
  { href: "/portal/feed", group: "Main", icon: "pulse", label: "Feed", description: "What happened lately: new merit lists, and questions and answers from the community.", hideInNav: true },
  { href: "/portal/profile", group: "Mine", icon: "user", label: "My record", description: "Your merit record: every round you appeared in, with closing merit.", hideInNav: true },
  { href: "/portal/account", group: "Mine", icon: "settings", label: "Your data", description: "Download everything meritNAMA stores about you, or delete your account.", hideInNav: true },
  { href: "/portal/calculator", group: "Main", icon: "calculator", label: "Merit calculator", description: "Work out your merit marks from your own details, under the published scoring policy.", hideInNav: true },
  { href: "/portal/preferences", group: "Main", icon: "list", label: "Preference list", description: "Put your options in order and see where the list is likely to place you.", hideInNav: true },
];

/*
 * The admin menu (v4, meritnamav4.md A6): eight items. Pages that used to be menu items of
 * their own are reached through the tabs and links of the item that owns them (`match`).
 */
export const adminSections: Section[] = [
  { href: "/admin", capability: "staff", group: "Team", icon: "dashboard", label: "Today", description: "Where the cycle is, what needs you, the notification bar and system health." },
  {
    href: "/admin/data", capability: "data.edit", group: "Team", icon: "upload", label: "Data",
    description: "Every induction's workflow, and the data folder: drop JSON files or sync a repository. New data goes live; replacements wait for a click.",
    match: ["/admin/inductions", "/admin/reference-data", "/admin/processing"],
  },
  { href: "/admin/jobs", capability: "data.edit", group: "Team", icon: "briefcase", label: "Jobs", description: "Doctor job adverts: how each source did on its last check, Sync now, hide or pin an advert, add one by hand." },
  {
    href: "/admin/candidates", capability: "candidates.verify", group: "People", icon: "users", label: "Candidates & access",
    description: "Sign-in requests, account links to merit records, candidate records and duplicates.",
    match: ["/admin/access"],
  },
  { href: "/admin/community", capability: "community.moderate", group: "People", icon: "flag", label: "Community", description: "Reported posts, hidden content and locked discussions." },
  { href: "/admin/activity", capability: "roles.manage", group: "People", icon: "monitor", label: "Activity", description: "Who is online and what they open, devices and networks, accounts that look shared, session replays and screenshot tracing." },
  { href: "/admin/settings", capability: "roles.manage", group: "People", icon: "settings", label: "Team & settings", description: "Who is on the team and what each person may do; candidate feature switches, data retention and backups." },
  {
    href: "/admin/policies", capability: "policy.edit", group: "Advanced", icon: "sliders", label: "Policies & rules",
    description: "Versioned scoring policies, and how each induction's seats are allocated in estimates.",
    match: ["/admin/rules"],
  },
  {
    href: "/admin/changes", capability: "staff", group: "Advanced", icon: "history", label: "Changes & audit",
    description: "Risky changes wait here with a before/after preview; publish, discard or roll back. Who changed what, when and why.",
    match: ["/admin/audit"],
  },
  // Reached through the items above.
  { href: "/admin/access", capability: "candidates.verify", group: "People", icon: "users", label: "Access", description: "Sign-in requests while the paywall is on: check payments, approve or reject, and give access to an email.", hideInNav: true },
  { href: "/admin/inductions", capability: "data.edit", group: "Team", icon: "calendar", label: "Inductions & merit lists", description: "Import merit-round files, replace or remove rounds, and map published names to hospitals and specialities.", hideInNav: true },
  { href: "/admin/reference-data", capability: "data.edit", group: "Team", icon: "database", label: "Reference data", description: "Seat matrices, lookups, disciplines, specialty groups and CPSP accreditation.", hideInNav: true },
  { href: "/admin/processing", capability: "data.edit", group: "Team", icon: "cpu", label: "Processing & simulation", description: "Estimate runs: build, compare with the official list, publish.", hideInNav: true },
  { href: "/admin/rules", capability: "policy.edit", group: "Advanced", icon: "target", label: "Allocation rules", description: "How each induction's seats are allocated in the simulation: certificate and parent bonuses, tracks, later rounds.", hideInNav: true },
  { href: "/admin/audit", capability: "staff", group: "Advanced", icon: "history", label: "Audit history", description: "Who changed what, when and why.", hideInNav: true },
  { href: "/admin/advanced", capability: "staff", group: "Advanced", icon: "sliders", label: "Advanced", description: "Scoring policies, allocation rules, simulation runs, changes waiting for review and the audit history.", hideInNav: true },
];

/** Admin quick actions for the Ctrl K palette, beyond the sidebar pages. */
export const adminCommands: { label: string; hint: string; href: string; icon: IconName; download?: boolean; keywords?: string; capability: Capability }[] = [
  { label: "Activity", hint: "Who is online, replays", href: "/admin/activity", icon: "monitor", keywords: "online users dashboard replay watermark shared account surveillance", capability: "roles.manage" },
  { label: "Import merit rounds", hint: "Inductions", href: "/admin/inductions", icon: "upload", keywords: "merit list round_ file", capability: "data.edit" },
  { label: "Import a seat file", hint: "Reference data", href: "/admin/reference-data", icon: "upload", keywords: "seats matrix induction upload", capability: "data.edit" },
  { label: "Hospitals", hint: "Reference data · lookups", href: "/admin/reference-data/lookups?kind=hospitals", icon: "building", keywords: "rename add hospital", capability: "data.edit" },
  { label: "Specialities", hint: "Reference data · lookups", href: "/admin/reference-data/lookups?kind=specialities", icon: "target", keywords: "speciality specialty rename", capability: "data.edit" },
  { label: "Quotas", hint: "Reference data · lookups", href: "/admin/reference-data/lookups?kind=quotas", icon: "list", capability: "data.edit" },
  { label: "CPSP accreditation", hint: "Reference data · document", href: "/admin/reference-data/documents/cpsp_accreditation", icon: "folder", capability: "data.edit" },
  { label: "Specialty groups", hint: "Reference data · document", href: "/admin/reference-data/documents/specialty_groups", icon: "folder", capability: "data.edit" },
  { label: "Disciplines", hint: "Reference data · document", href: "/admin/reference-data/documents/disciplines", icon: "folder", capability: "data.edit" },
  { label: "Export scoring_policy.json", hint: "Download", href: "/admin/policies/export", icon: "download", download: true, keywords: "policy json calculator", capability: "policy.edit" },
];

export function findSection(href: string): Section {
  const s = [...candidateSections, ...adminSections].find((x) => x.href === href);
  if (!s) throw new Error(`Unknown section ${href}`);
  return s;
}

/** Simple mode hides the Pro-only pages behind the Advanced hub; Pro mode shows them all and hides the hub. */
export function forMode(sections: Section[], mode: "simple" | "pro"): Section[] {
  return sections.filter((x) => (mode === "pro" ? !x.simpleOnly : !x.proOnly));
}

/** Admin sections and quick actions this session may use. */
export function sectionsFor(session: Session, sections: Section[]): Section[] {
  return sections.filter((x) => !x.capability || can(session, x.capability));
}
export function commandsFor(session: Session) {
  return adminCommands.filter((c) => can(session, c.capability));
}
