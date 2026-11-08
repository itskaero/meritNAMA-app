import Link from "next/link";
import { isStaff } from "@/lib/auth/roles";
import { getSession } from "@/lib/auth/session";
import { featureFlags } from "@/lib/data/settings";
import { checkDatabase, getDb } from "@/lib/db/client";
import { Icon, type IconName } from "./icon";
import { cn } from "./ui/cn";

const TABS: { href: string; label: string; hint: string; icon: IconName; feature?: "calculator" | "planner" }[] = [
  { href: "/portal/finder", label: "Where can I go?", hint: "Your marks against past closing merit", icon: "target" },
  { href: "/portal/calculator", label: "Calculate my marks", hint: "From your degree, house job and more", icon: "calculator", feature: "calculator" },
  { href: "/portal/preferences", label: "My preference list", hint: "Put your choices in order", icon: "list", feature: "planner" },
];

/** The three parts of "My chances", as large tabs (switched-off features are left out for candidates). */
export async function ChancesTabs({ current }: { current: "/portal/finder" | "/portal/calculator" | "/portal/preferences" }) {
  const session = await getSession();
  const flags = session && !isStaff(session) && (await checkDatabase()) === "ok" ? await featureFlags(getDb(), session) : null;
  const tabs = TABS.filter((t) => !t.feature || !flags || flags[t.feature]);
  return (
    <nav aria-label="My chances" className="grid gap-2 sm:grid-cols-3">
      {tabs.map((t) => {
        const on = t.href === current;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={on ? "page" : undefined}
            className={cn("flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors", on ? "border-teal bg-[var(--mn-cyan-soft)]" : "border-line bg-surface hover:bg-hover")}
          >
            <span className={cn("grid h-10 w-10 flex-none place-items-center rounded-lg", on ? "bg-teal text-white" : "bg-tint text-signal")}><Icon name={t.icon} className="h-5 w-5" /></span>
            <span className="min-w-0">
              <span className={cn("block font-semibold", on ? "text-signal-strong" : "text-heading")}>{t.label}</span>
              <span className="block text-xs text-muted">{t.hint}</span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
