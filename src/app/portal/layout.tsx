import { AppShell } from "@/components/app-shell";
import { isStaff } from "@/lib/auth/roles";
import { requireCan } from "@/lib/auth/session";
import { unreadChats } from "@/lib/data/chats";
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
  // Chats and the feed belong to the community switch.
  if (hidden.has("/portal/community")) { hidden.add("/portal/chats"); hidden.add("/portal/feed"); }
  const sections = candidateSections.filter((s) => !hidden.has(s.href));
  // Phones: five tabs, with short names. Me is the person's own record.
  const short: Record<string, string> = { "/portal": "Home", "/portal/history": "Lists", "/portal/finder": "Chances", "/portal/chats": "Chats", "/portal/profile": "Me" };
  const dbUp = (await checkDatabase()) === "ok";
  const unread = dbUp && sections.some((s) => s.href === "/portal/chats") ? await unreadChats(getDb(), session).catch(() => 0) : 0;
  const bottomTabs = sections.filter((s) => s.href in short).map((s) => ({ href: s.href, label: short[s.href]!, icon: s.icon, match: s.match, badge: s.href === "/portal/chats" ? unread : undefined }));
  return <AppShell area="Candidate portal" sections={sections} links={links} session={session} bottomTabs={bottomTabs}>{children}</AppShell>;
}
