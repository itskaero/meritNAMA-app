import type { IconName } from "@/components/icon";
import { can, type Capability, type Session } from "@/lib/auth/roles";

/**
 * Single source for app sections: drives the sidebar and the placeholder pages,
 * so a route's planned scope is documented in exactly one place.
 */
export type Milestone = "Delivery 2 · Data foundations" | "Delivery 3 · Admin MVP" | "Delivery 4 · Candidate MVP";

export type Section = {
  href: string;
  /** Sidebar group heading. */
  group: string;
  /** Icon name from src/components/icon.tsx. */
  icon: IconName;
  label: string;
  description: string;
  milestone: Milestone;
  planned: string[];
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
    milestone: "Delivery 4 · Candidate MVP",
    planned: ["Programme and induction", "Merit score and breakdown", "Record-verification state", "Preference-plan summary", "Data-source and update timestamps"],
  },
  {
    href: "/portal/inbox",
    group: "Menu",
    icon: "inbox",
    label: "Inbox",
    description: "New answers, accepted answers, new questions and new rounds for what you follow.",
    milestone: "Delivery 4 · Candidate MVP",
    planned: [],
  },
  {
    href: "/portal/calculator",
    group: "Menu",
    icon: "sliders",
    label: "Merit calculator",
    description: "Work out your merit marks under the scoring policy from your own details.",
    milestone: "Delivery 4 · Candidate MVP",
    planned: [],
  },
  {
    href: "/portal/finder",
    group: "Menu",
    icon: "target",
    label: "Score finder",
    description: "Enter your marks and see which specialities and hospitals they would have reached in past rounds.",
    milestone: "Delivery 4 · Candidate MVP",
    planned: [],
  },
  {
    href: "/portal/profile",
    group: "Menu",
    icon: "user",
    label: "Merit profile",
    description: "Your verified merit record: every round you appeared in, with closing merit.",
    milestone: "Delivery 4 · Candidate MVP",
    planned: ["Component-level breakdown", "Missing-data indicators"],
  },
  {
    href: "/portal/preferences",
    group: "Menu",
    icon: "list",
    label: "Preference planner",
    description: "Put your options in order and see where the list is likely to place you.",
    milestone: "Delivery 4 · Candidate MVP",
    planned: [],
  },
  {
    href: "/portal/simulation",
    group: "Menu",
    icon: "target",
    label: "Simulation",
    description: "Seat-allocation simulation using the existing engine.",
    milestone: "Delivery 4 · Candidate MVP",
    planned: ["Dataset and assumptions shown", "Predicted placement or unplaced outcome", "Which preference produced the result", "Saved, comparable runs"],
  },
  {
    href: "/portal/history",
    group: "Explore",
    icon: "trend",
    label: "Merit lists",
    description: "Every round of every induction: closing merit by programme, quota, speciality and hospital.",
    milestone: "Delivery 4 · Candidate MVP",
    planned: ["Programme- and quota-aware comparisons", "Seat-count trends", "Round-by-round movement", "Your score vs. historical cutoff"],
  },
  {
    href: "/portal/explore",
    group: "Explore",
    icon: "building",
    label: "Hospitals & specialties",
    description: "Each speciality and hospital, its seats and its closing merit across inductions.",
    milestone: "Delivery 4 · Candidate MVP",
    planned: ["Canonical hospital and specialty directory", "Programme availability", "Accreditation metadata where available"],
  },
  {
    href: "/portal/community",
    group: "Explore",
    icon: "chat",
    label: "Community",
    description: "Ask and answer questions about inductions, rounds, specialities and hospitals.",
    milestone: "Delivery 4 · Candidate MVP",
    planned: [],
  },
  {
    href: "/portal/workspace",
    group: "Personal",
    icon: "folder",
    label: "Workspace",
    description: "Your shortlist of speciality and hospital options, saved on your account.",
    milestone: "Delivery 4 · Candidate MVP",
    planned: ["Server-side storage scoped to your account", "Favourite institutions", "Saved comparisons"],
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
    milestone: "Delivery 3 · Admin MVP",
    planned: ["Active induction", "Dataset versions", "Candidate counts", "Validation issues", "Scoring-policy version", "Recent changes"],
  },
  {
    href: "/admin/candidates",
    capability: "candidates.verify",
    group: "Menu",
    icon: "users",
    label: "Candidates",
    description: "Verify account links, look up and correct candidate records, and find duplicates.",
    milestone: "Delivery 3 · Admin MVP",
    planned: ["Search and filter", "Programme-specific marks", "Preference history", "Controlled correction with reason", "Duplicate detection", "Import/export"],
  },
  {
    href: "/admin/inductions",
    capability: "data.edit",
    group: "Menu",
    icon: "calendar",
    label: "Inductions & merit lists",
    description: "Import merit-round files, replace or remove rounds, and map published names to hospitals and specialities.",
    milestone: "Delivery 3 · Admin MVP",
    planned: ["Induction configuration", "Historical merit lists", "Gazette seat data", "Source-data versions", "Before/after comparisons"],
  },
  {
    href: "/admin/policies",
    capability: "policy.edit",
    group: "Configuration",
    icon: "sliders",
    label: "Scoring policies",
    description: "Versioned scoring-policy definitions.",
    milestone: "Delivery 3 · Admin MVP",
    planned: ["Schema-validated editor", "Totals check", "Impact preview via the calculation engine", "Explicit activation and rollback"],
  },
  {
    href: "/admin/rules",
    capability: "policy.edit",
    group: "Configuration",
    icon: "target",
    label: "Allocation rules",
    description: "How each induction's seats are allocated in the simulation: certificate and parent bonuses, tracks, later rounds.",
    milestone: "Delivery 3 · Admin MVP",
    planned: ["Per-induction rules with drafts", "Bonuses follow the scoring policy", "Preview, publish and rollback", "Impact preview through the simulation"],
  },
  {
    href: "/admin/reference-data",
    capability: "data.edit",
    group: "Configuration",
    icon: "database",
    label: "Reference data",
    description: "Seat matrices, lookups, disciplines, specialty groups and CPSP accreditation.",
    milestone: "Delivery 2 · Data foundations",
    planned: ["Canonical identifiers", "Display names and aliases", "Specialty groups", "Quota categories and seat counts", "Missing-reference checks"],
  },
  {
    href: "/admin/processing",
    capability: "data.edit",
    group: "Operations",
    icon: "cpu",
    label: "Processing & simulation",
    description: "Server-side pipelines and simulation runs.",
    milestone: "Delivery 3 · Admin MVP",
    planned: ["Input selection and preflight validation", "Dataset reconciliation", "Processing logs", "Comparison against reference results", "Versioned, downloadable outputs"],
  },
  {
    href: "/admin/changes",
    capability: "staff",
    group: "Operations",
    icon: "history",
    label: "Changes to review",
    description: "Risky changes wait here with a before/after preview. Publish, discard, or roll back a published change.",
    milestone: "Delivery 3 · Admin MVP",
    planned: [],
  },
  {
    href: "/admin/audit",
    capability: "staff",
    group: "Operations",
    icon: "history",
    label: "Audit history",
    description: "Who changed what, when and why.",
    milestone: "Delivery 3 · Admin MVP",
    planned: [],
  },
  {
    href: "/admin/community",
    capability: "community.moderate",
    group: "Operations",
    icon: "flag",
    label: "Community moderation",
    description: "Reported posts, hidden content and locked discussions.",
    milestone: "Delivery 3 · Admin MVP",
    planned: [],
  },
  {
    href: "/admin/settings",
    capability: "roles.manage",
    group: "System",
    icon: "settings",
    label: "Team & roles",
    description: "Who is on the team and what each person may do; candidate feature switches, data retention and backups.",
    milestone: "Delivery 3 · Admin MVP",
    planned: ["Feature toggles", "Data retention", "Backup status"],
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
