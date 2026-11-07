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
};

export const candidateSections: Section[] = [
  {
    href: "/portal",
    group: "Menu",
    icon: "dashboard",
    label: "Dashboard",
    description: "Your programme, induction, merit and plans at a glance.",
  },
  {
    href: "/portal/inbox",
    group: "Menu",
    icon: "inbox",
    label: "Inbox",
    description: "New answers, accepted answers, new questions and new rounds for what you follow.",
  },
  {
    href: "/portal/calculator",
    group: "Menu",
    icon: "sliders",
    label: "Merit calculator",
    description: "Work out your merit marks under the scoring policy from your own details.",
  },
  {
    href: "/portal/finder",
    group: "Menu",
    icon: "target",
    label: "Score finder",
    description: "Enter your marks and see which specialities and hospitals they would have reached in past rounds.",
  },
  {
    href: "/portal/profile",
    group: "Menu",
    icon: "user",
    label: "Merit profile",
    description: "Your verified merit record: every round you appeared in, with closing merit.",
  },
  {
    href: "/portal/preferences",
    group: "Menu",
    icon: "list",
    label: "Preference planner",
    description: "Put your options in order and see where the list is likely to place you.",
  },
  {
    href: "/portal/simulation",
    group: "Menu",
    icon: "target",
    label: "Simulation",
    description: "Seat-allocation simulation using the existing engine.",
  },
  {
    href: "/portal/history",
    group: "Explore",
    icon: "trend",
    label: "Merit lists",
    description: "Every round of every induction: closing merit by programme, quota, speciality and hospital.",
  },
  {
    href: "/portal/explore",
    group: "Explore",
    icon: "building",
    label: "Hospitals & specialties",
    description: "Each speciality and hospital, its seats and its closing merit across inductions.",
  },
  {
    href: "/portal/community",
    group: "Explore",
    icon: "chat",
    label: "Community",
    description: "Ask and answer questions about inductions, rounds, specialities and hospitals.",
  },
  {
    href: "/portal/workspace",
    group: "Personal",
    icon: "folder",
    label: "Workspace",
    description: "Your shortlist of speciality and hospital options, saved on your account.",
  },
];

export const adminSections: Section[] = [
  {
    href: "/admin",
    capability: "staff",
    group: "Menu",
    icon: "dashboard",
    label: "Overview",
    description: "Active induction, datasets, processing and system health.",
  },
  {
    href: "/admin/candidates",
    capability: "candidates.verify",
    group: "Menu",
    icon: "users",
    label: "Candidates",
    description: "Verify account links, look up and correct candidate records, and find duplicates.",
  },
  {
    href: "/admin/inductions",
    capability: "data.edit",
    group: "Menu",
    icon: "calendar",
    label: "Inductions & merit lists",
    description: "Import merit-round files, replace or remove rounds, and map published names to hospitals and specialities.",
  },
  {
    href: "/admin/policies",
    capability: "policy.edit",
    group: "Configuration",
    icon: "sliders",
    label: "Scoring policies",
    description: "Versioned scoring-policy definitions.",
  },
  {
    href: "/admin/rules",
    capability: "policy.edit",
    group: "Configuration",
    icon: "target",
    label: "Allocation rules",
    description: "How each induction's seats are allocated in the simulation: certificate and parent bonuses, tracks, later rounds.",
  },
  {
    href: "/admin/reference-data",
    capability: "data.edit",
    group: "Configuration",
    icon: "database",
    label: "Reference data",
    description: "Seat matrices, lookups, disciplines, specialty groups and CPSP accreditation.",
  },
  {
    href: "/admin/processing",
    capability: "data.edit",
    group: "Operations",
    icon: "cpu",
    label: "Processing & simulation",
    description: "Server-side pipelines and simulation runs.",
  },
  {
    href: "/admin/changes",
    capability: "staff",
    group: "Operations",
    icon: "history",
    label: "Changes to review",
    description: "Risky changes wait here with a before/after preview. Publish, discard, or roll back a published change.",
  },
  {
    href: "/admin/audit",
    capability: "staff",
    group: "Operations",
    icon: "history",
    label: "Audit history",
    description: "Who changed what, when and why.",
  },
  {
    href: "/admin/community",
    capability: "community.moderate",
    group: "Operations",
    icon: "flag",
    label: "Community moderation",
    description: "Reported posts, hidden content and locked discussions.",
  },
  {
    href: "/admin/settings",
    capability: "roles.manage",
    group: "System",
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

/** Admin sections and quick actions this session may use. */
export function sectionsFor(session: Session, sections: Section[]): Section[] {
  return sections.filter((x) => !x.capability || can(session, x.capability));
}
export function commandsFor(session: Session) {
  return adminCommands.filter((c) => can(session, c.capability));
}
