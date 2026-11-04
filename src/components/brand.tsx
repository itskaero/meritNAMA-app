import { cn } from "./ui/cn";

/*
 * meritNAMA "Beam M": two stems form the M, and its valley rises as an ember
 * beam with an arrow tip (merit moving up). Stems use currentColor so the mark
 * works on dark and light grounds. The beam is layered solid fills rather than an
 * SVG gradient: gradients need document-unique ids, and the same mark is rendered
 * more than once per page (phone header and sidebar).
 */
export function LogoMark({ className = "h-7 w-7", title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} role={title ? "img" : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <path d="M8 56V14a4 4 0 0 1 7.3-2.3L27 28.6" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M56 56V14a4 4 0 0 0-7.3-2.3L37 28.6" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="28.5" y="15" width="7" height="41" rx="3.5" style={{ fill: "var(--mn-ember)" }} />
      <rect x="28.5" y="38" width="7" height="18" rx="3.5" style={{ fill: "var(--mn-ember-deep)", opacity: 0.7 }} />
      <rect x="28.5" y="15" width="7" height="12" rx="3.5" style={{ fill: "var(--mn-ember-hot)", opacity: 0.55 }} />
      <path d="M24.5 17 32 7l7.5 10" fill="none" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--mn-ember-hot)" }} />
    </svg>
  );
}

/** "merit" in the body face, "NAMA" in the wide display face. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("text-[1.05rem] font-semibold tracking-tight", className)}>
      merit<span className="font-display font-extrabold tracking-[0.02em] [font-stretch:125%]">NAMA</span>
    </span>
  );
}

/** Mark + wordmark lockup, e.g. for the sidebar and auth pages. */
export function BrandLockup({ className, markClassName = "h-7 w-7" }: { className?: string; markClassName?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 text-ink", className)}>
      <LogoMark className={markClassName} />
      <Wordmark />
    </span>
  );
}
