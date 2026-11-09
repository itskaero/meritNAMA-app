import { describeRules, type ResolvedRules } from "@/lib/engine/rules";

/** The rules an induction runs with, in words. */
export function RulesSummary({ resolved }: { resolved: ResolvedRules }) {
  return (
    <dl className="grid gap-3 text-sm sm:grid-cols-[minmax(0,11rem)_1fr]">
      {describeRules(resolved).map((r) => (
        <div key={r.topic} className="contents">
          <dt className="font-medium">{r.topic}</dt>
          <dd className="text-muted">{r.text}</dd>
        </div>
      ))}
    </dl>
  );
}
