import { PlaceholderPage } from "@/components/placeholder-page";
import { requireSection } from "@/lib/auth/session";

export const metadata = { title: "Audit history" };

export default async function AdminAuditPage() {
  await requireSection("/admin/audit");
  return <PlaceholderPage href="/admin/audit" />;
}
