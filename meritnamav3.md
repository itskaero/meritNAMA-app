# meritNAMA v3: easy data, modular admin, dark animated UI, social (feed + chats)

## Context
The user finds the current admin and data import too complex. On the old site, adding data meant
placing a JSON file in the repo, and Claude could edit those files easily. Today, data goes through
11 admin sections, staged changes and a folder on the server that is not visible in the UI. The user
wants four things:
1. A simple, modular admin, based on what the old admin had.
2. A dark theme with some animation. Use the 8 reference images and the brand assets we already
   generated. The user also named the "brawlistan" and "antibiome" apps as inspiration.
3. A socially engaging site, mixing Facebook (a feed) and WhatsApp (chats).
4. Mockups (artifacts) before any code.

The candidate workspace idea is liked and stays.

## What exists (from the two explorations)

**Old admin:** one page with 18 tabs, all backed by Firestore.
- Overview with who is online.
- 4 log tabs.
- Warnings and inbox requests.
- Access approvals.
- Contributions, mentorship and profiles moderation.
- Broadcast: schedule, pinned chat announcement, toggles (simulation mode, active consent round,
  joining status).
- Config for the marks formula.
- Homepage text and stats.
- Editorial.
- Jobs sync.
- Candidates, with a JSON upload of revisions.

How data got in: JSON committed to `data/` and `inductions/<n>/…`, which the frontend read directly.

**Old social:** Firestore.
- Live chat with 10 fixed rooms, reactions, replies, @mentions, photos, pins, typing indicators and
  presence. No direct messages.
- A feed (`social_posts`) with 4 post types, likes and comments.

**New admin:**
- Navigation: 11 sections in `adminSections` (`src/lib/navigation.ts`).
- Import (`src/lib/data/inbox.ts`): `INBOX_KINDS` (merit, seats, policy, reference), `listInbox`,
  `importFromInbox`, `importAllFromInbox`. Replacements are staged through `changes.ts`.
- Inbox UI: a card on `src/app/admin/inductions/page.tsx`.
- Feature flags (`src/lib/data/settings.ts`): `loadFeatures`, `featureFlags`, `assertFeature`.
  Keys: community, calculator, planner, simulation. Candidate-facing only.

**New social:**
- `rooms.ts`: per-round chat, polled every 8 s by `round-room.tsx`.
- `community.ts`: threads, polls, votes, reports.
- `social.ts`: reputation and peer counts.
- `notifications.ts`.

**Design:**
- Tokens in `src/styles/tokens.css`. Light is the default; dark applies under `[data-theme="dark"]`.
- Images listed in `src/components/brand-assets.ts`.
- A Simple/Pro interface mode already exists (`UI_MODE_COOKIE`).

## Decisions (from the user)
- **Chats:** group rooms plus 1:1 direct messages. A DM can be reported, users can block someone,
  and each user can turn DMs off.
- **Publishing:** a brand-new dataset goes live as soon as it is dropped. A file that replaces
  existing data shows its changes and needs one click.
- **Style:** based on the 8 reference images only. "brawlistan" and "antibiome" are not used.

## Step 0: mockup artifacts, before any code
Publish **one artifact, "meritNAMA v3 mockups"**, as a static HTML page with tabs:
1. **Look & feel:** palette, type, glow cards, dotted-grid background, motion samples, and how the
   brand images sit on dark.
2. **Candidate workspace:** home and workspace on desktop and phone.
3. **Social:** Feed (Facebook-like) and Chats (WhatsApp-like), on desktop and phone.
4. **Admin:** Today, Data drop (drag in JSON → a plain checklist → Publish), the module switchboard.
5. **Sign-in:** a split panel with 3 steps, after reference image 8.

The user reviews it and comments. Only then do the phases below start.

## Design direction (dark by default, light kept as an option)
- **Surfaces:** near-black canvas `#0A0A0D`; layered surfaces `#121216`, `#18181D`, `#202027`;
  hairline borders at white/8%.
- **Accents** (from the references):
  - violet glow `#7C5CFF`: primary actions and the hero, after image 1;
  - teal `#2DD4BF`: "safe", "now" and success, after image 2;
  - ember `#FF6A3D`: brand marks and hero light, after image 4;
  - amber `#F5B94A`: estimates and borderline.

  Every pair is checked for contrast in `tests/tokens.test.ts`.
- **Components**, each mapped to a reference image:
  - glow stat cards (1);
  - induction **timeline/gantt** of round dates, with a "Now" marker (2);
  - **seat-flow node graph**: preference, then seat, then who moved (3);
  - **status-row tables** for merit lists, with pills and bar gauges (5);
  - **vertical journey timeline**: my rounds, consent and notices (6);
  - **chat-app layout**: left list, right conversation (7);
  - split sign-in with steps (8).
- **Motion:** reveal on scroll, glow on hover, numbers that count up, a soft gradient that moves in
  the hero, and a "live" pulse. All of it switches off under `prefers-reduced-motion`.
- **Images:** keep the generated assets, with dark duotone overlays and gradient masks.
  `texture-contour-navy` becomes the default section texture.
- **Files:**
  - `src/styles/tokens.css`: new dark values, with dark becoming the default theme in
    `src/lib/ui-mode.ts`.
  - `globals.css`: utilities (`.mn-glow`, `.mn-grid-dots`, `.mn-count`).
  - `src/components/ui/*`: card, badge and table variants.

## How JSON data should work (study and proposal)

### What I found
**Old site.** The repository was the database.
- Files went into `data/` and `inductions/<n>/{merit,gazette}/`. The browser fetched them directly,
  so committing a file published it.
- Editing a file with Claude was easy for two reasons: the format was plain, and the repository was
  the only copy.
- About 50 files of three sorts:
  - **raw portal exports**, PHF's API shape `{Table, Table1, …}`: merit rounds, gazette;
  - **flat lists**: `induction21_consent_roundN`, `_seats`, `_candidates`, `_components`,
    `_certificates`, `_joining_status`, `_schedule`;
  - **derived files** made by `process_data.py`: `closing_merit`, `trends`, `flat_lookup`,
    `normalized_merit`, `specialty_ranking`, `policy_impact`, `sim_merit_cascade*`.
- Several files carry personal data: consent has names; joining status has names, PMDC numbers and
  emails.

**New app, today.** Data comes in by **three separate routes**, each with its own rules:
1. **The inbox** (`src/lib/data/inbox.ts`):
   - four subfolders (`merit/`, `seats/`, `policy/`, `reference/`), each with strict name patterns;
   - files move to `processed/` after import;
   - the UI is a card on the Inductions page.
2. **A simulation folder** (`storage/simulation/induction<n>/`, `ROLES` in
   `src/lib/data/simulation.ts`) for marks, preferences, candidates, gazette, components,
   certificates and profile status.
3. **About 8 upload forms** spread over Inductions, Seats, Policies, Rules, Candidates and Changes.

Other problems:
- Consent, schedule and joining status have no route at all.
- Old flat names (`induction21_merit_round3.json`) don't match the patterns.
- Files disappear into `processed/`, so the folder is no longer a copy you can edit.

That is why it feels complex. You have to know which folder, which name and which page.

### Proposal: one data folder that mirrors the old repo, and the app follows it
1. **One folder, the old layout.** `APP_STORAGE_DIR/data/` is laid out exactly like the old
   repository:
   - `inductions/<n>/merit/round_<r>.json`
   - `inductions/<n>/gazette/gazette_<n>.json`
   - `inductions/<n>/consent/round_<r>.json`
   - `inductions/<n>/seats.json`, `schedule.json`, `candidates.json`, `components.json`,
     `certificates.json`, `joining_status.json`
   - `scoring_policy.json`, `disciplineFullData.json`, `cpsp_accreditation.json`

   Old flat names are accepted too. A name map translates `induction21_merit_round3.json` to merit,
   induction 21, round 3. If a name is unknown, the app works out the kind and induction from the
   file's contents (its keys, the `Table…` shape, an `induction` field).
2. **Files stay where they are.** Nothing moves to `processed/`.
   - A new table `data_files` records, per file: path, kind, induction, round, sha256, status, rows,
     message and `imported_at`.
   - The worker tick scans every minute and acts by hash:
     - **new file:** validated and live at once;
     - **changed file:** a one-click "replaces: 32 changes" card with a diff;
     - **unchanged:** ignored;
     - **file removed:** data kept, with a note "no longer in the folder".

   The folder becomes the truth again, as on the old site.
3. **Three ways to put files there.** All of them end in the same folder and the same list:
   - **Drop in the browser:** drag files or a whole folder onto Admin → Data.
   - **Sync from GitHub:** a button, plus an optional schedule, that pulls a data repository you
     choose (owner/repo/branch, with a token if private). You edit that repository with Claude Code
     as before, commit, and it appears.
   - **NAS:** copy files into `/DATA/meritnama/var/storage/data` with File Station or a network
     share.
4. **Made for editing with Claude:**
   - `docs/DATA_FORMATS.md` gives each kind its file name, fields, a small example and rules.
   - JSON Schemas are served at `/admin/data/schemas/<kind>.json`, so Claude can write valid files.
   - **Download** on every dataset exports the same format, so download → edit → drop back loses
     nothing.
   - Validation messages are in plain words, for example "row 214: marks '21.3x' is not a number".
     A file is applied whole or not at all.
5. **Derived files are not imported.** Closing merit, trends, the lookup and cascades are worked out
   by the app. Old derived files are listed as "worked out by meritNAMA, not needed" and ignored.
6. **Personal data:**
   - Raw files stay on the NAS disk only.
   - The importer keeps engine fields only: applicant ID, marks, preferences, consent, seat. Names,
     PMDC numbers, emails, phones and CNICs are dropped as each file is read, as
     `sanitizeSimDataset` does today.
   - The synced data repository should be **private**. The current public repository exposes
     personal data.
7. **Simulation from the same folder:** when induction *n* has a gazette, candidates and
   preferences, the Data page shows "Ready to estimate round 1" with one button, then **Publish
   estimate**. The separate simulation upload goes away.

### Kinds (old file → new kind → where it shows)
| Old file | Kind | Used for |
|---|---|---|
| `inductions/<n>/merit/round_<r>.json`, `induction<n>_merit_round<r>.json` | merit round | Merit lists, closing merit, Find yourself |
| `induction<n>_consent_round<r>.json` | consent | Consent column, what-if base |
| `inductions/<n>/gazette/gazette_<n>.json` | gazette | Seat counts, estimate input |
| `induction<n>_seats.json` | seats | Hospitals, seat matrix |
| `induction<n>_schedule.json` | schedule | Induction timeline, Home |
| `induction<n>_joining_status.json` | joining | Joining status (new, IDs only) |
| `induction<n>_candidates`, `_components`, `_certificates`, `ProfileStatus` | sim inputs | Estimates |
| `scoring_policy.json` | policy | Calculator (a change waits for one click) |
| `disciplineFullData`, `cpsp_accreditation`, `_specialty_groups` | reference | Hospital pages |
| `closing_merit`, `trends`, `flat_lookup`, … | derived | Ignored (worked out by the app) |

### Code
- **New `src/lib/data/datastore.ts`:**
  - `scanDataFolder`, `classifyFile` (name map, then content sniffing), `applyFile`, `pendingChanges`.
  - It reuses the existing appliers: `proposeMeritRound`, `proposeSeatFile`, `proposePolicyFile`
    (`changes.ts`), `saveReferenceDocument`, and the simulation import in `simulation.ts`.
  - It adds appliers for consent, schedule and joining.
- **New `src/lib/data/sync.ts`:** a GitHub tarball pull, ported from `scripts/get.sh` and
  `fetch-public-data.sh`.
- **Migration 0021:** `data_files`.
- **Moving the old inbox:** the old `inbox/` folders become aliases. Files in them are moved into
  `data/` once.

## Data page: "drop the JSON, done"
A new admin page **Data** (`/admin/data`) replaces the hidden inbox and the import cards.
- **Drop zone:**
  - Drag in any number of `.json` files, or a whole folder.
  - The kind is detected from the file name and contents, reusing `INBOX_KINDS` and the zod schemas.
  - Add kinds for gazette, candidates, consent and schedule; they already exist as simulation inputs.
- **Plain checklist**, one line per file, for example:
  - "Round 8 merit list, induction 21 · new · 1,219 rows"
  - "Seats, induction 22 · replaces current · 32 changes"

  It ends with one **Publish** button. Replacements show what changes before publishing; there is no
  separate Changes page in Simple mode.
- **Sync from GitHub:** a button that pulls the public data repo. This is the UI version of
  `fetch-data`, done server-side in Node instead of shell, and it lands the files in the same
  checklist.
- **Auto-publish:** on by default. New data dropped in the UI, or placed in the inbox folder (the
  worker tick picks it up), goes live at once. Replacements wait for one click. This matches the old
  behaviour of "place the file and it is live".
- **Edit with Claude:** each dataset has **Download JSON** and **Replace with edited JSON**, so the
  round trip is download, edit with Claude, drop it back. There is also a small in-browser JSON
  editor with validation, for quick fixes.
- **Reuse:** `listInbox`, `importFromInbox`, `importAllFromInbox`, `changes.ts` propose/publish, and
  `scripts/fetch-public-data.sh` (the source list is ported to `src/lib/data/sync.ts`).

## Admin restructure: modules
A module registry (`src/lib/admin/modules.ts`) gives each module an id, a label, an icon, pages, a
capability, a `simple` flag and an on/off switch. The switches are stored with `setFeatures`, which
is extended with admin keys. The 11 sections become **6 modules**:

| Module | Contains (old site / current) | Simple mode |
|---|---|---|
| **Today** | Overview: what needs attention, files waiting, reports, who's online | ✓ |
| **Data** | Drop, sync, merit lists, seats, gazette, publish an estimate, downloads | ✓ |
| **People** | Candidates, verification requests, team & roles | ✓ |
| **Community** | Moderation, reports, pinned announcements, broadcast, room management | ✓ |
| **Content** | Homepage text, induction schedule, editorial, jobs (later) | ✓ |
| **Advanced** | Scoring policies, allocation rules, processing runs, changes, audit | Pro only |

Settings (modules on/off, email, backups) sits in the account menu.

To keep the Simple admin to 5 items, Pro mode shows everything, reusing the existing
`UI_MODE_COOKIE`. Routes stay where they are (`/admin/policies` and the rest still work); only the
navigation groups them.

## Social: Feed + Chats (Facebook × WhatsApp)
- **Feed** (`/portal/feed`): the new Home timeline for signed-in users.
  - Post types: Question, Result update ("got Radiology, Mayo, R3"), Hospital review, Tip, Poll.
  - Reactions (👍 ❤️ 🙏 😮), comments one level deep, share-to-chat, and filters for my programme
    and my speciality.
  - Automatic system posts: "Round 8 is out", "Estimate published".
  - Reuses the `community.ts` threads, polls, votes and reports. `post_type` and reactions are added.
- **Chats** (`/portal/chats`), a WhatsApp-style layout:
  - The left list shows group rooms (General, the FCPS, MS/MD and Dental programme rooms, each
    round's room, and hospital rooms that are joined by following the hospital) and, if approved,
    direct messages (`chat_rooms.kind = 'dm'`, two members, with a block list and a DM-off
    preference in `socialPrefs`).
  - The right pane shows bubbles, replies and quotes, reactions, @mentions, pinned messages, image
    attachments (≤ 1 MB, stored under `APP_STORAGE_DIR`), and read and unread counts.
  - Typing and online indicators are optional.
  - Round rooms (`rooms.ts`) are generalised into `chat_rooms`, `chat_members` and `chat_messages`
    (`seq`), plus `chat_reactions`. Existing round-room messages are migrated.
  - **Live updates:** an SSE endpoint `/api/chats/stream`, which works through the Cloudflare tunnel.
    If SSE is unavailable, the current polling is used.
  - Moderation, reports and retention stay as they are. Users post under their display name with the
    Verified badge; real names come only from what users type.
- **Phone tabs** become Home · Lists · Chances · **Chats** · Me. What if moves into Lists, and Feed
  is Home.

## Candidate workspace (kept, upgraded)
`/portal/workspace` becomes **Me**, in a chat-app-like layout (image 7). The left rail has My
record, Shortlist, Preference list, Notes, Followed and Alerts. The main area has:
- my seat as a glow card;
- my journey timeline (image 6): rounds, consent, notices;
- my shortlist with chance dials.

Reuses `workspace.ts`, `finder.ts` and `notifications.ts`.

## Phases (each one committed separately and verified)
1. Mockup artifact. Then wait for feedback.
2. Dark tokens, motion utilities, component variants, images re-styled; the landing page and
   sign-in restyled.
3. Admin modules plus the **Data** page: drop, checklist, publish, sync, auto-publish, download and
   replace.
4. Chats: schema, migration, SSE, UI. Then Feed: post types, reactions, system posts.
5. Workspace "Me", journey timeline, induction gantt, seat-flow graph.
6. Docs (`docs/IA.md`, `DESIGN.md`, `NAS-SETUP.md`: "how to add data"), the PR body.

## Progress (updated 9 Nov 2026; branch feat/v3-data-folder)

The first sandbox session lost its uncommitted work, so phases 2 and 3 were rebuilt from this plan
and committed in pieces.

**Done and committed**
- Step 0: the mockup canvas ("meritNAMA v3 mockups", ten screens; source readable as an artifact).
- Phase 2, dark by default (`f39f4b8`): v3 dark tokens, `--mn-action*` and `--mn-glow*`, Plus Jakarta
  Sans and Archivo, utilities (`.mn-dots`, `.mn-glow`, `.mn-aurora`, `.mn-lift`, `.mn-pop-in`), primary
  buttons on `bg-action`, landing bands follow the theme. The action violet is #7557F8 (white text on the
  mockup's #7C5CFF is 4.35:1, under AA). Not done: the count-up number effect.
- Phase 3, data folder:
  - `src/lib/domain/data-files.ts`: classifier by path and by contents; derived and unsupported files are skipped.
  - `data_files` table, migration `0021_data_folder.sql`.
  - `src/lib/data/datastore.ts`: scan, validate in plain words, apply through the existing proposals
    (new = live, replacement = staged), estimate inputs copied to `storage/simulation/`, download, remove.
  - `src/lib/data/sync.ts`: GitHub tree sync (optional `GITHUB_TOKEN`), hourly from the worker tick.
  - `/admin/data` page, upload and download routes, `docs/DATA_FORMATS.md`.
  - Authorization matrix: rescans, uploads and raw downloads are data editors only.
- Admin menu by module (`6d1dce0`): Today, Data, People, Community, Advanced. Simple mode shows a short menu with an
  Advanced hub (`/admin/advanced`); Pro mode lists every page.
- Phase 4, chats (group and one-to-one; round rooms stay as they were and are not migrated):
  - Tables `chat_rooms`, `chat_members`, `chat_messages` (with `seq`), `chat_reactions`, `chat_blocks`, `chat_reports`, and
    `users.dm_open` (migration `0022_chats.sql`).
  - `src/lib/domain/chats.ts` (pure rules and limits) and `src/lib/data/chats.ts`: list, read after a seq, post, react,
    start a DM (blocks and DM-off respected, a blocked person is never told), join/leave, mute, block, report
    (3 reporters hide a message), moderator hide.
  - SSE `/api/chats/stream` (reconnects every 55 s, polling fallback), `/portal/chats` and `/portal/chats/[id]`.
- Tests: 241 unit tests pass (chat rules included); `tests/datastore.integration.test.ts` is written but not yet run
  (needs `TEST_DATABASE_URL`). No chat integration test yet.

**Not done:** schedule and joining-status files (recognised, not imported); a browser walkthrough of `/admin/data`
and `/portal/chats` (no database was available); a moderator screen for reported chat messages; a Feed that
has its own posts and reactions (today it only reads questions and round-day posts).

- Feed (`/portal/feed`, `src/lib/data/feed.ts`): questions, answers and round-day posts, newest first, with a filter.
  Phone tabs are now Home · Lists · Chances · Chats · Me, with an unread badge on Chats.

- Phase 5, Me (`/portal/workspace`, now the Me phone tab): left rail, "My seat" glow card with the seat-flow graph
  (preference → seat → how close), and a journey timeline of rounds, consent and notices (`src/lib/domain/journey.ts`,
  `src/components/me/`). The induction gantt already existed as `charts/timeline.tsx` (with a Now marker).

**Next:** phase 6 (docs: IA.md, DESIGN.md, NAS-SETUP.md; PR body; screenshots).

## Remaining, in order
1. **Admin Data page** (done):
   - `src/app/admin/data/page.tsx`:
     - drop zone: a client component that POSTs each file, folders included, to the upload
       route, then calls a scan action;
     - the plain checklist, with a status pill and Apply / Review / Download / Remove for each
       file;
     - per-induction cards for what is held;
     - settings: auto-publish, repository and branch;
     - Sync now; Publish all; a link to `docs/DATA_FORMATS.md`.
   - `actions.ts` with: `scanDataAction`, `applyDataFileAction`, `applyAllDataAction`,
     `removeDataFileAction`, `syncDataAction` (run with `after()`) and `saveDataSettingsAction`.
2. **Worker:**
   - `api/internal/tick` calls `autoImportDataFolder`.
   - `scripts/fetch-public-data.sh` writes into `data/` rather than `inbox/`.
   - `listInbox` and the Inductions inbox card point to Data.
3. **Admin modules:**
   - Regroup `adminSections` into Today (Overview), Data, People (Candidates, plus Team &
     roles), Community, Content (reference data and the schedule) and Advanced (policies,
     rules, processing, changes, audit).
   - Advanced is hidden in Simple mode.
   - `match` arrays keep the old routes highlighted.
   - The overview tile counts the data folder.
4. **Authz matrix:**
   - Add the new datastore and sync functions. `autoImportDataFolder` goes in the no-session
     list.
   - Regenerate the fixture.
   - Unit tests: `classifyByPath` and `classifyByContents` on every old file name; scan,
     auto-apply and the replacement-pending case against Postgres in a temporary folder.
5. **Phase 4: Chats and Feed:**
   - Tables `chat_rooms` (kind: group, round, dm), `chat_members`, `chat_messages` (with
     `seq`), `chat_reactions` and `chat_blocks`. Round-room messages are migrated.
   - `src/lib/data/chats.ts`: list rooms, messages after a `seq`, post, react, start a DM
     (blocks and the DM-off preference are respected), report.
   - SSE route `api/chats/stream`, with polling as the fallback.
   - Pages: `/portal/chats` and `/portal/chats/[id]`.
   - Feed `/portal/feed`, built on `community.ts` threads with a post type, reactions, and
     system posts on round day.
   - Navigation: the phone tabs become Home · Lists · Chances · Chats · Me.
6. **Phase 5:** the Me workspace layout and the journey timeline component.
7. **Phase 6:**
   - Docs: `DATA_FORMATS.md`, `NAS-SETUP.md` ("how to add data"), `IA.md` and `DESIGN.md`.
   - Run the full checks.
   - Commit each phase and push to `ccr-3e305929-39xqcm`.
   - Update the PR #1 body.
   - Send screenshots.

## Verification
- `vitest` (full suite against Postgres). New tests:
  - detecting the file kind,
  - publishing from the checklist,
  - auto-publish from the worker,
  - chat permissions, rate limit and reactions,
  - the SSE auth,
  - the module switches.

  The authz matrix fixture is regenerated.
- `tsc`, lint, `next build`, and the CSP check (needs `connect-src` for SSE).
- axe-core, dark and light, desktop and phone, on every changed page. Token contrast tests.
- Playwright walkthroughs:
  - drop 3 JSON files, then Publish, then see the list on the portal;
  - two browser contexts chatting live;
  - a feed post getting a reaction.
- Screenshots sent to the user after each phase.