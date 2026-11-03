"use client";

import { useEffect } from "react";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";

/** Shown while a page in the admin or portal area loads. */
export function SegmentLoading() {
  return (
    <div role="status" aria-live="polite" className="grid gap-5 px-4 py-10 sm:px-8">
      <span className="sr-only">Loading…</span>
      <Skeleton className="h-10 w-2/3 max-w-md rounded-xl" />
      <Skeleton className="h-5 w-full max-w-xl" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32 rounded-[1.5rem]" />)}
      </div>
      <Skeleton className="h-64 rounded-[1.5rem]" />
    </div>
  );
}

/** Error boundary body: never shows server error details, only the digest for log lookup. */
export function SegmentError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => console.error(error), [error]);
  const digest = error instanceof Error && "digest" in error ? String(error.digest) : null;
  return (
    <div className="px-4 py-16 sm:px-8">
      <div role="alert" className="mx-auto max-w-lg rounded-[1.5rem] border border-danger/40 bg-danger/10 p-6">
        <h1 className="text-lg font-semibold text-danger">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted">The page could not be loaded. Try again; if it keeps failing, check the server logs.</p>
        {digest ? <p className="mt-2 font-mono text-xs text-subtle">Reference: {digest}</p> : null}
        <Button className="mt-5" onClick={() => retry()}>Try again</Button>
      </div>
    </div>
  );
}
