import Link from "next/link";
import { AreaPage } from "@/components/area-page";
import { listFeed } from "@/lib/data/feed";
import { ThreadList } from "@/components/community/thread-list";
import { whenDatabaseDown } from "@/components/database-unavailable";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { getSession } from "@/lib/auth/session";
import { communityStats, describeTopics, getMyProfile, listThreads } from "@/lib/data/community";
import { getDb } from "@/lib/db/client";
import { parseTopicParam, topicParam } from "@/lib/domain/topic-param";
import { findSection } from "@/lib/navigation";
import { FollowButton } from "@/components/community/follow-button";
import { isFollowing } from "@/lib/data/notifications";
import { THREAD_FILTERS, type ThreadFilter } from "@/lib/domain/community";
import { DisplayNameForm } from "./forms";
import { roomPulse } from "@/lib/data/rooms";
import { myReputation, socialPrefs } from "@/lib/data/social";
import { REPUTATION } from "@/lib/domain/social";
import { RepBadge } from "@/components/community/rep-badge";
import { SocialPrefs } from "@/components/rooms/social-prefs";
import { RoomPulseList } from "@/components/rooms/room-pulse";

export const metadata = { title: "Community" };
export const dynamic = "force-dynamic";

export default async function CommunityPage({ searchParams }: { searchParams: Promise<{ topic?: string; sort?: string; show?: string; tab?: string; q?: string }> }) {
  const s = findSection("/portal/community");
  const down = await whenDatabaseDown({ area: "portal", trail: [{ label: s.label }], title: s.label, description: s.description });
  if (down) return down;const sp = await searchParams;
  const topic = parseTopicParam(sp.topic);
  const sort = sp.sort === "helpful" ? "helpful" : "active";
  const show: ThreadFilter = (THREAD_FILTERS as readonly string[]).includes(sp.show ?? "") ? (sp.show as ThreadFilter) : "all";
  const db = getDb();
  const session = await getSession();
  const [threads, stats, me, topicInfo, rep, prefs, pulse] = await Promise.all([
    listThreads(db, session, { topic: topic ?? undefined, sort, filter: show }),
    communityStats(db, session),
    getMyProfile(db, session),
    topic ? describeTopics(db, [topic]) : Promise.resolve(null),
    myReputation(db, session),
    socialPrefs(db, session),
    roomPulse(db, session, { limit: 4 }),
  ]);
  const about = topic ? topicInfo?.get(`${topic.kind}:${topic.key}`) : null;
  const qs = (o: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(o)) if (v) p.set(k, v);
    const str = p.toString();
    return str ? `?${str}` : "";
  };
  const topicQ = topic ? topicParam(topic) : undefined;
  const followTarget = topic && topic.kind !== "general" ? { kind: topic.kind, key: topic.key } : null;
  const following = followTarget ? await isFollowing(db, session, followTarget) : false;

  const tab = sp.tab === "questions" || sp.tab === "rooms" ? sp.tab : topic || sp.sort || sp.show ? "questions" : "feed";
  const q = (sp.q ?? "").replace(/\s+/g, " ").trim().slice(0, 60).toLowerCase();
  const [feed, top, answered] = await Promise.all([
    tab === "feed" ? listFeed(db, session, { limit: 8 }).catch(() => []) : Promise.resolve([]),
    listThreads(db, session, { sort: "helpful", limit: 3 }).catch(() => []),
    listThreads(db, session, { filter: "answered", limit: 200 }).catch(() => []),
  ]);
  const shown = q ? threads.filter((t) => t.title.toLowerCase().includes(q)) : threads;
  const nowMs = new Date().getTime();
  const ago = (iso: string) => {
    const h = Math.round((nowMs - Date.parse(iso)) / 3_600_000);
    return h < 1 ? "just now" : h < 36 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
  };
  const tabHref = (t: string) => `/portal/community${qs({ topic: topicQ, tab: t === "feed" && !topic ? undefined : t })}`;
  const answeredPct = stats.threads ? Math.round((answered.length / stats.threads) * 100) : null;
  const room = pulse.rooms[0];

  return (
    <AreaPage
      area="portal"
      trail={about ? [{ label: s.label, href: "/portal/community" }, { label: about.label }] : [{ label: s.label }]}
      title={about ? `Questions: ${about.label}` : s.label}
      description={s.description}
      bare
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-lg">{about ? <><Link href="/portal/community" className="text-muted hover:text-ink">Community</Link> <span className="text-muted">/</span> <span className="font-semibold">{about.label}</span></> : <span className="font-semibold">Community</span>}</p>
        <form method="get" action="/portal/community" role="search" className="flex h-9 w-60 items-center gap-2 rounded-[10px] bg-[#17171A] px-3 text-muted">
          <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          {topicQ ? <input type="hidden" name="topic" value={topicQ} /> : null}
          <input type="hidden" name="tab" value="questions" />
          <input name="q" defaultValue={sp.q ?? ""} aria-label="Search questions" placeholder="search" className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none" />
        </form>
      </header>

      <section aria-label={about ? about.label : "Community"} className="relative h-[230px] overflow-hidden rounded-[18px] shadow-[0_20px_50px_rgba(0,0,0,.5),0_0_0_1px_rgba(255,255,255,.06)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/v4/library-group.jpg" alt="Doctors studying together in a library" className="h-full w-full object-cover [object-position:center_40%]" />
        <div aria-hidden className="absolute inset-0 [background:linear-gradient(90deg,rgba(12,12,14,.85)_0%,rgba(12,12,14,.25)_55%,rgba(110,86,255,.15)_100%)]" />
        <div className="absolute bottom-6 left-7 right-44 text-[#F3EEE5]">
          <p className="flex items-center gap-2 text-xs text-[#F3EEE5]/80"><span className="mn-live h-2 w-2 rounded-full bg-[#3DDC97] shadow-[0_0_10px_#3DDC97]" />{stats.threads.toLocaleString("en-US")} questions · {stats.replies.toLocaleString("en-US")} answers</p>
          <h1 className="mt-1.5 text-[30px] font-bold tracking-[-0.02em]">{about ? about.label : "Community"}</h1>
        </div>
        <div className="absolute bottom-6 right-6"><Link href={`/portal/community/new${qs({ topic: topicQ })}`} className="mn-btn inline-flex h-11 items-center rounded-xl px-5 font-semibold">Ask a question</Link></div>
      </section>

      <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_300px]">
        <section aria-label="Activity" className="min-w-0">
          <nav aria-label="Community" className="flex flex-wrap gap-1.5">
            <Link href={tabHref("feed")} aria-current={tab === "feed" ? "page" : undefined} className="mn-tab">Feed</Link>
            <Link href={tabHref("questions")} aria-current={tab === "questions" ? "page" : undefined} className="mn-tab">Questions</Link>
            <Link href={tabHref("rooms")} aria-current={tab === "rooms" ? "page" : undefined} className="mn-tab">Round rooms</Link>
          </nav>

          {tab === "feed" ? (
            <>
              <div className="mt-3">
                {feed.length ? feed.map((f) => (
                  <Link key={f.id} href={f.href} className="flex items-center gap-3 rounded-xl border-b border-white/5 px-2.5 py-3 text-sm hover:bg-[rgba(110,86,255,.08)]">
                    {f.type === "round_day" ? <span className="mn-ico bg-[rgba(61,220,151,.18)] text-[#3DDC97]">✓</span> : f.type === "answered" ? <span className="mn-ico bg-[rgba(92,225,230,.16)] text-[#5CE1E6]">✓</span> : <span className="mn-ico bg-[rgba(155,135,255,.18)] text-[#B9AAFF]">?</span>}
                    <span className="min-w-0 flex-1 truncate">{f.type === "round_day" ? <><b>Round {f.roundNo} is out</b> · {f.body.replace(/^Round \d+ is out:\s*/i, "")}</> : <><b>{f.author ?? "Someone"}</b> {f.type === "answered" ? "got an answer:" : "asked:"} {f.title}</>}</span>
                    <span className="flex-none text-xs text-muted">{f.type === "round_day" ? "List" : `${f.replies} answer${f.replies === 1 ? "" : "s"}`} · {ago(f.at)}</span>
                  </Link>
                )) : <p className="px-2.5 py-6 text-sm text-muted">Nothing yet. New lists and questions show here.</p>}
              </div>
              {top.length ? (
                <>
                  <h2 className="mb-1 mt-6 text-base font-semibold">Top questions</h2>
                  {top.map((t) => (
                    <Link key={t.id} href={`/portal/community/${t.id}`} className="flex gap-3.5 rounded-xl border-b border-white/5 px-2.5 py-3.5 last:border-0 hover:bg-white/[.03]">
                      <div className="mn-vote"><b>{t.helpful}</b><span className="block text-[10px] text-muted">votes</span></div>
                      <div className="min-w-0 flex-1"><p className="font-semibold">{t.title}</p><p className="mt-1 text-xs text-muted">{t.answered ? <span className="text-[#3DDC97]">✓ Answered{t.authorIsTeam ? " by the team" : ""} · </span> : null}{t.replies} answer{t.replies === 1 ? "" : "s"}</p></div>
                    </Link>
                  ))}
                </>
              ) : null}
            </>
          ) : tab === "questions" ? (
            <div className="mt-3 grid gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <nav aria-label="Sort discussions" className="mn-seg">
                  {(["active", "helpful"] as const).map((k) => <Link key={k} href={`/portal/community${qs({ topic: topicQ, tab: "questions", sort: k === "active" ? undefined : k, show: show === "all" ? undefined : show })}`} aria-current={sort === k ? "page" : undefined}>{k === "active" ? "Latest activity" : "Most helpful"}</Link>)}
                </nav>
                <nav aria-label="Show questions" className="mn-seg">
                  {THREAD_FILTERS.map((k) => <Link key={k} href={`/portal/community${qs({ topic: topicQ, tab: "questions", sort: sort === "active" ? undefined : sort, show: k === "all" ? undefined : k })}`} aria-current={show === k ? "page" : undefined} className="capitalize">{k}</Link>)}
                </nav>
                <div className="flex flex-wrap gap-2">
                  {about ? <Link href="/portal/community?tab=questions" className="mn-ob">All topics</Link> : null}
                  {about?.href ? <Link href={about.href} className="mn-ob">Open {about.label}</Link> : null}
                  {followTarget ? <FollowButton target={followTarget} following={following} path="/portal/community" label={`Follow ${about?.label ?? "topic"}`} /> : null}
                </div>
              </div>
              {shown.length ? <ThreadList threads={shown} showTopic={!topic} /> : (
                <EmptyState title={q ? "No question matches" : show === "all" ? "No questions yet" : `No ${show} questions`} action={<ButtonLink href={`/portal/community/new${qs({ topic: topicQ })}`}>Ask a question</ButtonLink>}>
                  Ask about closing merit, a hospital or a speciality. Others who went through the same rounds can answer.
                </EmptyState>
              )}
            </div>
          ) : (
            <div className="mt-3"><RoomPulseList rooms={pulse.rooms} /></div>
          )}
        </section>

        <aside aria-label="About this community" className="grid gap-3.5">
          <div>
            <h2 className="text-[17px] font-semibold">{about ? about.label : "meritNAMA community"}</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-muted">{about ? "Questions and answers on this topic, from people going through the same rounds." : "Doctors applying to Punjab's postgraduate training: closing merit, hospital reviews, consent questions and round-day nerves."}</p>
            <p className="mt-3 flex gap-1.5"><span className="mn-pill n">◉ Members</span><span className="mn-pill g">✓ Verified answers</span></p>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-[#17171A] p-3.5"><span className="text-xl font-bold">{stats.threads.toLocaleString("en-US")} <span className="text-xs font-medium text-muted">questions</span></span><span className="text-xs text-[#3DDC97]">{stats.replies.toLocaleString("en-US")} answers</span></div>
          <div className="border-t border-white/[.06] pt-1.5 text-[13px]">
            <div className="flex items-center justify-between py-2"><span className="text-muted">Answered</span><span className="text-[#3DDC97]">{answeredPct != null ? `${answeredPct}%` : "—"}</span></div>
            <div className="flex items-center justify-between py-2"><span className="text-muted">Round room</span>{room ? <Link href={`/portal/history/${room.induction}/rounds/${room.roundNo}#room`} className="text-[#FF6B6B]">● Round {room.roundNo}</Link> : <span className="text-muted">—</span>}</div>
            <div className="flex items-center justify-between py-2"><span className="text-muted">Your reputation</span><span className="flex items-center gap-1.5">{rep.points} <RepBadge level={rep.level.label} /></span></div>
          </div>
          <div className="grid grid-cols-2 gap-2.5"><Link href="/portal/chats" className="mn-ob">Open chats</Link><Link href={`/portal/community/new${qs({ topic: topicQ })}`} className="mn-ob">Ask</Link></div>
          <details className="mn-card-glass rounded-[20px] border border-line p-4">
            <summary className="cursor-pointer text-[13px] font-semibold">You · {me.displayName}</summary>
            <div className="mt-3 grid gap-4">
              <DisplayNameForm current={me.displayName ?? ""} />
              <p className="text-xs text-muted">{rep.next ? `${rep.next.needed} to ${rep.next.level.label}. ` : "The top level. "}{REPUTATION.accepted} for an accepted answer, {REPUTATION.helpful} for each helpful vote from a verified member.</p>
              <SocialPrefs showBand={prefs.showBand} peerCounted={prefs.peerCounted} />
            </div>
          </details>
          <details className="mn-card-glass rounded-[20px] border border-line p-4">
            <summary className="cursor-pointer text-[13px] font-semibold">House rules</summary>
            <ul className="mt-3 grid list-disc gap-1.5 pl-5 text-xs text-muted">
              <li>Search before asking; duplicates are linked to the original.</li>
              <li>Be kind; everyone here is going through the same process.</li>
              <li>Accept the answer that helped, so it shows first for the next person.</li>
              <li>No CNIC, phone numbers or email addresses. Posts with them are refused.</li>
              <li>Say where a number comes from (round, quota, programme).</li>
              <li>meritNAMA is not an official admissions authority.</li>
            </ul>
          </details>
        </aside>
      </div>
    </AreaPage>
  );
}
