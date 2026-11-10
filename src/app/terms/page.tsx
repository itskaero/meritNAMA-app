import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal-page";
import { loadAccessSettings } from "@/lib/data/access";
import { getDb } from "@/lib/db/client";
import { DEFAULT_ACCESS, priceText } from "@/lib/domain/access";

export const metadata: Metadata = { title: "Terms" };
export const dynamic = "force-dynamic";

export default async function TermsPage() {
  const access = await loadAccessSettings(getDb()).catch(() => DEFAULT_ACCESS);
  return (
    <LegalPage title="Terms of use" updated="10 November 2026">
      <p>By using meritNAMA you agree to these terms. They are short on purpose.</p>

      <h2>What meritNAMA is</h2>
      <ul>
        <li>An independent tool for candidates. It is <strong>not</strong> an official admissions authority and is not connected to one.</li>
        <li>Merit lists come from what has been published. Estimates, predictions, simulations and &ldquo;chances&rdquo; are calculations, not promises. Past results do not guarantee placement. Always check the official notices before you decide anything.</li>
        <li>We work to keep the figures correct, but they can be wrong or late. Use them as help, not as the only basis for a decision.</li>
      </ul>

      <h2>Your account</h2>
      <ul>
        <li>Use your own email. Do not share your sign-in links, and do not try to see anyone else&apos;s record.</li>
        <li>Link only your own merit record. A false link request can be refused and the account closed.</li>
      </ul>

      <h2>Community and chats</h2>
      <ul>
        <li>Be civil. No spam, advertising, abuse, or other people&apos;s personal details (phone numbers, CNICs, PMDC numbers).</li>
        <li>Anything you post can be reported, hidden or removed, and accounts that misuse the site can be closed.</li>
        <li>Do not copy the site&apos;s data in bulk or put heavy automated load on it.</li>
      </ul>
      {access.paywall ? (
        <>
          <h2>Access fee and refunds</h2>
          <ul>
            <li>Access is by approval. The fee is {priceText(access)} by bank or wallet transfer, then a request with the amount and the transaction reference. We check each payment by hand and approve by email.</li>
            <li>{access.refundNote}</li>
          </ul>
        </>
      ) : null}

      <h2>Responsibility</h2>
      <p>meritNAMA is provided as it is. To the extent the law allows, we are not responsible for decisions made using it, or for losses from the site being unavailable or wrong.</p>

      <h2>Contact and changes</h2>
      <p>See the <Link href="/privacy">privacy policy</Link> for what we keep about you. Questions, complaints and refund requests go through the <Link href="/contact">contact page</Link>. We may update these terms; the date above says when.</p>
    </LegalPage>
  );
}
