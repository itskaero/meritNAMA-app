/** "Find yourself": a plain search box for an applicant ID, used on Merit lists and Home. */
export function FindBox({ title = "Find yourself in the lists" }: { title?: string }) {
  return (
    <form method="get" action="/portal/history/find" role="search" className="grid gap-3 rounded-xl border border-line bg-surface p-5 shadow-[var(--mn-shadow-1)] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
      <label className="grid gap-1.5">
        <span className="text-base font-semibold text-heading">{title}</span>
        <span className="text-sm text-muted">Type your applicant ID (or anyone&apos;s) to see the seat, marks and consent in every round.</span>
        <input name="id" inputMode="numeric" autoComplete="off" placeholder="Applicant ID, e.g. 27267" className="mt-1 h-12 rounded-lg border border-line-strong bg-surface px-4 font-mono text-lg text-ink placeholder:text-subtle" />
      </label>
      <button type="submit" className="h-12 rounded-lg bg-signal px-6 text-base font-semibold text-signal-ink hover:bg-signal-strong">Find</button>
    </form>
  );
}
