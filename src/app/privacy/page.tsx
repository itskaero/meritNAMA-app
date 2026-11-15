import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy" updated="15 November 2026">
      <p>meritNAMA is an independent tool built on the merit lists that are published for candidates. This page says what it keeps about you, why, and how to take it back.</p>

      <h2>What we keep</h2>
      <ul>
        <li><strong>Your email address</strong>, to sign you in with a one-time link or with Google. We never see a Google password.</li>
        <li><strong>Your merit record link</strong>, if you ask for it: your applicant ID, and, only if you choose to send one instead of your CNIC, the document a verifier checks. Your marks and allocations are shown from the published lists, to you only.</li>
        <li><strong>What you save</strong>: shortlist, saved views, preference lists, what you follow, and your notices.</li>
        <li><strong>What you write</strong>: questions, replies, reviews, votes, and chat messages, under the display name you choose.</li>
        <li><strong>Payment details you give us</strong> when paywall access is on: the amount, the bank&apos;s reference and an optional message. Payments themselves happen at your bank or wallet, not here.</li>
        <li><strong>Technical records</strong>: a sign-in session, and your browser type, for security. A hash of your network address is used to limit abuse and is not kept for long.</li>
        <li><strong>How you use the portal</strong>, for the owner: each page you open and when, your device type (for example &ldquo;Phone · Android · Chrome&rdquo;), and a one-way hash of your network address (never the address itself), so the owner can see who is online and spot an account used by two people at once. If session replay is on, your browser tab is recorded (clicks, scrolling and the pages shown) so the owner can watch how the site is used; everything you type is masked before it leaves your browser. Portal pages carry a faint code of your account, so a screenshot shared elsewhere can be traced. Page visits are kept for up to 90 days and recordings for up to 14, unless the owner sets shorter periods. Team members are not recorded.</li>
      </ul>

      <h2>What we do not keep</h2>
      <ul>
        <li>From PHF&apos;s published merit lists we keep what the lists themselves show publicly: each candidate&apos;s name, PMDC number, applicant ID, marks, seat, preference and consent, so people can find themselves and each other. Phone numbers, relations and employment details in the raw files are dropped as each file is read and never stored. Email addresses and CNICs are not stored either: only a one-way keyed hash of each is kept, so that typing your CNIC (or signing in with your email) can prove a record is yours. Neither can be read back from it.</li>
        <li>No advertising, no tracking pixels, and nothing is sold or shared for marketing.</li>
      </ul>

      <h2>Who can see it</h2>
      <ul>
        <li><strong>You</strong>, always.</li>
        <li><strong>The team</strong>, only what its job needs: verifiers see link requests and their documents; moderators see reported content; the owner sees access requests and payment references. Every change they make is written to an audit history.</li>
        <li><strong>Other members</strong> see only your display name and the badges you opt into, such as a coarse merit band. Chats are visible to the people in them.</li>
      </ul>

      <h2>Your choices</h2>
      <ul>
        <li><Link href="/portal/account">Download everything we hold about you</Link>, or delete your account, from your account page after signing in.</li>
        <li>Deleting removes your sign-in, record link, shortlist, saved items, votes and chat messages, and makes the account anonymous. Your questions and replies stay in the community as &ldquo;Deleted member&rdquo; because other people&apos;s answers depend on them; ask us to remove one on the <Link href="/contact">contact page</Link>. A payment request, if any, is kept for payment records.</li>
        <li>You can turn off shortlist alerts, merit-band display, being counted in &ldquo;people near your marks&rdquo;, and new one-to-one chats.</li>
        <li>Once your record is linked, you can hide your name, your PMDC number and your record notes from other candidates on your Me page, where the owner offers those switches. Lists then show your applicant ID instead.</li>
      </ul>

      <h2>Where it is kept</h2>
      <p>On a private server run by the owner of meritNAMA. Backups are taken regularly and kept for a limited time. Sign-in emails are sent through an email provider.</p>

      <h2>Changes</h2>
      <p>If this page changes in a way that matters, the date above changes. Questions: <Link href="/contact">contact us</Link>.</p>
    </LegalPage>
  );
}
