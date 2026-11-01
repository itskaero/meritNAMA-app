import { ChanceRing } from "@/components/dashboard/chance-ring";
import { Icon, type IconName } from "@/components/icon";
import { PlaceholderPage } from "@/components/placeholder-page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";

export const metadata = { title: "Simulation" };

const field = "h-11 w-full rounded-xl border border-line-strong bg-canvas/60 px-3.5 text-sm text-ink placeholder:text-subtle disabled:cursor-not-allowed";

const insights: { icon: IconName; label: string }[] = [
  { icon: "bars", label: "Closing merit (last induction)" },
  { icon: "trend", label: "Your position (estimated)" },
  { icon: "users", label: "Competition (same merit ±5)" },
];

export default function PortalSimulationPage() {
  return (
    <PlaceholderPage href="/portal/simulation" title="Placement simulation">
      <Notice title="Simulations are not official decisions">
        Every result on this page will be labelled as a simulation, with the dataset and assumptions it used.
      </Notice>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <Card>
          <CardHeader title="Inputs" description="The form is a preview: it connects to the simulation engine in Delivery 4." />
          {/* Disabled until the engine is connected, so nothing here pretends to work. */}
          <fieldset disabled className="space-y-5">
            <legend className="sr-only">Simulation inputs (not yet available)</legend>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">Your merit</span>
              <input className={field} inputMode="decimal" placeholder="Linked from your record" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">Quota</span>
              <select className={field} defaultValue="">
                <option value="" disabled>
                  Select quota
                </option>
              </select>
            </label>
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted">Preferences</p>
              <ol className="space-y-2">
                {[1, 2, 3].map((n) => (
                  <li key={n} className="flex items-center gap-2">
                    <span className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-elevated text-sm font-semibold text-muted">{n}</span>
                    <span className="flex h-11 flex-1 items-center rounded-xl border border-dashed border-line-strong px-3.5 text-sm text-subtle">
                      Choose a speciality and hospital
                    </span>
                  </li>
                ))}
              </ol>
              <Button variant="secondary" size="sm" className="mt-3">
                <Icon name="plus" className="h-4 w-4" /> Add preference
              </Button>
            </div>
            <Button className="w-full">
              Run simulation <Icon name="arrow" className="h-4 w-4" />
            </Button>
          </fieldset>
        </Card>

        <div className="grid content-start gap-5">
          <Card className="flex flex-col items-center gap-6 sm:flex-row">
            <ChanceRing value={null} size={120} />
            <div className="text-center sm:text-left">
              <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                <h2 className="text-lg font-semibold">Likely placement</h2>
                <Badge tone="simulated">Simulated</Badge>
              </div>
              <p className="mt-2 text-sm text-muted">
                No simulation yet. The predicted speciality and hospital — or an unplaced outcome — will appear here, with the preference
                that produced it.
              </p>
            </div>
          </Card>

          <Card>
            <CardHeader title="Simulation insights" />
            <ul className="divide-y divide-line">
              {insights.map((r) => (
                <li key={r.label} className="flex items-center justify-between gap-4 py-3.5 text-sm">
                  <span className="flex items-center gap-3 text-muted">
                    <Icon name={r.icon} className="h-[18px] w-[18px] text-signal" />
                    {r.label}
                  </span>
                  <span className="font-semibold tabular-nums text-subtle" aria-label="Not available">—</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </PlaceholderPage>
  );
}
