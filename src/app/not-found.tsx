import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function NotFound() {
  return (
    <main id="main" className="grid min-h-screen place-items-center px-4">
      <EmptyState title="Page not found" action={<ButtonLink href="/" variant="secondary">Go home</ButtonLink>} />
    </main>
  );
}
