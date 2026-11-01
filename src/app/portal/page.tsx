import Link from "next/link";
import { ChanceRing } from "@/components/dashboard/chance-ring";
import { JourneyBanner } from "@/components/dashboard/journey-banner";
import { Icon, type IconName } from "@/components/icon";
import { PlaceholderPage } from "@/components/placeholder-page";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Metric } from "@/components/ui/metric";

export const metadata = { title: "Dashboard" };

const quickActions: { href: string; label: string; icon: IconName }[] = [
  { href: "/portal/simulation", label: "Merit simulator", icon: "play" },
  { href: "/portal/preferences", label: "Preference planner", icon: "sliders" },
  { href: "/portal/history", label: "Closing merits", icon: "bars" },
  { href: "/portal/explore", label: "Speciality explorer", icon: "layers" },
];

export default function PortalPage() {
  return (
    <PlaceholderPage
      href="/portal"
      title={
        <>
          Welcome back, Doctor <span aria-hidden>👋</span>
        </>
      }
      description="Plan smarter. Train better. Reach further."
    >
      <JourneyBanner current={null} />

      {/* Induction figures stay empty until the official data is imported — never invented. */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon="users" label="Applicants (current induction)" value={null} hint="Available after data import" />
        <Metric icon="building" label="Total seats" value={null} hint="Available after data import" />
        <Metric icon="layers" label="Specialities" value={null} hint="Available after data import" />
        <Metric icon="target" label="Your merit" value={null} hint="Appears once your record is linked" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-[1.2fr_1fr_0.8fr]">
        <Card>
          <CardHeader title="Quick actions" />
          <ul className="grid grid-cols-2 gap-3">
            {quickActions.map((a) => (
              <li key={a.href}>
                <Link
                  href={a.href}
                  className="flex h-full items-center gap-3 rounded-2xl border border-line bg-canvas/40 p-3.5 text-sm font-medium transition-colors hover:border-signal/40 hover:bg-signal/5"
                >
                  <Icon name={a.icon} className="h-[18px] w-[18px] flex-none text-signal" />
                  {a.label}
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Your shortlist" />
          <EmptyState
            title="No shortlist yet"
            action={
              <Link href="/portal/preferences" className="inline-flex items-center gap-1.5 text-sm font-semibold text-signal hover:text-signal-strong">
                Open preference planner <Icon name="arrow" className="h-4 w-4" />
              </Link>
            }
          >
            Specialities you add in the planner appear here with last year&apos;s closing merit.
          </EmptyState>
        </Card>

        <Card className="flex flex-col lg:col-span-2 xl:col-span-1">
          <CardHeader title="Placement chance" action={<Badge tone="simulated">Simulated</Badge>} />
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-2 text-center">
            <ChanceRing value={null} />
            <p className="max-w-[16rem] text-xs text-subtle">Run a simulation once your merit is linked to see an estimate here.</p>
          </div>
        </Card>
      </div>
    </PlaceholderPage>
  );
}
