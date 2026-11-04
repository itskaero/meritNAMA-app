import { PlaceholderPage } from "@/components/placeholder-page";
import { requireSection } from "@/lib/auth/session";

export const metadata = { title: "Processing & simulation" };

export default async function AdminProcessingPage() {
  await requireSection("/admin/processing");
  return <PlaceholderPage href="/admin/processing" />;
}
