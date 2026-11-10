import Link from "next/link";
import { AreaPage } from "@/components/area-page";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { requireCan } from "@/lib/auth/session";
import { findSection } from "@/lib/navigation";
import { DeleteAccountForm } from "./forms";

export const metadata = { title: "Your data" };
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const session = await requireCan("portal");
  const s = findSection("/portal/account");
  const staff = session.role !== "candidate";
  return (
    <AreaPage area="portal" trail={[{ label: s.label }]} title={s.label} description={s.description}>
      <Card>
        <CardHeader title="Download my data" description="One JSON file with everything meritNAMA stores about this account: your details, record link, merit rows, shortlist, saved items, posts and messages." />
        <ButtonLink href="/api/me/export" download>Download my data</ButtonLink>
      </Card>
      <Card>
        <CardHeader title="Delete my account" description="Removes your sign-in, record link, shortlist, saved items, votes and chat messages, and makes the account anonymous. It cannot be undone." />
        <div className="mb-4 grid gap-1.5 text-sm text-muted">
          <p>Your community questions and replies stay as &ldquo;Deleted member&rdquo;, because other people&apos;s answers depend on them. To remove one, <Link href="/contact" className="text-signal hover:underline">contact us</Link>. A payment request, if you made one, is kept for payment records.</p>
        </div>
        {staff ? <Notice tone="warning" title="Team accounts are removed by the owner from Team & roles." /> : <DeleteAccountForm email={session.email} />}
      </Card>
      <p className="text-sm text-muted">See the <Link href="/privacy" className="text-signal hover:underline">privacy policy</Link> and the <Link href="/terms" className="text-signal hover:underline">terms</Link>.</p>
    </AreaPage>
  );
}
