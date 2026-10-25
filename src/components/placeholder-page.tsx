import { findSection } from "@/lib/navigation";
import { Badge } from "./ui/badge";
import { Card } from "./ui/card";
import { Notice } from "./ui/notice";
import { PageHeader } from "./ui/page-header";

/** Honest placeholder: states what is planned and that nothing here is live yet. */
export function PlaceholderPage({ href, children }: { href: string; children?: React.ReactNode }) {
  const s = findSection(href);
  return (
    <>
      <PageHeader title={s.label} description={s.description} actions={<Badge tone="warning">Not yet integrated</Badge>} />
      <div className="grid gap-6">
        <Notice tone="warning" title="Placeholder — no live data">
          This screen is part of the scaffold. It shows no candidate or induction data until {s.milestone} connects it to
          the validated data layer.
        </Notice>
        {children}
        <Card>
          <h2 className="font-semibold">Planned scope</h2>
          <p className="mt-1 text-sm text-muted">{s.milestone}</p>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {s.planned.map((item) => (
              <li key={item} className="flex gap-2 text-sm text-muted">
                <span aria-hidden className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-signal" />
                {item}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
