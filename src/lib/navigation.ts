import type { IconName } from "@/components/icon";

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
    href: "/portal/profile",
    group: "Menu",
    icon: "user",
    label: "Merit profile",
    description: "Imported marks under the applicable scoring policy.",
    milestone: "Delivery 4 · Candidate MVP",
    planned: ["Verified candidate-record linking", "Component-level breakdown", "Official vs. user-entered data clearly separated", "Missing-data indicators"],
  },
  {
    href: "/portal/preferences",
    group: "Menu",
    icon: "list",
    label: "Preference planner",
    description: "Draft and compare preference lists.",
    milestone: "Delivery 4 · Candidate MVP",
    planned: ["Search specialties and hospitals", "Programme and quota filters", "Duplicate and eligibility warnings", "Save, duplicate, rename and compare drafts"],
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
    label: "Historical cutoffs",
    description: "Closing merit across inductions and rounds.",
    milestone: "Delivery 4 · Candidate MVP",
    planned: ["Programme- and quota-aware comparisons", "Seat-count trends", "Round-by-round movement", "Your score vs. historical cutoff"],
  },
  {
    href: "/portal/explore",
    group: "Explore",
    icon: "building",
    label: "Hospitals & specialties",
    description: "Discover training opportunities.",
    milestone: "Delivery 4 · Candidate MVP",
    planned: ["Canonical hospital and specialty directory", "Programme availability", "Accreditation metadata where available"],
  },
  {
    href: "/portal/workspace",
    group: "Personal",
    icon: "folder",
    label: "Workspace",
    description: "Saved drafts, scenarios and favourites.",
    milestone: "Delivery 4 · Candidate MVP",
    planned: ["Server-side storage scoped to your account", "Favourite institutions", "Saved comparisons"],
  },
];

export const adminSections: Section[] = [
  {
    href: "/admin",
    group: "Menu",
    icon: "dashboard",
    label: "Overview",
    description: "Active induction, datasets, processing and system health.",
    milestone: "Delivery 3 · Admin MVP",
    planned: ["Active induction", "Dataset versions", "Candidate counts", "Validation issues", "Scoring-policy version", "Recent changes"],
  },
  {
    href: "/admin/candidates",
    group: "Menu",
    icon: "users",
    label: "Candidates",
    description: "Search, inspect and correct candidate records.",
    milestone: "Delivery 3 · Admin MVP",
    planned: ["Search and filter", "Programme-specific marks", "Preference history", "Controlled correction with reason", "Duplicate detection", "Import/export"],
  },
  {
    href: "/admin/inductions",
    group: "Menu",
    icon: "calendar",
    label: "Inductions",
    description: "Induction configuration, merit lists and gazettes.",
    milestone: "Delivery 3 · Admin MVP",
    planned: ["Induction configuration", "Historical merit lists", "Gazette seat data", "Source-data versions", "Before/after comparisons"],
  },
  {
    href: "/admin/policies",
    group: "Configuration",
    icon: "sliders",
    label: "Scoring policies",
    description: "Versioned scoring-policy definitions.",
    milestone: "Delivery 3 · Admin MVP",
    planned: ["Schema-validated editor", "Totals check", "Impact preview via the calculation engine", "Explicit activation and rollback"],
  },
  {
    href: "/admin/reference-data",
    group: "Configuration",
    icon: "database",
    label: "Reference data",
    description: "Seat matrices, lookups, disciplines, specialty groups and CPSP accreditation.",
    milestone: "Delivery 2 · Data foundations",
    planned: ["Canonical identifiers", "Display names and aliases", "Specialty groups", "Quota categories and seat counts", "Missing-reference checks"],
  },
  {
    href: "/admin/processing",
    group: "Operations",
    icon: "cpu",
    label: "Processing & simulation",
    description: "Server-side pipelines and simulation runs.",
    milestone: "Delivery 3 · Admin MVP",
    planned: ["Input selection and preflight validation", "Dataset reconciliation", "Processing logs", "Comparison against reference results", "Versioned, downloadable outputs"],
  },
  {
    href: "/admin/audit",
    group: "Operations",
    icon: "history",
    label: "Audit history",
    description: "Who changed what, when and why.",
    milestone: "Delivery 3 · Admin MVP",
    planned: ["Actor and timestamp", "Previous and new values", "Reason and result", "Reversal where feasible"],
  },
  {
    href: "/admin/settings",
    group: "System",
    icon: "settings",
    label: "Settings",
    description: "Application settings and health.",
    milestone: "Delivery 3 · Admin MVP",
    planned: ["Feature toggles", "Data retention", "Backup status"],
  },
];

/** Admin quick actions for the Ctrl K palette, beyond the sidebar pages. */
export const adminCommands: { label: string; hint: string; href: string; icon: IconName; download?: boolean; keywords?: string }[] = [
  { label: "Import a seat file", hint: "Reference data", href: "/admin/reference-data", icon: "upload", keywords: "seats matrix induction upload" },
  { label: "Hospitals", hint: "Reference data · lookups", href: "/admin/reference-data/lookups?kind=hospitals", icon: "building", keywords: "rename add hospital" },
  { label: "Specialities", hint: "Reference data · lookups", href: "/admin/reference-data/lookups?kind=specialities", icon: "target", keywords: "speciality specialty rename" },
  { label: "Quotas", hint: "Reference data · lookups", href: "/admin/reference-data/lookups?kind=quotas", icon: "list" },
  { label: "CPSP accreditation", hint: "Reference data · document", href: "/admin/reference-data/documents/cpsp_accreditation", icon: "folder" },
  { label: "Specialty groups", hint: "Reference data · document", href: "/admin/reference-data/documents/specialty_groups", icon: "folder" },
  { label: "Disciplines", hint: "Reference data · document", href: "/admin/reference-data/documents/disciplines", icon: "folder" },
  { label: "Export scoring_policy.json", hint: "Download", href: "/admin/policies/export", icon: "download", download: true, keywords: "policy json calculator" },
];

export function findSection(href: string): Section {
  const s = [...candidateSections, ...adminSections].find((x) => x.href === href);
  if (!s) throw new Error(`Unknown section ${href}`);
  return s;
}
