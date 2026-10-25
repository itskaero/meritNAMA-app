# Security — meritNAMA-app

## Principles

- Authorization is enforced on the server at two layers (route guard + data-access
  function) and by database constraints. UI visibility is never a control.
- Candidate data is isolated by authenticated identity. A candidate can read only the
  record linked to their account after verification; an applicant ID is never proof
  of identity.
- Every privileged write records actor, entity, before/after, reason and result in
  `audit_log`, in the same transaction as the change.
- Inputs are parsed with zod at the boundary (forms, imports, route handlers);
  unknown fields are rejected for admin-edited structures.
- Errors shown to users and written to logs never include secrets, connection
  strings or candidate fields. `parseEnv` reports variable names only (tested).
- Secrets live only in `.env` on the host (mode 600) — `.env.example` has
  placeholders. `DEV_AUTH_STUB_ROLE` is refused in production at startup.
- Postgres is on an internal Docker network with no published port; the app binds to
  loopback; HTTPS terminates at a reverse proxy or tunnel.
- Security headers: `X-Content-Type-Options`, `X-Frame-Options: DENY`,
  `Referrer-Policy`, `Permissions-Policy`; `X-Powered-By` removed. CSP to be added
  once the page inventory settles (delivery 5).
- `/api/health` is the only unauthenticated API. It returns coarse states only and
  allows cross-origin reads for `PUBLIC_SITE_ORIGIN` only.
- Uploads (delivery 3): size limits, extension + content sniffing, schema validation
  before anything is stored, files written under `APP_STORAGE_DIR` with generated names.
- Processing jobs run fixed, server-defined code paths. Nothing executes
  browser-supplied commands.

## Audit of the legacy public repository (25 Oct 2026)

Findings from inspecting `itskaero/meritnama` at commit `481d0f3`. Kept here, not in
the public repo, to avoid publishing exploitation detail.

| # | Severity | Finding |
|---|---|---|
| 1 | Critical | `data/induction21_candidates.json` (~78 MB, ~3.5k candidates) is committed with names, PMDC numbers, emails, phone numbers and CNICs. The deploy workflow strips CNIC/phone only from the *deployed* copy; the raw file remains in the public repo and its history. |
| 2 | Critical | `inductions/*/gazette/gazette_*.json` include per-applicant CNIC, contact number, PMDC number and marks for every induction 8–21. |
| 3 | Critical | Candidate sign-in compares `SHA-256(applicantId)` from the public `data/candidate_auth_index.json`; applicant IDs are short numbers and are published in the same repository, so any candidate account can be opened by anyone. |
| 4 | Critical | Firestore rules allow world read and world write on `authorized_users` (PIN hashes and admin flag), and world read on `access_logs`, `screenshot_logs`, `user_activity_logs`, `presence`, `inbox_requests`, `mentorship_requests`. Admin rights are a client-side check. (`functions/README.md` already documents the `authorized_users` write hole and a fix that has not been deployed.) |
| 5 | Medium | `firebase-config.js` is committed although listed in `.gitignore`. Web config is not a secret, but it confirms the project to target for #4. |
| 6 | Low | Backup / corrupted copies (`*_bk.json`, `sim-merit-list.js.corrupted`) are deployed publicly. |

### Remediation plan (owner: maintainer; needs a decision before delivery 2)

1. **Contain now** — independent of this app: tighten Firestore rules (deny by
   default; deploy `grantPortalAccess`; make logs admin-only via a server function),
   remove candidate-level files from the Pages deployment.
2. **Purge** — remove the datasets in #1–#2 and `candidate_auth_index.json` from the
   public repo *and its history* (`git filter-repo`, force-push, GitHub Support cache
   purge). Forks and clones made before the purge cannot be recalled.
3. **Re-home** — import those datasets into this app's Postgres from files placed in
   `APP_STORAGE_DIR`; serve only aggregates publicly.
4. **Replace auth** — move candidates and admins onto this app's server-side sessions;
   retire the PIN flow and the auth index.
5. **Assess disclosure obligations** — the exposure of CNICs and phone numbers may
   create notification duties; get advice appropriate to the jurisdiction.

## Reporting

Report vulnerabilities privately to itskaero@gmail.com.
