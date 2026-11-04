import { AppShell } from "@/components/app-shell";
import { requireCan } from "@/lib/auth/session";
import { adminSections, commandsFor, sectionsFor } from "@/lib/navigation";

// Server-side guard. Data functions under src/lib/data re-check the role; this is not the only gate.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireCan("staff");
  // Staff may also use the candidate portal, so link to it.
  const links = [{ href: "/portal", label: "Candidate portal", group: "System", icon: "user" as const }];
  return (
    <AppShell area="Admin workspace" sections={sectionsFor(session, adminSections)} links={links} commands={commandsFor(session)} session={session}>
      {children}
    </AppShell>
  );
}
