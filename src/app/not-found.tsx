import { BrandLockup } from "@/components/brand";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function NotFound() {
  return (
    <main id="main" className="grid min-h-screen place-content-center justify-items-center gap-8 px-4">
      <BrandLockup className="text-lg" />
      <EmptyState title="Page not found" action={<ButtonLink href="/" variant="secondary">Go home</ButtonLink>} />
    </main>
  );
}
