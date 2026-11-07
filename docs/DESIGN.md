# Design system

meritNAMA is a reference tool for medical students and doctors: merit lists, closing
merit, seats, scoring. The interface should read as credible, transparent and
academic, never as an AI product or a gaming dashboard. Light is the default.

## Where things live

| Concern | File |
|---|---|
| Tokens (colour, type, radius, shadow; light and dark) | `src/styles/tokens.css` |
| Tailwind names for the tokens, base styles, motion | `src/app/globals.css` |
| Fonts, theme attribute on `<html>` | `src/app/layout.tsx` |
| Theme and interface-mode cookies | `src/lib/ui-mode.ts`, `src/app/_actions/ui-mode.ts`, `src/components/theme-toggle.tsx` |
| Shell: sidebar, account menu, workspace, "What's new" strip | `src/components/app-shell.tsx`, `side-nav.tsx`, `whats-new.tsx` |
| Navigation (order and groups) | `src/lib/navigation.ts` |
| Page frame: breadcrumb, serif title, description | `src/components/area-page.tsx`, `ui/page-header.tsx` |
| Primitives | `src/components/ui/` (card, badge, button, data-table, metric, notice, empty-state, action-bar, styles) |
| Charts | `src/components/charts/` |
| Landing, sign-in, photographs and credits | `src/components/landing/`, `src/components/auth/`, `public/images/landing/` |

## Colour

Brand: Midnight Navy `#142536`, Slate Blue `#263C4D`, Muted Teal `#5B9487`, Warm
Ivory `#E7E2D8`. Light background `#F5F6F4`, white surfaces, borders `#E1E6E5`, text
`#202D38`.

Two brand values are below 4.5:1 as text on the light background, so they are used
only where they are not text:

- Muted Teal `#5B9487` (3.2:1): fills, chart series, the selected-nav marker, the logo
  beam. Text and buttons use the deeper teal `#3D7266` (`--mn-cyan`, 5.1:1).
- Secondary Text `#71808A` (3.8:1): icons and rules (`--mn-text-decor`). Secondary text
  uses `#56656F` (`--mn-text-muted`).

Semantic tokens keep their v1 names (`--mn-navy-950` is the page background,
`--mn-cyan` the primary action), so components use Tailwind names that describe the
role: `bg-canvas`, `bg-surface`, `bg-elevated`, `text-ink`, `text-heading`,
`text-muted`, `text-signal`, `bg-teal`, `bg-navy`, `bg-ivory`, `bg-tint`.

Dark mode uses navy and charcoal surfaces (`#0E1823`, `#142536`, `#1B2F42`). It applies
with `data-theme="dark"`, or `data-theme="system"` on a device set to dark. People
choose Light, Dark or Device in the account menu; the choice is a cookie, so the server
renders the right theme without a flash. `tests/tokens.test.ts` checks contrast for both
themes and that the system block repeats the dark values.

No glows, neon borders or decorative gradients. Gradients appear only as photo scrims.

## Typography

- Headings: Source Serif 4 (`font-serif`): page titles, landing sections, empty states.
- Interface and data: IBM Plex Sans, tabular numerals in tables and figures.
- Codes and identifiers: IBM Plex Mono.

Page titles are 30–38px serif; card titles 15–16px sans semibold; body 14–16px.

## Components

- **Cards**: white, 1px border, 10px radius, a faint shadow. A card is a section of a
  page; do not nest cards or put tiles inside cards.
- **Tables** (`DataTable`): compact rows, a raised header row, and a sticky header
  when the table has more than 30 rows (it scrolls inside its frame). Long tables are
  keyboard-scrollable regions.
- **Badges carry provenance**: `official` (published by PHF), `historical`,
  `calculated` (worked out by meritNAMA, e.g. closing merit), `current`, and
  `simulated` for estimates (amber, dashed). An estimate is never shown as official.
- **Buttons**: 8px radius; primary in deep teal, secondary outlined on white.
- **Notices**: a tinted panel with a coloured left rule.
- **Sidebar**: brand and search at the top, the menu in the middle (the only part that
  scrolls, so every section stays reachable), the account menu at the foot. The
  selected item has a soft teal fill and a teal marker. Pro mode keeps the icon rail.
- **"What's new"**: a one-line strip above the page, dismissible.

## Charts

Primary series in navy (ink in dark), comparison in muted teal, context in grey.
`--mn-chart-easier` (teal) means closing merit fell, `--mn-chart-harder` (terracotta)
that it rose, `--mn-chart-neutral` (grey) is for counts such as seats. Every chart
prints its values, says what it measures and where the data comes from, and an
estimate carries the `simulated` badge.

## Photography

Authentic and educational: real campuses, wards, lecture halls and people. No robots,
holograms or circuit boards. The landing and sign-in pages use two photographs of King
Edward Medical University, Lahore (CC BY-SA 4.0, credited in the footer and in
`public/images/landing/CREDITS.md`). They are 960px renditions; replace them with
higher-resolution photography when available by swapping the files and updating
`src/components/landing/photos.ts`.

## Checks

- `npx vitest run tests/tokens.test.ts`: contrast in both themes.
- Accessibility: axe-core over 31 pages, light and dark, desktop and phone width: no
  findings and no sideways scrolling (Nov 2026).

## Dashboard

The candidate dashboard (`src/app/portal/page.tsx`) leads with the person: their latest
marks, seat and that seat's closing merit (or how to link their record). Beside it, the
current induction: cycle dates, published rounds as links, and the cycle gauge only
while the cycle runs. Then the round's figures (the accepted-seats tile is left out when
a list was published without consent), median closing merit by round against the
previous induction, the latest round's movements in their own programme and quota,
what their marks reach (safe, borderline and out, with the highest-closing options),
who is still moving, and where every figure comes from. Each block says whether its
figures are published, calculated or an estimate.

## Social

- **Round room**: a log, not a messenger. One line per message, the latest round-day
  post pinned above it on a tint with the `calculated` badge, own messages on a soft
  teal fill, a pulsing "Live" dot only on a running induction's latest round (static
  under reduced motion). Older rounds read as an archive. It sits high on the round
  page while live, and near the foot otherwise.
- **Names** carry, in order: Team or Verified, the reputation level (Contributor
  neutral, Helpful teal, Trusted navy; nothing for New), and the opt-in merit band in
  mono (`FCPS · 21–22`).
- **Peer counts** are a teal chip, "n near your marks", on shortlist rows and on the
  dashboard's reachable options, and a "Popular near your marks" card. Below three
  nothing renders.

## Next increments

1. Sortable columns and a sticky filter bar on the long tables (finder, round lists,
   candidate records), with grouped, collapsible results.
2. Source and date captions on every chart, using the provenance badges.
3. Page tabs on the long detail pages (induction, hospital, speciality).
4. Allocation rules edited as a form instead of JSON.
5. Loading skeletons matched to each page's layout.
