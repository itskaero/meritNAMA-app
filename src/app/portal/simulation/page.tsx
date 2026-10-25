import { PlaceholderPage } from "@/components/placeholder-page";
import { Notice } from "@/components/ui/notice";

export const metadata = { title: "Simulation" };

export default function PortalSimulationPage() {
  return (
    <PlaceholderPage href="/portal/simulation">
      <Notice title="Simulations are not official decisions">
        Every result on this page will be labelled as a simulation, with the dataset and assumptions it used.
      </Notice>
    </PlaceholderPage>
  );
}
