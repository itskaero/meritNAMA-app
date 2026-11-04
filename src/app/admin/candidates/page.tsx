import { PlaceholderPage } from "@/components/placeholder-page";
import { requireSection } from "@/lib/auth/session";

export const metadata = { title: "Candidates" };

export default async function AdminCandidatesPage() {
  await requireSection("/admin/candidates");
  return <PlaceholderPage href="/admin/candidates" />;
}
