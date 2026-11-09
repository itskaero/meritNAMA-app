# Data formats: what to put in the data folder

Admin → **Data** takes JSON files three ways: drag them in, press **Sync now** (a GitHub
data repository), or copy them into `<MERITNAMA_DATA_DIR>/storage/data/` on the NAS.
Files stay where you put them; the app looks at the folder every minute and acts by the
file's hash.

| What happens | When |
|---|---|
| **Live at once** | the file is new and passes the checks (auto-publish on, the default) |
| **Waits for a click** | the file would replace live data: *Show what changes* stages a before/after to review and publish |
| **Problem, nothing applied** | the file has a mistake, in plain words, e.g. `Table5 › row 4, marks: expected number` |
| **Skipped** | the file is worked out by the app (`closing_merit.json`, `trends.json`, …) or not recognised |
| **No longer in the folder** | the file was removed; the data it brought stays live |

## Layout and names

The folder is laid out like the old public repository. Old flat names work as they are.

| Kind | Path (either form) | Notes |
|---|---|---|
| Merit round | `inductions/21/merit/round_8.json` · `induction21_merit_round8.json` · `i21_round_8.json` | PHF export (`Table`, `Table5`). The induction is read from the file. |
| Consent replies | `inductions/21/consent/round_4.json` · `induction21_consent_round4.json` | Kept for estimates and what-if. |
| Seat matrix | `inductions/21/seats.json` · `induction21_seats.json` | A new induction needs a merit round first (it creates the induction). |
| Scoring policy | `scoring_policy.json` | Always waits for a click when a policy is live. |
| Reference | `disciplineFullData.json`, `cpsp_accreditation.json`, `induction21_specialty_groups.json` | Saved as a new version; old versions stay. |
| Estimate inputs | `inductions/21/gazette/gazette_21.json`, `candidates.json` (or `marks.json` + `preferences.json`), `components.json`, `certificates.json`, `ProfileStatus.json` | Kept as they are; press *Build the estimate dataset* when the Estimates card says it is ready. |

A file whose name says nothing is recognised by its contents when it is a merit round, a
seat matrix, a scoring policy or a reference document. A merit round still needs its
round number in the name (`round_<n>.json`); a seat file needs its induction.

Recognised but **not imported yet**: `induction<n>_schedule.json`, `induction<n>_joining_status.json`.

## Personal data

Raw files can hold names, PMDC numbers, emails and phones. They are dropped as each file
is read; only applicant IDs, marks, preferences, consent and seats are stored. The raw
files stay on the NAS disk, and downloading them is for data editors only. **Keep a
synced data repository private**, and set `GITHUB_TOKEN` (read-only) on the server.

## Edit with Claude

Every file has **Download**: the same bytes that are in the folder. Edit it, then drop it
back; it shows as a replacement with what changed. Ask Claude to keep the file's shape and
to run the checks by dropping it in the Data page.

## Limits

JSON files up to 200 MB (merit, seat, policy and reference files are validated whole, up
to 25 MB), folders up to 2,000 files and 6 levels deep, repository syncs up to 400 files.
