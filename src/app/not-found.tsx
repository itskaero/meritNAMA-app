import { BrandLockup } from "@/components/brand";
import { ART } from "@/components/brand-assets";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function NotFound() {
  return (
    <main id="main" className="relative isolate grid min-h-screen place-content-center justify-items-center gap-8 overflow-hidden px-4">
      <h1 className="sr-only">Page not found</h1>
      <BrandLockup className="text-lg" />
      <EmptyState title="Page not found" action={<ButtonLink href="/" variant="secondary">Go home</ButtonLink>}>
        The link may be old, or the page may have moved. Merit lists, hospitals and the score finder are all a click from home.
      </EmptyState>
      <span aria-hidden className="mn-mask absolute inset-x-0 bottom-0 -z-10 mx-auto aspect-[1522/345] w-full max-w-4xl text-slate opacity-[0.12]" style={{ ["--mn-mask" as string]: `url(${ART.skyline})` }} />
    </main>
  );
}
