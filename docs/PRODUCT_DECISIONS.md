# Product decisions

Decisions taken with the owner (Nov 2026 review). Each one records what was chosen
and what it implies for the build. Change this file when a decision changes.

## Community

| Topic | Decision | Implies |
|---|---|---|
| Who may post | **Verified candidates write; everyone signed in reads** | Posting is gated on a verified candidate record, so it waits on candidate verification (phase 4). Until then only admins post. |
| Format | **Q&A with accepted answers** | Threads become questions; the asker or a moderator accepts one answer; answered questions rank first; duplicates link to the original. |
| Rich posts | **Live merit snippets, polls, hospital/speciality reviews** | A snippet embeds a closing-merit card rendered from the database (never typed numbers). Polls are one question with options. Reviews are structured (training, workload, hostel, stipend on time) with ratings, separate from threads. |
| Notifications | **Follow topics, in-app inbox** | Follow a speciality, hospital, round or thread; a bell shows new answers and new rounds. No email. |

Already in place: anonymous display names, personal-data refusal (CNIC, phone,
email), rate limits, reports and audited moderation.

## Merit display

| Topic | Decision | Implies |
|---|---|---|
| Entry point | **Score-first finder** | Enter marks (or use the verified score), pick programme and quota, see every speciality × hospital as *Safe / Borderline / Out of reach* against past rounds. The induction → round lists stay as the detailed view. |
| Units | **Percent of total, raw on hover** | All cross-induction views use % of `_induction_max`; the published marks are always one tap away. |
| Views (chosen by Claude when asked to decide) | **Speciality × hospital heatmap, compare two choices, saved shortlist** | The shortlist later feeds the preference planner. Round-by-round seat flow is deferred. |
| Predictions | **Ranges with confidence, clearly labelled** | e.g. "likely 19.2–20.1 next round", with the method shown and a "not official" label; never a single number. |

## Admin portal

| Topic | Decision | Implies |
|---|---|---|
| Roles | **Split roles**: data editor, policy editor, verifier, moderator, owner | `user_role` grows; every data function checks a capability instead of "admin"; screens show only what the role may do. Owner manages roles. |
| Risky changes | **Preview, then publish; one-click rollback** | Activating a policy, replacing a seat matrix or a round, and deleting a round show a before/after impact preview and need an explicit Publish. |
| Admin home | **Work queues first** | Records to verify, consent changes, reports, names to map, staged imports; stats below. |
| Data intake | **Watched folder on the NAS** | Files dropped into the storage folder are validated and staged with a diff against the previous round; an admin imports with one click. Manual upload stays as a fallback. |

## Suggested order

1. ✅ **Score-first finder** with % units, heatmap, comparison and shortlist: `/portal/finder`, shortlist in `/portal/workspace`. Status per option: *Safe* if the score reaches its first-round closing, *Borderline* if it only reaches the final-round closing, *Out of reach* otherwise.
2. **Split roles + preview/publish** (foundation for safe admin work and for verifiers/moderators).
3. **Admin work-queue home + watched-folder intake.**
4. **Candidate accounts and verification**: unlocks verified posting.
5. **Community Q&A, snippets, polls, reviews, follow/inbox.**
6. **Predictions** (ranges) once two or more inductions of the same policy exist per track.
