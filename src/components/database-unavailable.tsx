import type { ComponentProps, ReactNode } from "react";
import { checkDatabase } from "@/lib/db/client";
import { AreaPage } from "./area-page";
import { EmptyState } from "./ui/empty-state";

export function DatabaseUnavailable() {
  return <EmptyState title="Data is not available right now">The database could not be reached. Try again in a moment.</EmptyState>;
}

/**
 * For data pages: when the database is down, the page to render instead (same frame,
 * friendly message); otherwise null. Usage: `const down = await whenDatabaseDown(frame); if (down) return down;`
 */
export async function whenDatabaseDown(frame: Omit<ComponentProps<typeof AreaPage>, "children">): Promise<ReactNode | null> {
  return (await checkDatabase()) === "ok" ? null : <AreaPage {...frame}><DatabaseUnavailable /></AreaPage>;
}
