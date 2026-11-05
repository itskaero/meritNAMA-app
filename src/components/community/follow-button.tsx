import { followAction } from "@/app/portal/community/actions";
import { Icon } from "@/components/icon";
import { cn } from "@/components/ui/cn";
import type { FollowTarget } from "@/lib/data/notifications";

/** Follow / Following toggle. A plain form post, so it works without JavaScript. */
export function FollowButton({ target, following, path, label }: { target: FollowTarget; following: boolean; path: string; label?: string }) {
  return (
    <form action={followAction}>
      <input type="hidden" name="kind" value={target.kind} />
      <input type="hidden" name="key" value={target.key} />
      <input type="hidden" name="on" value={following ? "0" : "1"} />
      <input type="hidden" name="path" value={path} />
      <button
        type="submit"
        aria-pressed={following}
        title={following ? "Stop notifications in your inbox" : "Get new answers and rounds in your inbox"}
        className={cn(
          "inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition-colors",
          following ? "border-signal/50 bg-signal/10 text-signal" : "border-line-strong text-muted hover:border-signal/50 hover:text-ink",
        )}
      >
        <Icon name={following ? "check" : "bell"} className="h-4 w-4" />
        {following ? "Following" : (label ?? "Follow")}
      </button>
    </form>
  );
}
