# Information architecture (candidate portal)

Who it is for: doctors applying for FCPS, MS, MD and MDS training. Many are not
comfortable with technology. They want answers to a few questions, quickly, often on a
phone, during a stressful week. Navigation is shaped around those questions, not around
the data model.

## What the previous site had

The old site (static pages on GitHub Pages) had about 25 tabs spread over six pages:

| Page | Tabs and content |
| --- | --- |
| `app.html` | Start Here, Merit Table, Previous Merit Lists, Calculator, My Prediction, Policy, Compare, Jobs, Guide |
| `simulation.html` ("Induction Portal") | Candidate Pool (find yourself), Where Merit Falls, Seat Allocation, Consent What-If, Training Seats, Schedule, Competition, Profiles, Hospitals, Live Chat, Joining Status, Guide ("I want to…"), Config |
| `candidate.html` | Profile and personal dashboard |
| Others | Hospitals, accreditation, discussion, community feed, editorial, donate |

What worked, and is kept:

- **Find yourself by applicant ID.** The most-used feature: type a number, see every
  list you are in.
- **Estimated lists from the gazette** before PHF's, and **what-if consent** on anyone.
- **"I want to…" entry points** in the Guide.
- **Calculator and prediction** next to each other.
- **Hospital pages** with seats and closing merit.

What did not work:

- The same thing lived in several places (two guides, two hospital views, merit table
  vs previous lists vs where merit falls).
- Tabs were named after the data ("Candidate Pool", "Seat Allocation", "Competition")
  rather than what a person wants.
- No sense of where you are; on a phone the tab strips scrolled off screen.

## The new map

Six plain-language sections, then the personal ones. The phone has its own five tabs (see
[v3 changes](#v3-changes)).

| Menu | Phone tab | What it answers | Old tabs it replaces |
| --- | --- | --- | --- |
| **Home** | Home | "What do you want to do?" task cards, then my merit at a glance | Start Here, candidate dashboard |
| **Merit lists** | Lists | Every official and estimated list; **Find yourself, or anyone** by ID | Merit Table, Previous Merit Lists, Candidate Pool, Where Merit Falls, Seat Allocation |
| **My chances** | Chances | Three tabs: Where can I go? · Calculate my marks · My preference list | Calculator, My Prediction, Compare |
| **Hospitals** | (menu) | Seats, closing merit by round, accreditation, reviews | Hospitals, Training Seats, accreditation |
| **What if** | What if | Change anyone's consent on a private copy and see the next list | Consent What-If |
| **Ask & chat** | Ask | Questions and the chat room of each round | Live Chat, discussion, community feed |
| My record · Saved · Inbox · Help | (menu) | Linked applicant record, saved seats, notices, the guide and glossary | Profile, Guide, Policy |

Rules this map follows:

- **Name sections after the question**, in words a doctor uses ("My chances", not
  "Score finder").
- **One place for each thing.** Calculator and preference list live inside My chances
  (as tabs), so the menu stays short; the sidebar still highlights My chances there.
- **Every page answers in its first screen**; the detail sits below.
- **Applicant IDs, never names.** Lists show applicant IDs, marks and seats only.
- **Help is one click away** from Home ("New here? Read the 2-minute guide") and the
  menu, with a glossary of every term the app uses.

## v3 changes

Candidate portal:

- **Phone tabs** are Home · Lists · Chances · Chats · Me. *What if* stays in the menu, and Ask sits
  in the menu next to the new Feed.
- **Feed** (`/portal/feed`): what happened lately, newest first: new merit lists (the round-day posts)
  and community questions and answers, with a filter. It stores nothing of its own.
- **Chats** (`/portal/chats`): group chats and one-to-one messages, live over a server-sent stream
  with a polling fallback. Round rooms stay on each round's page. Members can block, mute, report, and
  turn off new one-to-one chats; a blocked person is never told.
- **Me** (`/portal/workspace`, formerly "Saved"): a left rail (My seat, My journey, Shortlist, Saved
  views, Following, Alerts), the latest seat as a graph (preference, seat, how close), and a
  vertical journey timeline of rounds, consent replies and notices.
- **Your data** (`/portal/account`, linked from the privacy page): download everything stored
  about the account, or delete it.
- **Public pages**: `/privacy`, `/terms`, `/contact`, linked from the landing and sign-in pages.
- **Sign-in** shows *Request access* while the paywall is on (see `/admin/access`), else the email link.

Admin workspace, grouped by module (`src/lib/navigation.ts`):

| Group | Pages |
| --- | --- |
| Today | Overview |
| Data | **Data** (drop files or a folder, GitHub sync, checklist), Inductions & merit lists*, Reference data* |
| People | Candidates, **Access** (paywall requests), Team & roles |
| Community | Moderation |
| Advanced | Scoring policies*, Allocation rules*, Processing & simulation*, Changes to review*, Audit history* |

\* Pro mode only. **Simple mode** (the default) shows a short menu and an **Advanced** page
(`/admin/advanced`) that links to the starred pages; **Pro mode** lists them all in the menu. The pages
and URLs are the same in both.

## Not ported yet

From the old site, in a suggested order:

1. **Schedule**: the induction's dates (applications, gazette, each round, joining) on
   one timeline. Partly on Home already.
2. **Competition**: how many applied per speciality and quota, against seats.
3. **Joining status**: who joined after the final round.
4. **Jobs** and **editorial** pages, and a **donate** link.
