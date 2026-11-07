import Link from "next/link";
import { cn } from "@/components/ui/cn";

const TABS = [
  { href: "/admin/candidates", label: "Requests to verify" },
  { href: "/admin/candidates/records", label: "Records" },
  { href: "/admin/candidates/duplicates", label: "Possible duplicates" },
] as const;

/** The Candidates section's pages. */
export function CandidateTabs({ current, counts = {} }: { current: (typeof TABS)[number]["href"]; counts?: Partial<Record<(typeof TABS)[number]["href"], number>> }) {
  return (
    <nav aria-label="Candidates" className="flex flex-wrap gap-2">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} aria-current={t.href === current ? "page" : undefined}
          className={cn("rounded-full px-3.5 py-1.5 text-sm ring-1 ring-line-strong", t.href === current ? "bg-ink text-canvas" : "text-muted hover:text-ink")}>
          {t.label}{counts[t.href] ? ` · ${counts[t.href]}` : ""}
        </Link>
      ))}
    </nav>
  );
}
