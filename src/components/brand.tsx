import { cn } from "./ui/cn";

/*
 * meritNAMA logo, Direction 1 version B (meritnamav4.md §5): two arches of the m and a
 * third leg falling from a closed loop (the head and tail of the Urdu م), with the
 * rank point ABOVE the loop (below it would read as پ). The stroke uses currentColor so
 * the mark works on any ground; the point is violet.
 *
 * `animate` plays the intro once (stroke draws, point drops with a bounce and a ping)
 * and then the point breathes; `loading` runs a dash along the stroke. Both are still
 * under prefers-reduced-motion (globals.css). Small sizes use the compact path
 * (heavier stroke, tighter loop) so the mark holds up at 16-24px.
 */
const FULL = { d: "M14 90 V44 a13 13 0 0 1 26 0 V90 M40 44 a13 13 0 0 1 26 0 a14 14 0 1 1 28 0 a14 14 0 1 1 -28 0 V98", w: 11 };
const COMPACT = { d: "M16 88 V46 a12 12 0 0 1 24 0 V88 M40 46 a12 12 0 0 1 24 0 a15 15 0 1 1 30 0 a15 15 0 1 1 -30 0 V92", w: 14 };

export function LogoMark({ className = "h-7 w-7", title, animate = false, loading = false, compact = false }: {
  className?: string;
  title?: string;
  animate?: boolean;
  loading?: boolean;
  /** Heavier strokes for 16-24px (favicon, phone header). */
  compact?: boolean;
}) {
  const p = compact ? COMPACT : FULL;
  const moving = animate || loading;
  return (
    <svg
      viewBox="0 0 110 106"
      className={cn(className, loading && "mn-logo-loading")}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <path
        d={p.d}
        pathLength={1}
        fill="none"
        stroke="currentColor"
        strokeWidth={p.w}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={moving ? "mn-logo-draw" : undefined}
      />
      {animate ? <circle cx="80" cy="12" r="6.5" fill="none" stroke="var(--mn-violet-soft)" strokeWidth="2" className="mn-logo-ping" /> : null}
      <circle cx="80" cy="12" r={compact ? 7.5 : 6.5} style={{ fill: "var(--mn-violet-soft)" }} className={animate ? "mn-logo-dot" : undefined} />
    </svg>
  );
}

/** "merit" regular + "NAMA" bold, both in Inter. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("text-[1.08rem] tracking-tight text-heading", className)}>
      <span className="font-normal">merit</span><span className="font-bold tracking-[0.02em]">NAMA</span>
    </span>
  );
}

/** The Urdu name, میرٹ نامہ, in Noto Nastaliq Urdu (loaded only where it is shown). */
export function UrduName({ className }: { className?: string }) {
  return (
    <span lang="ur" dir="rtl" className={cn("leading-[2] text-muted", className)} style={{ fontFamily: "var(--mn-font-urdu)" }}>
      میرٹ نامہ
    </span>
  );
}

/** Mark + wordmark lockup, e.g. for the sidebar and auth pages. */
export function BrandLockup({ className, markClassName = "h-7 w-7", animate = false }: { className?: string; markClassName?: string; animate?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 text-ink", className)}>
      <LogoMark className={markClassName} animate={animate} />
      <Wordmark />
    </span>
  );
}
