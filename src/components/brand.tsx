import Link from "next/link";
import { useId } from "react";

/** The MeritNAMA "M": two strokes rising like a merit curve, lavender to sunset. */
export function BrandMark({ className = "h-7 w-7" }: { className?: string }) {
  const id = useId();
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={className}>
      <defs>
        <linearGradient id={id} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="var(--mn-accent-deep)" />
          <stop offset=".6" stopColor="var(--mn-accent)" />
          <stop offset="1" stopColor="var(--mn-amber)" />
        </linearGradient>
      </defs>
      <path
        d="M5 26V8.5c0-1.3 1.6-1.9 2.5-.9L16 17l8.5-9.4c.9-1 2.5-.4 2.5.9V26"
        fill="none"
        stroke={`url(#${id})`}
        strokeWidth="4.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function BrandLockup({ href = "/", compact = false }: { href?: string; compact?: boolean }) {
  return (
    <Link href={href} className="flex items-center gap-2.5 font-extrabold tracking-tight" aria-label="MeritNAMA home">
      <BrandMark className="h-7 w-7 flex-none" />
      {compact ? null : (
        <span>
          Merit<span className="text-signal">NAMA</span>
        </span>
      )}
    </Link>
  );
}
