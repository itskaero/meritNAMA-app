import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal-page";
import { supportEmail } from "@/lib/support";

export const metadata: Metadata = { title: "Contact" };
export const dynamic = "force-dynamic";

export default function ContactPage() {
  const email = supportEmail();
  return (
    <LegalPage title="Contact">
      <p>One person runs meritNAMA, so replies can take a day or two. The quickest way to get an answer is to include what you need in the first message.</p>
      {email ? (
        <p>Email <a href={`mailto:${email}`} className="font-semibold">{email}</a>.</p>
      ) : (
        <p>Reply to any email we have sent you, or ask in the community once you are signed in.</p>
      )}
      <h2>Include, when it applies</h2>
      <ul>
        <li><strong>Access or payment:</strong> the email you signed up with, the amount, and the transaction reference from your bank or wallet app.</li>
        <li><strong>A wrong figure:</strong> the page, the round, and what the official list says.</li>
        <li><strong>Removing something you posted, or your data:</strong> what it is. You can also download or delete your own data from your account page after <Link href="/sign-in">signing in</Link>.</li>
        <li><strong>A report about a post or chat message:</strong> use the Report button next to it; moderators see those.</li>
      </ul>
      <p>Please do not send passwords, full card numbers, or your CNIC by email. We will never ask for them.</p>
    </LegalPage>
  );
}
