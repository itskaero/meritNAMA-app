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
2. ✅ **Split roles + preview/publish.** Roles map to capabilities (`src/lib/auth/roles.ts`); owners manage them on Team & roles. Replacing a seat matrix or merit round, removing a round, activating a policy and re-importing the policy file are staged at `/admin/changes` with a before/after preview; publishing is refused if the data changed since the preview, and keeps a snapshot for rollback. First-time imports apply directly.
3. ✅ **Admin work-queue home + watched-folder intake.** The admin home opens with queues for the person's role (changes to review, files in the inbox, names to map, reports, policy and seat-matrix gaps). `storage/inbox/{merit,seats,policy}` on the NAS is listed with validation; Import applies new data or stages replacements; files move to `inbox/processed`.
4. ✅ **Candidate accounts and verification.** Email one-time-link sign-in (`/sign-in`); `OWNER_EMAILS` bootstraps owners. Merit imports keep HMACs of each applicant's email and PMDC number; a sign-in email that matches links the record automatically, otherwise the candidate sends applicant ID + PMDC number + proof and a verifier decides at `/admin/candidates`. Verified candidates see *My merit* on `/portal/profile`, get their marks filled in on the finder, can post in the community and carry a *Verified* badge.
5. **Community.**
   - ✅ **5a: Q&A, merit cards, follow + inbox.** Questions have accepted answers (asker or moderator; the accepted answer leads, answered questions rank first, filters for answered/unanswered); moderators close duplicates with a link to the original. A post can carry a live merit card (programme, quota, speciality, hospital in one round) whose closing/opening merit, % of total, seats and change since the previous round are read from the database. Members follow inductions, rounds, specialities, hospitals and questions (asking or answering follows automatically); new answers, accepted answers, new questions and new rounds arrive in the in-app inbox (bell in the header, `/portal/inbox`). No email.
   - **5b: polls, and hospital/speciality reviews** (any verified candidate may review).
6. **Predictions** (ranges) once two or more inductions of the same policy exist per track.

## Merit visuals (Nov 2026, from the concepts page)

Built one by one from the concepts the owner approved. Real data only; aggregates only.

| Visual | What it shows | Where |
|---|---|---|
| Round funnel ("Who is still moving") | Candidates not yet in the seat they keep in the final round, narrowing to 0; entered / moved / left per round | Dashboard; induction page (by programme·quota) |
| Cycle progress gauge | Segmented arc filled to today against the cycle's published dates; rounds in order; next round as an estimate | Dashboard; induction page |
| Split sign-in | Teal steps panel with Google (optional) or a one-time email link | `/sign-in`, `/auth/verify` |
| Merit ladder | Glowing segments per speciality, closing % by round; ember = ground lost since R1 | Induction page; speciality page (per programme·quota) |
| Where merit moved | Heat grid of round-to-round changes in closing merit | Induction page |
| Seat flow | Accepted vs released seats per round | Induction page (six largest); speciality page; finder hint on Borderline options |
| Your chance dial | Safe / Borderline / Out of reach arc for one option with the score as a needle | Finder comparison cards; shortlist in the workspace (verified or typed marks) |
