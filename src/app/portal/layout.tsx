import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth/session";
import { candidateSections } from "@/lib/navigation";

// Server-side guard: unauthenticated users never receive portal markup.
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole("candidate");
  // An admin viewing the portal gets a way back to the workspace.
  const links = session.role === "admin"
    ? [{ href: "/admin", label: "Admin workspace", group: "System", icon: "settings" as const }]
    : [];
  return <AppShell area="Candidate portal" sections={candidateSections} links={links} session={session}>{children}</AppShell>;
}
