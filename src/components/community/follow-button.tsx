import { followAction } from "@/app/portal/community/actions";
import { Icon } from "@/components/icon";
import { SplitButton } from "@/components/ui/split-button";
import type { FollowTarget } from "@/lib/data/notifications";

/**
 * Follow / Following toggle in the GitHub split style (label | followers), with a neon
 * violet edge while following. A plain form post, so it works without JavaScript.
 */
export function FollowButton({ target, following, path, label, count }: { target: FollowTarget; following: boolean; path: string; label?: string; count?: number | null }) {
  return (
    <form action={followAction}>
      <input type="hidden" name="kind" value={target.kind} />
      <input type="hidden" name="key" value={target.key} />
      <input type="hidden" name="on" value={following ? "0" : "1"} />
      <input type="hidden" name="path" value={path} />
      <SplitButton
        type="submit"
        on={following}
        count={count}
        title={following ? "Stop notifications in your inbox" : "Get new answers and rounds in your inbox"}
        icon={<Icon name={following ? "check" : "bell"} className="h-4 w-4" />}
        label={following ? "Following" : (label ?? "Follow")}
      />
    </form>
  );
}
