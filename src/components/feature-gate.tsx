import type { ReactNode } from "react";
import { can } from "@/lib/auth/roles";
import { getSession } from "@/lib/auth/session";
import { FEATURES, featureFlags, type Feature } from "@/lib/data/settings";
import { checkDatabase, getDb } from "@/lib/db/client";
import { AreaPage } from "./area-page";
import { EmptyState } from "./ui/empty-state";
import { Notice } from "./ui/notice";

/**
 * Wraps a portal feature's pages (in its layout). When an owner has switched the
 * feature off, candidates get a short notice instead; staff still see the pages,
 * with a reminder, so they can try them before switching them back on.
 */
export async function FeatureGate({ feature, children }: { feature: Feature; children: ReactNode }) {
  if ((await checkDatabase()) !== "ok") return children;
  const session = await getSession();
  const on = (await featureFlags(getDb(), session))[feature];
  if (on) return children;
  const f = FEATURES[feature];
  if (can(session, "staff")) {
    return (
      <>
        <div className="px-4 pt-4 sm:px-8"><Notice tone="warning" title={`${f.label} is switched off for candidates`}>You can see it because you are staff. Switch it back on under Team &amp; roles.</Notice></div>
        {children}
      </>
    );
  }
  return (
    <AreaPage area="portal" trail={[{ label: f.label }]} title={f.label}>
      <EmptyState title="Not available right now">{f.label} is switched off for now. It will be back soon.</EmptyState>
    </AreaPage>
  );
}
