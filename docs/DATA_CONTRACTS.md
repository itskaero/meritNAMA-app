# Data contracts

Status of each legacy dataset (public repo `itskaero/meritnama`) on its way into this
app. A contract = zod schema + Postgres table + importer + tests against real files.

| Dataset (legacy path) | Shape observed | Contract |
|---|---|---|
| `data/scoring_policy.json` | `{active_policy, _induction_max, year_total_max, policies{key → {label, induction, total_marks, policy_ref?, notes?, tidbits?, components[]}}}` | ✅ `src/lib/domain/scoring-policy.ts`, tables `scoring_policies` + `scoring_policy_file_meta`; import, edit, activate and export at `/admin/policies` (lossless round trip, see below) |
| `inductions/<n>/merit/round_<r>.json` | PHF export: `Table` (induction/round meta), `Table3` (column map), `Table5` rows: `type, specialityJobId, quotaId, quota, speciality, institute, hospital, seats, marks, applicantId, name, relation…, pmdcNo, …` | Delivery 2 |
| `inductions/<n>/gazette/gazette_<n>.json` | Same envelope; `Table5` rows: `applicantId, nameFull, pmdcNo, cnic, contactNumber, matric, fsc, degree, houseJob, experience, hardArea, research, position, attempts, marksProgram, marksTotal, statusId, …` | Delivery 2 — **restricted** |
| `data/induction21_candidates.json` | `{applicantId → {applicantId, nameFull, pmdcNo, emailId, contactNumber, cnic, preferences[{specialityId, typeName, typeId, hospitalName, instituteName, preferenceNo, quotaName, programMarks, marks, disciplineIds, parentInstitute}]}}` | Delivery 2 — **restricted** |
| `data/induction21_consent_round*.json`, `induction21_joining_status.json`, `induction21_merit_round*.json` | Per-round candidate states | Delivery 2 — restricted |
| `data/induction21_seats.json`, `induction21_specialty_groups.json`, `disciplineFullData.json` | Seat matrix, specialty groupings | Delivery 2 |
| `data/cpsp_accreditation.json` | Accredited programmes per hospital | Delivery 2 (public reference data) |
| `data/flat_lookup.json`, `closing_merit.json`, `normalized_merit.json`, `trends.json`, `specialty_ranking.json` | Derived by `scripts/process_data.py` | Re-derived by the ported pipeline; legacy outputs become golden files |

## scoring_policy.json round trip

- **Import** (`importScoringPolicyFile`): the whole file is validated first, then in one
  transaction every policy becomes a new draft version, the file-level fields
  (`active_policy`, `_note`, `_induction_max`, `year_total_max`, `_year_total_max_note`,
  any other top-level keys) go to `scoring_policy_file_meta`, and `active_policy` is
  activated. Existing versions are never overwritten.
- **Export** (`GET /admin/policies/export`): newest meta + per key the active version
  (otherwise the newest) → `scoring_policy.json`, validated with the import schema.
- **Fidelity**: definitions and meta are stored as written, in `json` (not `jsonb`)
  columns, and the schema adds no defaults, so values and key order survive. Only
  whitespace differs (the export is `JSON.stringify(…, 2)`); the integration test
  asserts the exported file equals the real one.
- **Unknown fields are rejected** (strict objects) to catch admin typos. If the public
  site adds a field, extend `scoring-policy.ts` before importing.

## Observations that shape the contracts

- **CNIC and phone numbers are stripped at public-repo HEAD** (`tools/strip_pii.py`, see
  SECURITY.md). Delivery-2 importers must treat `cnic` / `contactNumber` / `number` as
  optional or blank; originals exist only in history or operator-supplied files.

- **A policy can cover several inductions**: `induction` is either a number (`21`) or
  an inclusive range string (`"9-10"`, `"17-19"`). Modelled as such;
  `policyInductions()` expands it. (Found by the contract test against the real file.)
- **Invariant**: in every real policy, included components' `max_marks` sum to
  `total_marks`, and `total_marks` matches `_induction_max` for every covered
  induction. Both are enforced.
- **Programme types** in merit lists: `FCPS`, `FCPS Dentistry`, `MS`, `MD`, `MDS`.
- **Two inductions can share a calendar year** (2026 = induction 20 and 21), which is
  why policy keys like `2026-1` exist. Use the induction number as the primary key
  everywhere; calendar year is display data.
- Hospital and specialty names vary across years; `process_data.py` normalises them.
  Delivery 2 introduces canonical IDs with an alias table rather than string matching.
