# meritNAMA v3: dark theme, Data page, chats, feed, Me, access requests

Branch `feat/v3-data-folder` into `main`. Plan and progress: [meritnamav3.md](../meritnamav3.md).

## What changes

- **Dark by default.** New tokens, violet action colour (`#7557F8`, AA with white text), Plus Jakarta Sans and Archivo,
  motion utilities that all switch off under reduced motion.
- **Admin Data page.** Drop JSON files or a folder, sync a GitHub data repository, or copy files into
  `storage/data/`. New data goes live; replacements are staged for review; mistakes are shown in plain words.
  Format guide: `docs/DATA_FORMATS.md`.
- **Admin menu by module.** Today, Data, People, Community, Advanced. Simple mode shows a short menu and an
  Advanced hub; Pro mode lists every page.
- **Chats and Feed.** Group and one-to-one chats (blocks, DM-off, reactions, reports, rate limits), live over
  server-sent events with a polling fallback. A feed of round-day posts and community questions. Phone tabs are
  Home, Lists, Chances, Chats, Me.
- **Me.** Left rail, seat-flow graph and a journey timeline.
- **Access requests (optional paywall).** While on, sign-in needs an approved request; payment is checked by hand
  (`/admin/access`). Off by default.
- **Launch basics.** `/privacy`, `/terms`, `/contact`; download or delete your own data at `/portal/account`.

## Database

Migrations `0021_data_folder`, `0022_chats`, `0023_access_requests`. The NAS update takes a backup first. All three
only add tables and one column (`users.dm_open`, default true).

## Checked

`tsc` clean, eslint 0 errors, 257 unit tests pass, `next build` succeeds, authorization matrix updated.

## Not checked (please do before merging)

- **No database was available while building.** The integration tests (`tests/datastore.integration.test.ts`,
  and the other suites that need `TEST_DATABASE_URL`) were not run; there are no integration tests yet for chats,
  access requests or account deletion.
- **No browser walkthrough** of the new pages, and no screenshots.
- The legal text on `/privacy` and `/terms` is a plain-language draft; have someone qualified read it.

## Not in this PR

Auto-approval of payments (approval stays manual), a moderator screen for reported chat messages, the feed's own
posts and reactions, the count-up number effect, schedule and joining-status file import.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
