"use client";

export function PrintButton() {
  return <button type="button" onClick={() => window.print()} className="h-9 rounded-full px-4 text-sm font-semibold text-muted hover:bg-hover hover:text-ink">Print</button>;
}
