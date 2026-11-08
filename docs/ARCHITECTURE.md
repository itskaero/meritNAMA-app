# Architecture — meritNAMA-app

## Why this stack

The existing product is ~1.5 MB of hand-written JS across static pages, reading
multi-megabyte JSON from GitHub Pages, with authentication enforced in the browser
and privileged writes allowed by open Firestore rules. The private app needs
server-side authorization, relational data with history, long-running jobs and a
self-hostable footprint.

- **Next.js App Router + TypeScript**: server components let guarded pages render
  only after a server-side check; route handlers cover the small API surface; one
  process to run on a NAS. Strict TypeScript and zod catch contract drift.
- **PostgreSQL**: candidates, preferences, seats and policies are relational;
  versioning, audit and constraints (e.g. *at most one active scoring policy*) are
  enforced in the database, not in UI code.
- **Drizzle ORM**: thin, SQL-first, generates plain SQL migration files that are
  reviewed and committed; no runtime engine binary (simple on ARM NAS units).
- **Tailwind CSS 4** mapped onto the shared MeritNama tokens.
- **No cloud dependency at runtime.** Fonts are self-hosted at build time; nothing
  calls Firebase or GitHub.

## Request path and authorization

```
browser ──HTTPS──► reverse proxy ──► Next.js app ──► data-access (src/lib/data) ──► Postgres
                                      │                 │
                                      │ layout guard     └ assertRole(session, …) on EVERY call
                                      └ requireRole("candidate" | "admin")  → redirect
```

Three layers, none of which trusts the one before it:

1. `portal/layout.tsx` / `admin/layout.tsx` call `requireRole` and redirect before
   any markup is rendered. `getSession()` calls `connection()` so a session is never
   baked into a prerendered page (a build once produced static guarded pages; this is
   the fix).
2. Data functions take the session as an argument and call `assertRole` themselves.
3. Database constraints guard invariants regardless of caller.

Hidden buttons and client route checks are never relied on.

## Authentication

`src/lib/auth/session.ts#getSession` is the single integration point. It reads the
`mn_session` cookie (or, outside production only, the `DEV_AUTH_STUB_ROLE` stub).

**Email one-time links** (`src/lib/auth/login.ts`), implemented in-house rather than
with Auth.js, which does not yet support Next 16; the flow is small enough to own:

1. `/sign-in` asks for an email. `requestLoginLink` stores the SHA-256 of a random
   token (15 minutes, single use) and emails `/auth/verify?token=…` through
   `SMTP_URL`. The answer is the same whether or not an account exists. Limits are
   3 links per email and 10 per IP every 15 minutes.
2. `/auth/verify` shows a *Continue* button. Only the POST uses the token, so mail
   scanners that open links do not sign anyone in.
3. `consumeLoginLink` marks the token used, creates the user on first sign-in (owner
   when listed in `OWNER_EMAILS`, otherwise candidate), tries the automatic record
   link (below) and opens a session. The cookie holds a random id; only its SHA-256
   is stored. It is `HttpOnly; SameSite=Lax`, `Secure` in production, lasts 30 days
   and slides once a day.
4. Sign out deletes the session row and the cookie.

**Continue with Google** (optional, `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`;
`src/lib/auth/google.ts`, routes under `/auth/google/`): authorisation code flow with
PKCE and a `state` value, both kept in a 10-minute HttpOnly cookie scoped to
`/auth/google`. The callback checks `state`, exchanges the code with Google over TLS,
checks the ID token's issuer, audience and expiry, and accepts only an email Google
marks as verified. From there it is the same `createSessionFor` as a one-time link:
owner bootstrap, automatic record linking and the session cookie. No password is
ever stored.

Without `SMTP_URL` in development, mail is written to `dev_outbox` and shown at
`/dev/mailbox` (404 in production).

### Candidate records

- **Index.** When a merit round is imported, `indexCandidates` stores
  `HMAC(CANDIDATE_INDEX_SECRET, email)` and `HMAC(…, PMDC number)` per applicant in
  `candidate_identities`. Raw values are read once in memory and never written.
  `npm run index:candidates -- <folder>` backfills rounds imported earlier.
- **Automatic link.** At sign-in, if the email's HMAC matches exactly one applicant
  that no one else has claimed, the account is linked (`method = email`).
- **Manual link.** Otherwise the candidate sends their applicant ID, PMDC number and
  a proof document (PDF/JPG/PNG, at most 5 MB, type checked from the bytes, stored as
  `storage/evidence/<uuid>`). The app notes whether the PMDC number matches the
  record. A verifier approves or rejects it at `/admin/candidates`, with an audited reason.
- One verified link per account and per applicant (partial unique indexes).
- Verification unlocks *My merit* on `/portal/profile` (only the person's own rows),
  marks pre-filled in the score finder, posting in the community, and a *Verified* badge.
- **Records for staff** (`/admin/candidates/records`, verifiers and owners;
  `src/lib/data/candidate-records.ts`). Search an induction's applicants (published
  rounds ∪ simulation data) by ID prefix, programme, link or placement; open one to see
  published allocations, marks per programme and per preference under the induction's
  rules (`candidateSimRecord`), consent replies and the account link. *Possible
  duplicates* lists applicant IDs whose official record gives the same email or PMDC
  number (equal HMACs). Export as CSV is audited; text cells that a spreadsheet would
  read as a formula are prefixed with an apostrophe.
- **Corrections** (`candidate_corrections`, `src/lib/domain/corrections.ts`). Base
  marks, programme marks or profile status, always with a reason, always staged
  (`candidate_correction` change: before/after per value, publish, roll back). They are
  kept apart from the imported dataset, so a re-import keeps them, and the engine
  loader applies the ones in force (oldest first) to round 1 and to later rounds. A
  CSV (`applicant_id,field,program,value`) stages many at once; every line is checked
  first. Staff without `candidates.verify` see a staged correction's title only.

**Decision on Firebase.** The legacy app's "auth" is an email + PIN checked in the
browser against a world-readable Firestore collection. It cannot be made secure
without a server, so it is **not** carried forward. Firestore content
(community posts, notifications, editorial) stays in Firebase for now and is migrated
collection by collection; the app will not read and write the same entity in both
stores.

**Recommended for delivery 2:** Auth.js (or an equivalent library) with
email one-time-link sign-in through the operator's SMTP provider, database sessions in
Postgres, `HttpOnly; Secure; SameSite=Lax` cookies. Candidate-record linking is a
separate, explicit step: the user proves control of the email address on the official
record. An applicant ID alone is never proof of identity.

## Community

- `discussion_threads` are questions: `accepted_post_id`/`answered_at` record the
  accepted answer (asker or moderator), `duplicate_of` links a closed duplicate.
- `snippet` (threads and posts) names a merit group in one round. It is validated
  against `merit_allocations` when posted, and its figures are computed when shown
  (`src/lib/data/snippets.ts`), so a card can never carry typed numbers.
- `follows` (user, kind, key) and `notifications` drive the in-app inbox. Notifications
  are written in the same transaction as the event: a reply (thread followers), an
  accepted answer (its author), a new question (topic followers), a merit-round
  import (followers of the induction, round, specialities and hospitals in it).
  Read notifications are pruned after 90 days. Every query is scoped to the
  signed-in user.
- Polls: `discussion_polls` (one per thread), `discussion_poll_options`, and
  `discussion_poll_votes` (one row per member, updated on a change of mind). Counts
  leave the database only when the member may see results (voted, closed, or
  moderator).
- Reviews: `hospital_reviews`, with four 1–5 ratings checked by the database and a
  unique (author, hospital, speciality) key. "Allocated here" is an `exists` over
  `candidate_links` → `merit_allocations` evaluated in SQL; applicant ids never
  reach the page. Reports, helpful votes and moderation share the community
  tables, with `target_kind = 'review'`.

- Round rooms (`round_room_messages`, `src/lib/data/rooms.ts`): a one-line chat per
  published round, keyed by (induction, round), ordered by `seq` so clients poll
  "after n" (a Server Action, every 8 s while the tab is visible on a running
  induction's latest round, every minute otherwise). Everyone signed in reads; posting
  needs `mayPost` (verified record or staff), the community feature switch, 1–300
  characters, and at most one message per 10 s and 30 per hour. `importMeritRound`
  calls `postRoundDay` in its transaction: a system message (author null) with the
  round's allocations, median closing merit and its change, the biggest fall, and how
  many shortlist alerts went out. Reports and hide/show use `target_kind = 'message'`.
- Merit band (opt-in, `users.show_band`, off by default): beside a name in rooms,
  the programme and a one-mark range of the latest verified allocation, worked out
  in SQL; exact marks and applicant ids never reach the page.
- Reputation (`src/lib/data/social.ts`, `reputationSql`): computed when read, nothing
  stored. 10 per accepted answer on someone else's question, 2 per helpful vote from a
  verified member or staff, at most 5 votes counted from one voter. Levels: New,
  Contributor (10), Helpful (50), Trusted (150); "New" shows no badge.
- Peer counts (`peerInterest`): people whose reference marks (verified record's latest
  allocation, else their latest preference list's marks) are within 0.5 of the
  viewer's, counted over shortlists and preference lists. Counts only, never below
  3, the viewer excluded, and anyone with `users.peer_counted = false` left out.
  The viewer's own stored marks are used, never typed ones, so the window cannot be
  moved around to probe.

## Preference lists

`preference_lists` and `preference_items` (primary key: list + speciality + hospital, so an option appears once; positions unique per list). Every function in `src/lib/data/preferences.ts` loads the list through `ownList`, which filters by the signed-in user, so another member's list reads as "does not exist". Reordering rewrites the list in one transaction after checking the new order names exactly the current options.

## Predictions

`src/lib/domain/prediction.ts` holds the pure maths: quantiles, the 20th–80th percentile range rounded outwards, confidence levels, coverage, and the policy-range parser. `src/lib/data/predictions.ts` reads the history.

- **Matching specialities.** Changes are matched by programme, quota and a normalised speciality name, because older inductions are often not mapped to lookup ids.
- **History.** It is computed per request from `merit_allocations`: one grouped query, about 100 ms.
- **What counts as a forecast.** "Next round" is a forecast only while the induction's cycle end date is in the future. Otherwise the same code shows predicted against actual.
- **Data errors.** Changes beyond ±50% are dropped.

## Data model (delivery 1)

Only entities whose shape is already known:

| Table | Notes |
|---|---|
| `users` | email, role (`candidate` / `admin`) |
| `inductions` | official induction number as PK, status |
| `scoring_policies` | `policy_key` (`2026`, `2026-1`), `version`, `status` (draft/active/retired), `definition` jsonb validated by `policySchema`; unique (key, version); partial unique index → one active policy |
| `audit_log` | actor, action, entity, before/after, reason, result, timestamp |

Every policy write goes through `createPolicyDraft`, which validates, versions and
writes an audit row in one transaction. Activation/rollback is delivery 3.

See [DATA_CONTRACTS.md](DATA_CONTRACTS.md) for the legacy datasets still to map.

## Calculation and simulation engines

Kept out of UI code, as pure modules under `src/lib/engine/` (no I/O, no globals),
run server-side. Long runs will go to a background worker (a second container built
from the same image) reading jobs from a Postgres table. No browser-supplied commands
are ever executed.

**Ported (Nov 2026)** from the legacy simulator at public commit `f686206`:

| Module | Legacy source | Does |
|---|---|---|
| `rules.ts` | — | Allocation rules per induction, as data (below) |
| `marks.ts` | `sim-core.js`, `sim-cascade.js` | Mark per preference, shared by both engines: base marks + certificate bonus + parent-institute bonus, each as the rules and scoring policy say; FCPSD/FCPS Dentistry aliases; speciality groups for name matching |
| `placement.ts` | `sim-placement.js` (← PHF `merit.py`) | First-round allocation in passes, best marks first, displacing lower holders; Armed Forces quotas as a separate track; per-preference outcome (placed / beaten with cutoff / not attempted / no seat) |
| `cascade.ts` | `sim-cascade.js` (← `merit_cascade.py`) | Next round from a published one: consent and profile status vacate seats, then waves of upgrades; comparison with the round PHF actually published |

**Rules, not code, for what changes between inductions.** Two documents decide an
induction's simulation:

- The **scoring policy** says *whether* a preference-level bonus counts and *how much*
  it can be worth: `fcps_jcat` → certificate bonus, `parent_institute` → parent bonus;
  included turns it on, `max_marks` caps it.
- The **allocation rules** (`allocationRulesSchema`) say *how*: certificate matching
  (discipline id, speciality name, programme type), value sources in order, best or
  first certificate, pass required, fallback to per-programme marks; quota tracks;
  processing order; and the cascade's eligible profile statuses, first-preference
  lock, seat holding and wave limit. Each bonus's `enabled` is `"auto"` (follow the
  policy) or an explicit `true`/`false` override.

`resolveRules(rules, policy)` combines them. Each setting chooses among behaviours
implemented in code, so an edit can never inject code; a new kind of rule needs code
and a test. `DEFAULT_RULES` (for new inductions) counts the **best** matching
certificate in both rounds and orders candidates by their full mark.

Rules are stored per induction in `allocation_rules` (versioned, at most one active
version per induction; no foreign key, so rules can be prepared before an induction's
data arrives) and managed at `/admin/rules` by policy editors. Saving creates a
draft; activation is a staged change (`rules_activate`) whose preview lists the
settings that change and the rules in words before and after; publishing keeps the
previous state, so a rollback returns to the earlier version or to the defaults.
`loadInductionRules(db, n)` gives the engines what an induction runs with: its active
rules (else `DEFAULT_RULES`), the scoring policy covering it (per key the active
version, else the newest) and the resolved result, or the problem when `"auto"`
has no policy to follow.

**Parity.** `scripts/golden/legacy-engine.mjs` runs the legacy files in a Node sandbox
on seeded synthetic inputs (with frequent tied marks) and writes inputs + outputs to
`tests/fixtures/engine/`; `tests/engine-golden.test.ts` replays them through the port
under the `LEGACY_FIRST_ROUND_RULES` and `LEGACY_CASCADE_RULES` presets (the legacy
code found certificate marks differently in the two rounds, and ordered candidates
without the parent bonus) and requires identical marks, slots, placements and stats.
Deliberate tie-breaking and rule mutations make it fail. Known differences, kept out
of the golden inputs:

- A 0-seat slot is skipped; the legacy code threw on it.
- The legacy "marks option" and candidate-revision switches (admin-configurable
  formulas) are not ported: the engine takes `baseMarks` already resolved.

**Wired to data (Nov 2026).** `/admin/processing` imports an induction's restricted
files from `<APP_STORAGE_DIR>/simulation/induction<n>/` (`src/lib/domain/sim-dataset.ts`
keeps only engine fields: marks, preferences, certificate marks, effective profile
status) into `sim_datasets` / `sim_candidates` / `sim_preferences`, and runs round 1
under the induction's resolved rules. A run is queued in `simulation_runs` with the
rules, rules version and scoring policy it used, executed after the response
(`after()`), and its placements are stored in `simulation_placements`. When the
induction's published round 1 is imported, the run compares with it per seat group
(`src/lib/domain/sim-compare.ts`, no applicant ids in the result). Runs left queued
or running by a restart are marked failed when the page is next opened. A separate
worker container can take over queued runs later without schema changes.

**Back-test, induction 21 (real data, default rules, scoring policy 2026):** 3,289
eligible of 3,474 candidates; 1,307 of PHF's 1,322 round-1 allocations reproduced
exactly (98.9%; MS, MDS and FCPS Dentistry 100%, MD 99.3%, FCPS 98.2%); 780 of 797
seat groups identical. Profile status was the decisive input: without it 92.9%.
Of the remaining differences, 4 are allocations where PHF's published mark differs
from the computed one. Best vs first certificate made 1 allocation of difference.

**Later rounds (Nov 2026).** Consent replies, fetched from the portal per round, are
imported from `consent_round<r>.json` into `sim_consent` (name and marks dropped). A
`next_round` run starts from published round r (names resolved through the lookups
and whitespace-normalised, since the seat file pads some hospital names), resolves
each reply to the seat it was given in round r, keeps out everyone who rejected all
offers in an earlier round, and runs the cascade over the portal preferences. It is
compared with published round r+1 and with the "nobody moved" baseline (round r+1
against round r), which is what the simulation has to beat.

**Tuned against induction 21** (rounds 1–8, real data). Two rules close most of the gap:

- **Awaited replies** (`cascade.awaitedConsent`, default `"yield"`): the seat goes to
  whoever is next in line; it stays with the holder only if nobody claims it (the
  operator's account of PHF practice). In every round but one, all all-Awaited
  candidates were gone from PHF's next list. Round 3 is the exception (68 of 78 kept
  their seats), so a run can override the setting: **R3→R4 runs with "keep"**.
- **Dropped off stays out** (`cascade.droppedStayOut`, default on): anyone who was on an
  earlier published list and is not on the round being simulated from does not come
  back. PHF re-seated 0–1 such candidates per round; the legacy cascade re-seated dozens.

- **Civilian and Armed Forces tracks** (`cascade.tracks`, default `"phf"`), as the
  operator describes PHF practice: seated in one track, a candidate may also get a seat
  in the other (any programme) in a later round; seated in both in one round, they
  consent to one and are out of the other for good (`trackBansFromRound`, carried
  forward from every earlier round); no consent drops them from all tracks; rejected
  is never considered again.

- **Programmes** (`cascade.programmes`, default `"phf"`), the same way: seated in one
  programme, a candidate may still get a seat in another; seated in two in one round,
  they consent to one and are out of the others for good (`programmeBansFromRound`,
  carried forward). Without the carried bans this collapses (7,868), which is why a
  plain "any programme" rule failed.

Tried and rejected (no gain or worse): letting seated candidates enter any listed
programme without the bans (65% in R1→R2), offering seats already empty at the start of the round (no
change), and filling freed seats in global merit order instead of seat by seat (no
change). Joining happens only after the final round.

| | R1→2 | R2→3 | R3→4 | R4→5 | R5→6 | R6→7 | R7→8 | reproduced |
|---|---|---|---|---|---|---|---|---|
| legacy rules | 93.1 | 97.0 | 81.9 | 94.8 | 92.3 | 91.8 | 91.0 | 7,952 |
| awaited + dropped out | 93.5 | 97.3 | 95.7 | 97.3 | 96.0 | 96.0 | 96.6 | 8,330 |
| + PHF tracks | 93.5 | 98.5 | 97.1 | 97.7 | 96.5 | 97.2 | 97.9 | 8,404 |
| **+ PHF programmes** | **96.0** | **99.0** | **97.3** | **99.2** | **98.3** | **98.7** | **99.1** | **8,518** |
| nobody moved | 57.3 | 88.4 | 94.5 | 90.6 | 85.9 | 86.6 | 89.0 | |

With round 1 at 98.9%, the simulation reproduces 98.9% of PHF's first list and 93–97%
of each later one (96.0–99.2%).

**What if (simulated consent, Nov 2026).** As on the legacy site, consent can be changed
for a simulation without touching the official consent. Each person keeps their own
private copy per list (`sim_consent_scenarios`: a published round, or a simulated run's
list) mapping an allocation to Accepted / Rejected / Awaited. Unchanged allocations keep
the official status on a published list (`officialStatuses`, matching replies by title,
since some exports leave the preference number 0) and count as Awaited on a simulated
one. `consentRows` turns statuses into replies as the legacy site did. A what-if run is
private to its owner (`simulation_runs.owner_user_id`), records the changes it used
(`consent_overrides`) and what it carries forward (`carry`: who is out, track and
programme bans), so the next round can be simulated from it (`base_run_id`).
As on the public site (owner's decision, Nov 2026), every member sees the whole list
(applicant ids, marks, seats; names, PMDC numbers and emails are never stored) and may
change anyone's consent on their own private copy (`/portal/simulation`, filters and a
toggle per row); a linked record only marks their own rows. Staff do the same at
`/admin/processing/consent`.

**Estimated merit lists.** A finished staff run can be published
(`simulation_runs.published_at`, `publishEstimate`, audited): members then see it under
Merit lists as "Estimated round N" in full (`/portal/history/<n>/estimates/<run>`,
labelled Estimate), with estimated closing merit per seat group, and can start a
what-if from it. Once PHF's own round N is imported the estimate is shown as superseded.
Round 1 is estimated before PHF's list from the **gazette** (`gazette_<n>.json` in the
simulation folder: official marks, score parts and eligibility, which override the
portal's) with the preferences collected from the portal; names and PMDC numbers in
the gazette are never read. Rebuilt from
unchanged official statuses, consent reproduces the official run within about ±1%.

**Merit calculator (Nov 2026).** `src/lib/engine/score.ts` computes merit marks from a
candidate's own inputs under any stored scoring policy, per component type (percentage,
years, count, score, months, tiered choice, yes/no, FCPS Part-I attempt or JCAT
percentage), each capped at its max marks. Ported from `app-predict-calc.js`
(runCalculator) and proven identical by `tests/score-golden.test.ts`: 320 random cases
over all eight real policies, produced by running the legacy function on a fake form
(`scripts/golden/legacy-calculator.mjs`). `/portal/calculator` is a plain GET form (no
JavaScript needed, nothing stored); the result opens the score finder with the marks
filled in. The legacy reverse calculator ("what do I need") is not ported: the finder
and the prediction ranges answer the same question from the imported rounds.

### Base-marks formula

Allocation rules may set `baseMarks.formula`, an expression over the candidate's
imported parameters (`src/lib/engine/formula.ts`: numbers, + − × ÷, brackets,
comparisons, `&&`/`||`, `min`, `max`, `abs`, `round`, `clamp`, `if`; parsed, never
`eval`ed). Parameters are the numeric component fields of `marks.json` /
`components.json` (e.g. `degree`, `houseJob`, `position`, `mdcat`), `marksTotal` (the
imported total) and certificate figures (`certCount`, `certPassed`, `certMaxMarks`,
`certMaxComputerized`). Import keeps a field as a parameter only if it is a plain
number between −1000 and 1000 under a name that is not an id, a total or a personal
field, so phones, CNICs and PMDC numbers cannot be kept.

The engines are untouched: the data layer works base marks out before a run
(`effectiveCandidates`): corrected parameters → formula → corrections to marks and
status, which still win. A candidate missing a parameter keeps the imported marks, or
gets 0 (`onMissing`). The rules page lists the parameters with their ranges, tries a
formula on every candidate (how many would differ from the imported total, and by how
much: aggregates only) and saves it as a new draft; the impact preview then shows the
placement effect. Corrections can set a single parameter (`field = parameter`), which
the formula then uses. On induction 21, `degree + houseJob + …` matches the imported
total for all but 9 of 3,474 candidates.

### Impact preview

`firstRoundImpact` (`src/lib/data/simulation.ts`) runs an induction's round 1 twice
over the same imported data, under the rules in force and under a draft (rules
version, or the same rules under another scoring policy), and compares the lists:
candidates who keep their seat, move, gain or lose one, and the seat groups whose
closing merit changes. Aggregates only. It is part of every staged rules or policy
activation (each covered induction with simulation data, at most three) and can be run
from a draft's page. When the resolved settings are identical it says so without
running.

### Run outputs

A finished shared run downloads as CSV (the simulated list) or JSON (the list plus the
run, rules, policy and dataset time it used), named
`induction<n>_round<r>_simulated_<UTC>_<run id>`. Downloads need `data.edit` and are
audited. What-if runs are not exported.

## Portal details

- **Merit profile** lists what the app holds about the candidate's own record in the
  newest induction with simulation data (marks, components, programme marks,
  certificates, profile status, preferences, consent replies) and flags what is
  missing, so they can see why a simulation leaves them out (`myDataChecklist`).
- **CPSP accreditation** is matched to hospitals and specialities by name
  (`src/lib/domain/accreditation.ts`): CPSP's "College / Hospital (City)" parts,
  spelling variants, one-typo tolerance, numbers that must agree ("Allied II" is not
  "Allied"). On induction 21, 48 of 69 hospitals match, all correctly; the rest are
  left unmatched rather than guessed. Pages say a match is by name.
- **Dashboard** lists its data sources and when each was last updated.
- **Workspace**: saved views (finder results and comparisons, portal paths only,
  private), the hospitals and specialities the member follows, and shortlist alerts:
  when a round is imported, one inbox note per member with the closing merit of each
  shortlisted seat in it and its change since the previous round (switchable).
- **Merit lists** chart seats per induction, in total and by programme.

## Workspace settings

Owners (Team & roles; `src/lib/data/settings.ts`, `app_settings`):

- **Feature switches** for the candidate community, calculator, planner and what-if
  simulation. Off: the section leaves candidates' menus, its layout shows a notice
  (`FeatureGate`), and the data layer refuses candidates' writes (`assertFeature`).
  Staff keep access, with a reminder.
- **Data retention**: sign-in links, expired sessions, the development mailbox, read
  notifications, candidates' what-if runs and proof documents of decided requests
  (the file is deleted; the decision stays). Runs at most daily, in `after()` of a
  staff page, or on demand. The audit history is never purged.
- **Backup status** from `APP_BACKUP_DIR` (the backups folder mounted read-only):
  the newest `scripts/backup.sh` folders, their size and contents; stale after 26 hours.

## Storage

`APP_STORAGE_DIR` (mounted volume) holds approved source files and generated reports.
Restricted datasets are imported from there, never committed.

## Status

Every portal and admin page is live; none renders `PlaceholderPage` any more. What is
left (release hardening, cut-over, optional features) is listed in the README.
