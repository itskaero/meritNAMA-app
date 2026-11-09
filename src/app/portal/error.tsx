"use client";

import { SegmentError } from "@/components/segment-states";

export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  return <SegmentError error={error} retry={retry} />;
}
