"use client";

import { useEffect } from "react";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";
import { ART } from "./brand-assets";

export type SkeletonLayout = "dashboard" | "table" | "detail" | "finder" | "list";

const Head = () => (
  <>
    <Skeleton className="h-3 w-40" />
    <Skeleton className="h-10 w-2/3 max-w-md rounded-xl" />
    <Skeleton className="h-4 w-full max-w-xl" />
  </>
);
const CardBox = ({ className, children }: { className?: string; children?: React.ReactNode }) => (
  <div className={`grid content-start gap-3 rounded-xl border border-line bg-surface p-5 ${className ?? ""}`}>{children}</div>
);
const Rows = ({ n = 8 }: { n?: number }) => (
  <div className="grid gap-2">{Array.from({ length: n }, (_, i) => <Skeleton key={i} className="h-8" />)}</div>
);

/**
 * Loading placeholders shaped like the page that is coming, so the layout does not
 * jump when it arrives. Used by the loading.tsx of each long page.
 */
export function PageSkeleton({ layout }: { layout: SkeletonLayout }) {
  return (
    <div role="status" aria-live="polite" className="grid gap-5 px-4 py-6 sm:px-8">
      <span className="sr-only">Loading…</span>
      <Head />
      {layout === "dashboard" ? (
        <>
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <Skeleton className="h-64 rounded-xl" />
            <CardBox><Skeleton className="h-5 w-48" /><Rows n={4} /></CardBox>
          </div>
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
          <CardBox><Skeleton className="h-5 w-56" /><Skeleton className="h-56" /></CardBox>
        </>
      ) : layout === "table" ? (
        <>
          <CardBox><div className="grid gap-3 sm:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}</div></CardBox>
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <CardBox><Skeleton className="h-5 w-40" /><Rows n={6} /></CardBox>
            <CardBox><Skeleton className="h-5 w-32" /><Rows n={10} /></CardBox>
          </div>
        </>
      ) : layout === "detail" ? (
        <>
          <Skeleton className="h-10 w-full max-w-2xl rounded-lg" />
          <Skeleton className="h-36 rounded-xl" />
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
            <CardBox><Skeleton className="h-5 w-32" /><Rows n={6} /></CardBox>
            <CardBox><Skeleton className="h-5 w-48" /><Skeleton className="h-60" /></CardBox>
          </div>
        </>
      ) : layout === "finder" ? (
        <>
          <CardBox><div className="grid gap-3 md:grid-cols-[repeat(4,minmax(0,1fr))_auto]">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}<Skeleton className="h-10 w-28" /></div></CardBox>
          <div className="grid grid-cols-3 gap-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
          <CardBox><Rows n={8} /></CardBox>
        </>
      ) : (
        <CardBox><Rows n={8} /></CardBox>
      )}
    </div>
  );
}

/** Shown while a page in the admin or portal area loads. */
export function SegmentLoading() {
  return (
    <div role="status" aria-live="polite" className="grid gap-5 px-4 py-10 sm:px-8">
      <span className="sr-only">Loading…</span>
      <Skeleton className="h-10 w-2/3 max-w-md rounded-xl" />
      <Skeleton className="h-5 w-full max-w-xl" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}

/** Error boundary body: never shows server error details, only the digest for log lookup. */
export function SegmentError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => console.error(error), [error]);
  const digest = error instanceof Error && "digest" in error ? String(error.digest) : null;
  return (
    <div className="px-4 py-16 sm:px-8">
      <div role="alert" className="relative isolate mx-auto max-w-lg overflow-hidden rounded-xl border border-line border-l-4 border-l-danger bg-surface p-6 shadow-[var(--mn-shadow-1)]">
        <span aria-hidden className="mn-mask absolute -right-16 -top-10 -z-10 h-56 w-72 text-teal opacity-[0.08]" style={{ ["--mn-mask" as string]: `url(${ART.contour})` }} />
        <h1 className="font-serif text-xl font-semibold text-heading">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted">The page could not be loaded. Try again in a moment. If it keeps failing, the reference below helps us find the cause.</p>
        {digest ? <p className="mt-2 font-mono text-xs text-subtle">Reference: {digest}</p> : null}
        <Button className="mt-5" onClick={() => retry()}>Try again</Button>
      </div>
    </div>
  );
}
