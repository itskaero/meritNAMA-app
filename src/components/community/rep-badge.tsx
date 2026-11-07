import { Badge, type BadgeTone } from "../ui/badge";

const TONE: Record<string, BadgeTone> = { Contributor: "neutral", Helpful: "calculated", Trusted: "official" };

/**
 * A member's reputation level beside their name. "New" shows nothing, so the badge
 * marks people the community has found helpful rather than labelling newcomers.
 */
export function RepBadge({ level, className }: { level: string | null | undefined; className?: string }) {
  if (!level || !TONE[level]) return null;
  return (
    <Badge tone={TONE[level]} className={className}>
      <span aria-hidden>{level === "Trusted" ? "★" : level === "Helpful" ? "✓" : "·"}</span>
      {level}
    </Badge>
  );
}
