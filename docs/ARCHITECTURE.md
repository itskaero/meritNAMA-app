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

Kept out of UI code. They will be ported from the legacy JS (`app-predict-calc.js`,
`sim-core.js`, `sim-placement.js`, `sim-cascade.js`) into pure modules under
`src/lib/engine/`, proven against golden outputs produced by the legacy code, and run
server-side. Long runs go to a background worker (a second container built from the
same image) reading jobs from a Postgres table. No browser-supplied commands are ever
executed.

## Storage

`APP_STORAGE_DIR` (mounted volume) holds approved source files and generated reports.
Restricted datasets are imported from there, never committed.

## What is placeholder

Every page under `/portal` and `/admin` renders `PlaceholderPage` with a *Not yet
integrated* badge and its planned scope (from `src/lib/navigation.ts`). The only live
data is system health on `/admin` and stored policy versions on `/admin/policies`.
