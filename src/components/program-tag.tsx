import { cn } from "./ui/cn";

/** The colour token for a programme name (FCPS, MS, MD, MDS, FCPS Dentistry). */
export function programColor(program: string): string {
  const p = program.trim().toLowerCase();
  if (p.includes("dent")) return "var(--mn-prog-fcps-dentistry)";
  if (p === "fcps") return "var(--mn-prog-fcps)";
  if (p === "ms") return "var(--mn-prog-ms)";
  if (p === "md") return "var(--mn-prog-md)";
  if (p === "mds") return "var(--mn-prog-mds)";
  return "var(--mn-prog-other)";
}

/**
 * A programme label in its colour: a dot and the name. Colour is never the only
 * signal; the name is always printed.
 */
export function ProgramTag({ program, quota, className }: { program: string; quota?: string; className?: string }) {
  const color = programColor(program);
  return (
    <span className={cn("inline-flex max-w-full items-center gap-1.5 whitespace-nowrap text-sm", className)}>
      <span aria-hidden className="h-2 w-2 flex-none rounded-full" style={{ background: color }} />
      <span className="font-medium" style={{ color }}>{program.trim()}</span>
      {quota ? <span className="truncate text-muted">· {quota.trim()}</span> : null}
    </span>
  );
}
