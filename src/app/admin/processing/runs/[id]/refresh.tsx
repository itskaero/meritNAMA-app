"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Notice } from "@/components/ui/notice";

/** Reloads the run page every few seconds while the run is in progress. */
export function Refresh() {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [router]);
  return <Notice title="Running">The simulation runs on the server; this page updates by itself.</Notice>;
}
