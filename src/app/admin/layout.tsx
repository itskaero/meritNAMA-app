import { cookies } from "next/headers";
import { after } from "next/server";
import { AppShell } from "@/components/app-shell";
import { retentionIfDue } from "@/lib/data/settings";
import { checkDatabase, getDb } from "@/lib/db/client";
import { requireCan } from "@/lib/auth/session";
import { adminSections, commandsFor, forMode, sectionsFor } from "@/lib/navigation";
import { parseUiMode, UI_MODE_COOKIE } from "@/lib/ui-mode";

// Server-side guard. Data functions under src/lib/data re-check the role; this is not the only gate.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireCan("staff");
  // Staff may also use the candidate portal, so link to it.
  const links = [{ href: "/portal", label: "Candidate portal", group: "System", icon: "user" as const }];
  // Data retention runs once a day, after a staff page has been sent; no scheduler needed.
  after(async () => {
    if ((await checkDatabase()) !== "ok") return;
    await retentionIfDue(getDb()).catch((err) => console.error("retention run failed", err));
  });
  const mode = parseUiMode((await cookies()).get(UI_MODE_COOKIE)?.value);
  return (
    <AppShell area="Admin workspace" sections={forMode(sectionsFor(session, adminSections), mode)} links={links} commands={commandsFor(session)} session={session}>
      {children}
    </AppShell>
  );
}
