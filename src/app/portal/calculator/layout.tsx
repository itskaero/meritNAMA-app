import { FeatureGate } from "@/components/feature-gate";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <FeatureGate feature="calculator">{children}</FeatureGate>;
}
