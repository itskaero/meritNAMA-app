# meritNAMA v4: redesign build — handoff and progress

Read this first if you are picking the work up in a new session or another account.
Last updated: 2026-11-13. Branch: **`meritnamav4`** (cut from `feat/v3-data-folder` at `3e0e068`).

## 1. Where things are

| What | Where |
|---|---|
| Approved mockups (source) | `docs/mockups/v4/*.dc.html` + `canvas.json` (Design-canvas format; open in a browser only through the canvas) |
| Mockups, live | claude.ai artifact `https://claude.ai/artifact/46ZMTHW9iWtu6xrradqP9e` (private to the owner's account; other accounts see the files in the repo instead) |
| Images and video | `docs/mockups/v4/assets/` (move into `public/` when building) |
| Approved plan (page map, decisions) | section 4 below; original plan file was `~/.claude/plans/nifty-launching-willow.md` (local only) |
| v3 history | `meritnamav3.md`, `docs/PR-v3.md` |
| Ingest service (another session's work, not committed by us) | `ingest/`, `docs/INGEST.md` — do not commit or edit unless asked |

## 2. Status at hand-off

- v3 is built and running on the NAS (see section 7). Last commits: `bc7960b` (round chips, candidates per round), `827121f` (re-link merit rows to hospitals/specialities). **`bc7960b` and `827121f` are committed locally, not pushed.**
- NAS data was fixed by hand: 63,215 / 63,303 allocations linked to hospitals, 63,012 to specialities (unlinked: Faisalabad Institute of Cardiology, Isfandyar Bukhari/DHQ Attock, Endocrinology, Family Medicine, Gastroenterology).
- The 2027 scoring policy (induction 22, PGET pass/fail = 75) is staged on the NAS at `var/storage/data/scoring_policy.json`; owner must publish it on Admin → Data, then set it active when induction 22 opens.
- Mockups approved by the user ("I like it. Now build it."). **Nothing of v4 is built yet.**

## 3. Design language (v4)

- **Ground:** charcoal `#0C0C0E`; cards `rgba(23,23,28,.82)` with `1px rgba(255,255,255,.07)` border, radius 20 (cards) / 12 (controls) / 99 (pills).
- **Every page:** soft violet aurora behind content (`.pg::before/::after`: `rgba(123,97,255,.30)` top-right, `rgba(91,63,245,.22)` bottom-left, blur 100px, 30–36 s drift).
- **Page headers:** navy aurora container exactly as the user supplied (`#10243A` base, teal `#176B67` 42%, slate `#263C4D` 65%, amber `#E5A04B` 12%, blur 110px, drift 24–34 s) plus one faint violet blob. Ivory text `#F3EEE5`.
- **Accent:** violet only. Active nav item and every primary button = dark fill with a gradient to `rgba(110,86,255,.42)` on the right, `1px rgba(155,135,255,.6)` outline, `inset -3px 0 0 #7B61FF` edge bar, `0 0 20px rgba(110,86,255,.3)` glow; brighter on hover. No solid violet fills anywhere.
- **Follow button:** GitHub split style (icon · label | count) with a pulsing neon violet edge; Shortlist is the same shape, amber glow on hover.
- **Data colours only:** green `#3DDC97` safe/fell/accepted/placed · amber `#E5A04B` target/estimate/waiting/pending · coral `#FF7A7A` reach/rose/rejected/fell short · cyan `#5CE1E6` information/amendment.
- **Type:** Inter everywhere; IBM Plex Mono only for applicant ID, PMDC no. and marks in tables.
- **Infographic kit:** tick meter, ring, segmented arc, stacked bar, round blocks, glowing area/line charts that draw in, orbit (preferences), timeline with a "now" line, ticker strip.
- **Motion:** card rise + hover lift, button sheen (faint), live blinking dots, lines that draw in. Everything off under `prefers-reduced-motion` (video replaced by its still image).
- **Sidebar:** Workly style (collapse button, search ⌘K, grey line icons, groups: main / Mine, round-6 estimate card, user card with ID and PMDC), slightly translucent.

## 4. Page map (what lives where)

| Page | Contents |
|---|---|
| Overview (rounds running) | Header with the Gemini video background (`overview-bg.mp4`, poster `hero-cycle.jpg`): greeting, marks, percentile, Analyze button; cards standing (tick meter), chances (safe/target/reach sparklines), your seat (round blocks + consent countdown); median closing area chart; round-6 readiness arc; preferences orbit; "This cycle" timeline |
| Overview (new induction announced) | `Overview22`: running-induction strip, video hero (what changed, countdown, Can I apply?), cycle stepper, what changed (old vs new scoring bars), eligibility checklist, your marks under the new policy, induction news, people are asking. Overview switches by cycle stage: announced → applications/PGET → gazette out → rounds → closed |
| Merit lists | Aurora header + find anyone; ticker of moves; 3 highlight cards; inductions table with round chips; searched right now; round numbers bar |
| Round | Header with ring and KPIs; candidates table (avatar, name, ID · PMDC, marks, seat, consent, vs previous round); candidate side panel with every round and all preferences |
| Candidates (gazette) | **New-site data model, not the old site's:** sources strip (gazette PHF report 901 · same all cycle; verification steps Round 01 / Amendment Process bars; corrections layered on top, original kept; your rank). Columns grouped "Gazette and verification · same all cycle" vs "Round N · changes each round". Badges `R01 ✓/✕/◷ → Amend ✓/✕/◷` with PHF remarks; "corrected" pill with "PHF: x". Filters: tabs All / In the running / Out of the running / Corrected; programme, quota, Round 01 status, Amendment status, seat-from-round; quick chips (Rescued by amendment, Rejected at both, Still pending, Marks corrected, 2+ programmes, No preferences). Marks shown: with corrections / as published. Side panel: Record timeline + all preferences (Placed / Fell short / Skipped) |
| Estimates | Dashed amber "Estimate · not official" header; consent-replies tick meter with refresh time; seats re-offered, likely to move, you in this estimate; closing ranges (round-5 marker + animated amber band, change, confidence); **applicant result panel as in the old simulation**: track card "FCPS · Punjab placement · Placed at preference #n", rows Pref / Seat (filled/seats) / Cutoff / Margin ("Clears +x", "Short x", "Would clear +x", "Would be short x") / Status (Placed, Fell short, Clears cutoff, Skipped, No seats), note about one seat per track. No probabilities |
| My chances | Inputs inside the aurora; percentile card; Safe/Target/Reach selector with sparklines; "you vs final" bars; searching counts; compare tray (3); "people with similar marks shortlisted" (counts only) |
| Hospital | Photo banner (`night-ward.jpg`), viewing now, round room live, rating, follower avatars, GitHub-style Follow/Shortlist; ticker; seats-filled tick meter, applicants/seat ring, trend, for-your-marks bar; speciality table with fill bars and trends; got in this round, review scores, also-followed |
| Calendar | Countdown header; month grid with glowing events; what's coming |
| Chats | Three panes; glowing active room, unread badges, online dots, pinned deadline, typing indicator, member panel (block/report/mute) |
| Community | Banner (`library-group.jpg`), tabs Feed / Questions / Members / Round room, info panel |
| Me | Aurora profile, journey timeline with now line, Today, shortlist with fill bars, following, saved views, activity |
| Sign in | Photo panel (`night-study.jpg`) + glass form; Sign in / Request access tabs |
| Phone | Aurora top, floating tab bar with glowing active tab |
| Jobs (members) | Aurora header (open count, last/next sync, sources); **folder row** in the glass-folder reference style (PPSC · Teaching hospitals (SHC&ME) · DHQ/THQ (P&SHD) · Federal & forces · Private & NGOs · Closing this week · Saved; "+" follows a folder); status tabs Open / Closing this week / New / Closed; filters post type, city, source (official only), apply online; **job cards** in the dark-card reference style (photo band, big headline, glowing "Apply by" pill, amber when ≤ 7 days, footer "City ✦ grade ✦ posts", Official or "via jobz.pk" badge, save star); detail drawer (posts, grade, advert no., last date, who can apply, specialities, hospitals you follow, Open advert ↗, source and checked time, "not affiliated") |
| Public landing `/` | masterpay structure with site assets: framed hero (Gemini video, headline "Know where you stand…", glowing merit card), 01–04 features with photo, "Much more than a merit list" (estimate card over spinning rings), stats band (63K+ allocations, 60 rounds, 13 inductions, open jobs), 3 latest jobs (teaser), FAQ accordion, violet "Let's talk" contact block + community/email cards, footer |

## 5. Decisions made by the user

- Icons, not emoji (coloured or line icons).
- **Show names and PMDC numbers** with applicant IDs; search by any. Email, phone and CNIC stay dropped.
- Candidate preferences from the portal are a headline feature (side panels on Round, Candidates, Estimates).
- The gazette is fixed for the cycle; merit lists and consent change each round.
- Cross-scheme comparison: chance dial and percent primary, raw marks secondary, plus the warning. Same scheme: raw marks primary.
- Payments stay manual (paywall approval by hand).
- Donate is left out. **Jobs is in** (decided 2026-11-13): automated; sources jobz.pk + official SHC&ME / P&SHD / PPSC pages (official badged); members only with a teaser on the public landing; doctors-only posts.
- **Logo: Direction 1, version B (rank point), animated** (chosen 2026-11-13). Mark = two arches of m + third leg falling from a closed loop (the head and tail of Urdu م); dot ABOVE the loop (never below: reads as پ). Path (viewBox 0 0 110 106, stroke 11, round caps): `M14 90 V44 a13 13 0 0 1 26 0 V90 M40 44 a13 13 0 0 1 26 0 a14 14 0 1 1 28 0 a14 14 0 1 1 -28 0 V98`, dot `circle cx=80 cy=12 r=6.5`. Compact for icon/favicon: stroke 14, `M16 88 V46 a12 12 0 0 1 24 0 V88 M40 46 a12 12 0 0 1 24 0 a15 15 0 1 1 30 0 a15 15 0 1 1 -30 0 V92`. Wordmarks: Inter (merit 400 + NAMA 700) / میرٹ نامہ in Noto Nastaliq Urdu; tagline جانیں آپ کہاں کھڑے ہیں. Motion (docs/mockups/v4/LogoAnim.dc.html): intro = stroke draws (pathLength 1, dashoffset 1→0, ~1.7 s) then the dot drops in with a bounce and a ping ring; idle = dot breathes + ping every 2.4 s; hover lifts the dot; loader = a dash running along the path; still under reduced motion, in the favicon, app icon and emails. Urdu spelling to be checked by a fluent reader; final SVG strokes outlined.
- Public landing is rebuilt in the masterpay structure with the site's own assets (video, photos, aurora, merit card).
- Counts like "viewing now" / "searching" / "shortlisted by" show counts only, never who (proposed; confirm if challenged).

## 6. Build steps and progress

Tick as you go; commit after each step; push only when the user asks.

- [x] **1a Names/PMDC** (code done on branch `meritnamav4`; NAS backfill pending: after deploy run `node scripts/backfill-merit-names.mjs /app/storage` in the migrate container, it updates rows by (round,rowNo) with no notifications; do NOT re-import rounds, that notifies followers): migration adding `name`, `pmdc_no` to `merit_allocations`; keep them in `importMeritRound` (`src/lib/data/merit.ts`, source fields `Table5.name`, `Table5.pmdcNo`); extend `roundCandidates` search to name/PMDC; update `/privacy`, `exportMyData`/`deleteMyAccount` wording. Re-import the 60 rounds on the NAS from `var/storage/inbox/processed/*merit*` after a backup.
- [x] **1b Verification steps** (sim_candidates.verification = [{type,label,status,remarks}], effective status unchanged): import `ProfileStatus.json` v2 (statusTypes 131 "Verification : Round 01", 132 "Amendment Process"; statusIds 1 Accepted, 2 Rejected, 11 Pending; remarks) per candidate and step. Today only `sim_candidates.profile_status` (single int) exists.
- [x] **1c Correction reasons** (candidate_corrections.kind grievance|amendment|admin; CSV optional `kind` column): add a type (grievance / amendment / admin) to `candidate_corrections`; ingest revision overlays (`ingest/linkage/revisions.py`) map to it.
- [x] **1d Gazette names** (sim_candidates.name/pmdc_no from gazette `nameFull`/`name` + `pmdcNo`; contactNumber/cnic never read): gazette rows carry names; store name/PMDC for candidates too.
- [x] **1e Activity counters** (`src/lib/data/activity.ts`: recordView/viewingNow (5-min window), recordSearch/topSearches (24 h, hourly buckets), counts < 3 hidden, pruned by the daily retention run; "similar marks shortlisted" reuses `peerInterest` in `src/lib/data/social.ts`, which honours the peerCounted opt-out; pages wire them in step 3): lightweight counts for viewing/searching/shortlisted (no per-person data).
- [x] **1f Estimate result rows** (`estimateApplicantResult` in `src/lib/data/simulation.ts` + pure `src/lib/domain/applicant-result.ts`: per programme, each preference placed / fell short / clears cutoff / skipped / no seats, cutoff, filled, delta, legacy margin text; visible wherever the estimate is): expose per-candidate preference history from a sim run (seat, cutoff, margin, status) for the Estimates panel.
- [x] **1g Jobs (automated), data layer:** migration `0027_jobs` (`jobs`, `job_sources`, `job_saves`, notification kind `new_job`). Parsers `src/lib/jobs/parse.ts` (jobz.pk list `medical-employment/`, `-2/`, `-3/` + detail; SHC&ME `health.punjab.gov.pk/Jobs.aspx`; P&SHD `pshealthpunjab.gov.pk/Home/Jobs`; PPSC `ppsc.gop.pk/Jobs.aspx`), rules `src/lib/jobs/rules.ts` (doctors only, folders, post types, dedupe/merge official-first, open/closing/closed in PKT), fixtures `tests/fixtures/jobs/`. `src/lib/data/jobs.ts`: `syncJobs` (1 req/s, details only for new jobz ids ≤ 40/run, PDFs never fetched, PPSC robots disallows PDFs), `jobsSyncIfDue` in the tick (6 h, `app_settings.jobs_sync`), `syncJobsNow`, `listJobs`, `jobTeaser` (public), `setJobSaved`, `jobSourceHealth`, `setJobFlags`, `addManualJob`; hospital match by `nameKey` → `notifyFollowers` (`new_job`); closed > 60 days removed unless pinned; saved jobs in export, deleted with the account (cascade). Pages (portal Jobs, Admin → Data → Jobs, hospital card, landing teaser) are in step 3.
- [x] **2 Look:** tokens v4.0 (`src/styles/tokens.css`: charcoal ground, `--mn-card`, violet `--mn-violet*`, data colours incl. `--mn-info`, radii 12/20; light kept), fonts Inter + Plex Mono + Noto Nastaliq Urdu (`src/app/layout.tsx`; serif/display now map to Inter), `globals.css` v4 block: `.pg` page aurora (on `<main>`), `.mn-head` navy aurora, `.mn-btn` / `.mn-btn-ghost`, `.mn-split`, `.mn-live`, `.mn-card-glass`, logo animation. Components: `ui/aurora-header.tsx` (AuroraHeader, AuroraStat), `ui/split-button.tsx`, `ui/segmented.tsx` (Segmented, Pill), Button primary = outlined glow, Card = glass, Badge `info`, PageHeader inside the aurora with `aside` (AreaPage passes it), FollowButton = split with count. Logo B in `brand.tsx` (`LogoMark animate|loading|compact`, `UrduName`), `src/app/icon.svg` + `apple-icon.png` redrawn. Menu (`navigation.ts`): Overview, Merit lists, Candidates, Estimates, My chances, Hospitals, Calendar, Jobs, Community, Chats · Mine: Me, Inbox, Help (Feed, My record, What if hidden and matched); phone tabs Home/Lists/Estimates/Chats/Me as a floating glass bar. **Candidates, Estimates, Calendar and Jobs links 404 until step 3 builds them.** Not done: sidebar estimate card and user card with ID/PMDC (step 3 Overview/Me data).
- [ ] **3 Pages:** Overview (both stages; video in `public/`), Candidates, Estimates, Merit lists, Round, Hospital/Speciality, My chances, Calendar, Chats, Community (fold Feed in), Me (fold Profile in), Sign in, phone layouts. Drop funnel/gauge/beam/heat charts once unused.
- [ ] **4 Checks:** `npx tsc --noEmit`, `npx eslint src`, `npx vitest run` (regenerate authz matrix with `UPDATE_AUTHZ_MATRIX=1 npx vitest run tests/authz-matrix.test.ts` after new data functions; session-less helpers go in `NO_SESSION`), `npx next build`.
- [ ] **5 Deploy to NAS** (section 7).

## 7. NAS deployment (how it is done now)

- NAS: ZimaOS at **192.168.1.41** (address changes; was .42). SSH `root@` with the medNAMA key: `E:\Projects\Coding Projects\medNAMA\_local\nas_key`, known hosts `_local/known_hosts_nas`. meritNAMA lives in `/DATA/meritnama` (not a git checkout; `.meritnama-ref` = `feat/v3-data-folder`), data in `./var`, app on `127.0.0.1:3010`, Cloudflare tunnel container.
- The NAS has 3.8 GB RAM and runs medNAMA, Brawlistan and others: **never build on the NAS.** Build here and overlay:
  1. `npx next build` locally (standalone output).
  2. Package: `git -c core.autocrlf=false archive HEAD` (**LF line endings**; a CRLF archive broke `meritnama.sh` and `scripts/*.sh` once) + `.next/standalone`, `.next/static`, `public`, `scripts/worker.mjs`, and for migrations `drizzle/` + `scripts/migrate.mjs`, `scripts/index-candidates.mjs`, `scripts/lib`.
  3. On the NAS: `sh scripts/backup.sh` first; extract source over `/DATA/meritnama` (keeps `.env`, `var/`); `docker build` two tiny overlay images: `FROM meritnama-app:prev` copying standalone/static/public/worker → tag `meritnama-app:local`; `FROM meritnama-app-migrate:prev` copying drizzle + scripts → `meritnama-app-migrate:local`; then `docker compose up -d --no-build`; check `curl http://127.0.0.1:3010/api/health`.
  4. Rollback: retag `:prev` → `:local`, `docker compose up -d --no-build`; `./meritnama.sh restore <backup>` for data.
- Backups so far: `var/backups/meritnama-20261110T135445Z`, `meritnama-20261112T160901Z`.

## 8. Gotchas

- Windows dev box: CRLF working copy, Git Bash; no Postgres, no Docker, no ffmpeg, no Chrome (no screenshots/Playwright). DB integration tests are skipped locally.
- Next.js 16 here differs from older docs; read `node_modules/next/dist/docs/` before writing framework code (see `AGENTS.md`).
- Commit identity: `git -c user.name=itskaero -c user.email=<owner email> commit`; push with `GCM_INTERACTIVE=never GIT_TERMINAL_PROMPT=0 git push https://itskaero@github.com/itskaero/meritNAMA-app.git <branch>`.
- Do not `git add -A`: `ingest/`, `docs/INGEST.md` and the `.gitignore` edit belong to another session.
- Old site for reference: `E:\Projects\Coding Projects\meritnama-rewrite\meritnama` (simulation logic in `js/sim-placement.js`, statuses in `applicantStatusLabel`).
