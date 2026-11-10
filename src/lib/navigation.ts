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
 * The candidate menu, in plain words and in the order people need it (Nov 2026, after
 * the old site's "I want to…" guide): six things to do, then their own things.
 */
export const candidateSections: Section[] = [
  { href: "/portal", group: "Start", icon: "dashboard", label: "Home", description: "Your merit, the latest list, and what you can do next." },
  { href: "/portal/history", group: "Start", icon: "trend", label: "Merit lists", description: "Every merit list, official and estimated. Find yourself, or anyone, by applicant ID." },
  {
    href: "/portal/finder", group: "Start", icon: "target", label: "My chances",
    description: "Where your marks can get a seat, based on past closing merit.",
    match: ["/portal/calculator", "/portal/preferences"],
  },
  { href: "/portal/explore", group: "Start", icon: "building", label: "Hospitals", description: "Every hospital and speciality: seats, closing merit, accreditation and reviews." },
  { href: "/portal/simulation", group: "Start", icon: "pulse", label: "What if", description: "What if someone accepts or rejects? Change consent and see the next list." },
  { href: "/portal/community", group: "Start", icon: "chat", label: "Ask & chat", description: "Questions and answers, and a chat room for every round." },
  { href: "/portal/feed", group: "Start", icon: "pulse", label: "Feed", description: "What happened lately: new merit lists, and questions and answers from the community." },
  { href: "/portal/chats", group: "Mine", icon: "chat", label: "Chats", description: "Group chats and one-to-one messages with other candidates.", match: ["/portal/chats/new"] },
  { href: "/portal/profile", group: "Mine", icon: "user", label: "My record", description: "Your merit record: every round you appeared in, with closing merit." },
  { href: "/portal/workspace", group: "Mine", icon: "folder", label: "Me", description: "Your seat, your journey so far, your shortlist, and what you follow." },
  { href: "/portal/inbox", group: "Mine", icon: "inbox", label: "Inbox", description: "New lists, answers and alerts about what you follow." },
  { href: "/portal/guide", group: "Mine", icon: "book", label: "Help", description: "How the merit lists work, in plain words, and what each term means." },
  { href: "/portal/account", group: "Mine", icon: "settings", label: "Your data", description: "Download everything meritNAMA stores about you, or delete your account.", hideInNav: true },
  // Tabs of My chances, not menu items of their own.
  { href: "/portal/calculator", group: "Start", icon: "calculator", label: "Merit calculator", description: "Work out your merit marks from your own details, under the published scoring policy.", hideInNav: true },
  { href: "/portal/preferences", group: "Start", icon: "list", label: "Preference list", description: "Put your options in order and see where the list is likely to place you.", hideInNav: true },
];

export const adminSections: Section[] = [
  {
    href: "/admin",
    capability: "staff",
    group: "Today",
    icon: "dashboard",
    label: "Overview",
    description: "Active induction, datasets, processing and system health.",
  },
  {
    href: "/admin/data",
    capability: "data.edit",
    group: "Data",
    icon: "upload",
    label: "Data",
    description: "Drop JSON files or a data folder, or sync a data repository. New data goes live; replacements show what changes first.",
    match: ["/admin/inductions", "/admin/reference-data"],
  },
  {
    href: "/admin/candidates",
    capability: "candidates.verify",
    group: "People",
    icon: "users",
    label: "Candidates",
    description: "Verify account links, look up and correct candidate records, and find duplicates.",
  },
  {
    href: "/admin/access",
    capability: "candidates.verify",
    group: "People",
    icon: "users",
    label: "Access",
    description: "Sign-in requests while the paywall is on: check payments, approve or reject, and give access to an email.",
  },
  {
    href: "/admin/inductions",
    capability: "data.edit",
    group: "Data",
    proOnly: true,
    icon: "calendar",
    label: "Inductions & merit lists",
    description: "Import merit-round files, replace or remove rounds, and map published names to hospitals and specialities.",
  },
  {
    href: "/admin/community",
    capability: "community.moderate",
    group: "Community",
    icon: "flag",
    label: "Community moderation",
    description: "Reported posts, hidden content and locked discussions.",
  },
  {
    href: "/admin/advanced",
    capability: "staff",
    group: "Advanced",
    simpleOnly: true,
    icon: "sliders",
    label: "Advanced",
    description: "Scoring policies, allocation rules, simulation runs, changes waiting for review and the audit history.",
  },
  {
    href: "/admin/policies",
    capability: "policy.edit",
    group: "Advanced",
    proOnly: true,
    icon: "sliders",
    label: "Scoring policies",
    description: "Versioned scoring-policy definitions.",
  },
  {
    href: "/admin/rules",
    capability: "policy.edit",
    group: "Advanced",
    proOnly: true,
    icon: "target",
    label: "Allocation rules",
    description: "How each induction's seats are allocated in the simulation: certificate and parent bonuses, tracks, later rounds.",
  },
  {
    href: "/admin/reference-data",
    capability: "data.edit",
    group: "Data",
    proOnly: true,
    icon: "database",
    label: "Reference data",
    description: "Seat matrices, lookups, disciplines, specialty groups and CPSP accreditation.",
  },
  {
    href: "/admin/processing",
    capability: "data.edit",
    group: "Advanced",
    proOnly: true,
    icon: "cpu",
    label: "Processing & simulation",
    description: "Server-side pipelines and simulation runs.",
  },
  {
    href: "/admin/changes",
    capability: "staff",
    group: "Advanced",
    proOnly: true,
    icon: "history",
    label: "Changes to review",
    description: "Risky changes wait here with a before/after preview. Publish, discard, or roll back a published change.",
  },
  {
    href: "/admin/audit",
    capability: "staff",
    group: "Advanced",
    proOnly: true,
    icon: "history",
    label: "Audit history",
    description: "Who changed what, when and why.",
  },
  {
    href: "/admin/settings",
    capability: "roles.manage",
    group: "People",
    icon: "settings",
    label: "Team & roles",
    description: "Who is on the team and what each person may do; candidate feature switches, data retention and backups.",
  },
];

/** Admin quick actions for the Ctrl K palette, beyond the sidebar pages. */
export const adminCommands: { label: string; hint: string; href: string; icon: IconName; download?: boolean; keywords?: string; capability: Capability }[] = [
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
