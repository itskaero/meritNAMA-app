import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata = { title: "Access denied" };

export default function Forbidden() {
  return (
    <main id="main" className="grid min-h-screen place-items-center px-4">
      <EmptyState title="You don’t have access to this area" action={<ButtonLink href="/start" variant="secondary">Go to your home</ButtonLink>}>
        Your account’s role does not include this section. If you think this is wrong, contact an administrator.
      </EmptyState>
    </main>
  );
}
