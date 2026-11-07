import { AppShell } from "@/components/app-shell";
import { isStaff } from "@/lib/auth/roles";
import { requireCan } from "@/lib/auth/session";
import { FEATURES, featureFlags } from "@/lib/data/settings";
import { checkDatabase, getDb } from "@/lib/db/client";
import { candidateSections } from "@/lib/navigation";

// Server-side guard: unauthenticated users never receive portal markup.
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await requireCan("portal");
  // An admin viewing the portal gets a way back to the workspace.
  const links = isStaff(session)
    ? [{ href: "/admin", label: "Admin workspace", group: "System", icon: "settings" as const }]
    : [];
  // Switched-off features leave the candidate's menu (staff keep them, to try them out).
  const flags = !isStaff(session) && (await checkDatabase()) === "ok" ? await featureFlags(getDb(), session) : null;
  const hidden = new Set(flags ? Object.entries(FEATURES).filter(([k]) => !flags[k as keyof typeof flags]).map(([, f]) => f.href as string) : []);
  const sections = candidateSections.filter((s) => !hidden.has(s.href));
  return <AppShell area="Candidate portal" sections={sections} links={links} session={session}>{children}</AppShell>;
}
