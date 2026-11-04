import { AppShell } from "@/components/app-shell";
import { isStaff } from "@/lib/auth/roles";
import { requireCan } from "@/lib/auth/session";
import { candidateSections } from "@/lib/navigation";

// Server-side guard: unauthenticated users never receive portal markup.
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await requireCan("portal");
  // An admin viewing the portal gets a way back to the workspace.
  const links = isStaff(session)
    ? [{ href: "/admin", label: "Admin workspace", group: "System", icon: "settings" as const }]
    : [];
  return <AppShell area="Candidate portal" sections={candidateSections} links={links} session={session}>{children}</AppShell>;
}
