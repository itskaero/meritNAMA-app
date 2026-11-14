import { AppShell } from "@/components/app-shell";
import { isStaff } from "@/lib/auth/roles";
import { requireCan } from "@/lib/auth/session";
import { mayEnter } from "@/lib/data/access";
import { unreadChats } from "@/lib/data/chats";
import Link from "next/link";
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
  // Phones: five tabs, with short names (v4 PhoneHome). Me is the person's own record.
  const short: Record<string, string> = { "/portal": "Home", "/portal/history": "Lists", "/portal/finder": "Chances", "/portal/chats": "Chats", "/portal/workspace": "Me" };
  const dbUp = (await checkDatabase()) === "ok";
  const unread = dbUp && sections.some((s) => s.href === "/portal/chats") ? await unreadChats(getDb(), session).catch(() => 0) : 0;
  const bottomTabs = sections.filter((s) => s.href in short).map((s) => ({ href: s.href, label: short[s.href]!, icon: s.icon, match: s.match, badge: s.href === "/portal/chats" ? unread : undefined }));
  // Paid access lasts one induction: a candidate whose access ended keeps the account but sees the renewal page.
  const ended = dbUp && session.role === "candidate" && !(await mayEnter(getDb(), session.email).catch(() => true));
  return (
    <AppShell area="Candidate portal" sections={sections} links={links} session={session} bottomTabs={bottomTabs}>
      {ended ? (
        <div className="grid place-items-center px-4 py-16">
          <div className="grid max-w-md gap-3 rounded-2xl border border-amber/40 bg-card p-6 text-center">
            <h1 className="text-xl font-semibold text-heading">Your access ended with the last induction</h1>
            <p className="text-sm text-muted">Renew for this induction with the same email. Your account, shortlist and follows are kept.</p>
            <Link href="/access?renew=1" className="mn-btn mx-auto inline-flex h-10 items-center rounded-lg px-4 text-sm font-semibold">Renew access</Link>
          </div>
        </div>
      ) : children}
    </AppShell>
  );
}
