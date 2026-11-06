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

Still to do: the cascade (later rounds) on imported consent data, the current
induction's simulation from members' preference lists on `/portal/simulation`, and
`app-predict-calc.js` (the scoring calculator).

## Storage

`APP_STORAGE_DIR` (mounted volume) holds approved source files and generated reports.
Restricted datasets are imported from there, never committed.

## What is placeholder

Every page under `/portal` and `/admin` renders `PlaceholderPage` with a *Not yet
integrated* badge and its planned scope (from `src/lib/navigation.ts`). The only live
data is system health on `/admin` and stored policy versions on `/admin/policies`.
