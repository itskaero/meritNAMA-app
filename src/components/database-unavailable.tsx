import { EmptyState } from "./ui/empty-state";

export function DatabaseUnavailable() {
  return <EmptyState title="Data is not available right now">The database could not be reached. Try again in a moment.</EmptyState>;
}
