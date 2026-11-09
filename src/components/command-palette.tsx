"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Icon, type IconName } from "./icon";
import { cn } from "./ui/cn";

export type Command = {
  label: string;
  /** Shown on the right: where the item lives, or what it does. */
  hint: string;
  href: string;
  icon: IconName;
  /** A file download or non-page route: full navigation instead of client routing. */
  download?: boolean;
  /** Extra words that should match (synonyms). */
  keywords?: string;
};

const OPEN_EVENT = "mn:open-palette";

/**
 * Opens the palette from anywhere (Ctrl/⌘K also works). Full size it looks like a
 * search field ("Search… ⌘K"); compact it is an icon button for the Pro rail.
 */
export function PaletteButton({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}
      className={cn(
        "inline-flex items-center gap-2 border border-line bg-canvas text-sm text-subtle transition-colors hover:border-line-strong hover:text-ink",
        compact ? "h-10 w-10 justify-center rounded-full" : "h-10 rounded-xl px-3",
        className,
      )}
      aria-label="Search pages and actions (Ctrl K)"
      title="Search pages and actions (Ctrl K)"
    >
      <Icon name="search" className="h-[18px] w-[18px]" />
      {compact ? null : (
        <>
          <span className="flex-1 text-left">Search…</span>
          <kbd className="rounded-md border border-line-strong px-1.5 py-0.5 font-mono text-[0.68rem] text-muted">⌘K</kbd>
        </>
      )}
    </button>
  );
}

/**
 * Keyboard-first jump list. Focus stays in the search box; the highlighted item is
 * exposed with aria-activedescendant. Esc or a click outside closes it and focus
 * returns to whatever opened it.
 */
export function CommandPalette({ commands }: { commands: Command[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const listId = useId();

  const results = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return commands
      .filter((c) => {
        const hay = `${c.label} ${c.hint} ${c.keywords ?? ""}`.toLowerCase();
        return words.every((w) => hay.includes(w));
      })
      .slice(0, 12);
  }, [commands, query]);

  const show = useCallback(() => {
    openerRef.current = document.activeElement as HTMLElement | null;
    setQuery("");
    setActive(0);
    setOpen(true);
  }, []);
  const hide = useCallback(() => {
    setOpen(false);
    openerRef.current?.focus?.();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (open) hide();
        else show();
      }
    };
    const onOpen = () => show();
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, [open, show, hide]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const go = (c: Command | undefined) => {
    if (!c) return;
    setOpen(false);
    if (c.download) window.location.assign(c.href);
    else router.push(c.href);
  };

  if (!open) return null;
  const safeActive = Math.min(active, Math.max(results.length - 1, 0));

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-canvas/70 px-4 pt-[12vh] backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && hide()}
    >
      <div role="dialog" aria-modal="true" aria-label="Search and jump" className="w-full max-w-xl overflow-hidden rounded-2xl border border-line-strong bg-surface shadow-[var(--mn-shadow-2)]">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Icon name="search" className="h-5 w-5 text-subtle" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") hide();
              else if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
              else if (e.key === "Enter") { e.preventDefault(); go(results[safeActive]); }
              else if (e.key === "Tab") e.preventDefault(); // focus stays in the dialog
            }}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={results.length ? `${listId}-${safeActive}` : undefined}
            aria-label="Search pages and actions"
            placeholder="Search pages and actions…"
            className="h-14 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-subtle focus-visible:shadow-none"
          />
        </div>
        <ul id={listId} role="listbox" aria-label="Results" className="max-h-[50vh] overflow-y-auto p-2">
          {results.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-muted">No matches. Try a page name such as “seats” or “policies”.</li>
          ) : (
            results.map((c, i) => (
              <li
                key={`${c.href}-${c.label}`}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === safeActive}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(c)}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm",
                  i === safeActive ? "bg-elevated text-ink shadow-[inset_3px_0_0_var(--mn-cyan)]" : "text-muted",
                )}
              >
                <Icon name={c.icon} className="h-[18px] w-[18px] flex-none" />
                <span className="flex-1 truncate">{c.label}</span>
                <span className="truncate font-mono text-xs text-subtle">{c.hint}</span>
              </li>
            ))
          )}
        </ul>
        <div className="flex flex-wrap gap-4 border-t border-line px-4 py-2.5 text-xs text-subtle">
          <span><kbd className="font-mono">↑ ↓</kbd> move</span>
          <span><kbd className="font-mono">Enter</kbd> open</span>
          <span><kbd className="font-mono">Esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
