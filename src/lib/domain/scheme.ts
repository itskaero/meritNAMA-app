/**
 * A scoring scheme is what the marks reward: the parts of the score and how many marks each is
 * worth. Two inductions compare like for like only when their schemes match. A different total
 * is not the only difference: a 24/30 and a 24/100 are not the same achievement even in percent.
 */

export type PolicyLike = {
  induction?: unknown;
  label?: string;
  total_marks?: number;
  components?: { key: string; max_marks: number; included?: boolean }[];
};

export type Scheme = { key: string; label: string; total: number | null; signature: string };

/** The parts that count towards the total, as "key:marks" sorted, so the order in the file does not matter. */
export function schemeOf(p: (PolicyLike & { key: string }) | null): Scheme | null {
  if (!p) return null;
  const parts = (p.components ?? []).filter((c) => c.included !== false).map((c) => `${c.key}:${c.max_marks}`).sort();
  return { key: p.key, label: p.label ?? p.key, total: p.total_marks ?? null, signature: `${p.total_marks ?? "?"}|${parts.join(",")}` };
}

/** True only when both schemes are known and score the same parts for the same marks. */
export function sameScheme(a: Scheme | null, b: Scheme | null): boolean {
  return Boolean(a && b && (a.key === b.key || a.signature === b.signature));
}
