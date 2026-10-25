import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth/session";
import { adminSections } from "@/lib/navigation";

// Server-side guard. Data functions under src/lib/data re-check the role; this is not the only gate.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole("admin");
  return <AppShell area="Admin workspace" sections={adminSections} session={session}>{children}</AppShell>;
}
