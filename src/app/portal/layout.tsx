import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth/session";
import { candidateSections } from "@/lib/navigation";

// Server-side guard: unauthenticated users never receive portal markup.
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole("candidate");
  return <AppShell area="Candidate portal" sections={candidateSections} session={session}>{children}</AppShell>;
}
