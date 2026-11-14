"use client";

import { useActionState } from "react";
import { ActionResult } from "@/components/ui/form";
import { idleState } from "@/lib/action-state";
import { postNoticeAction } from "./notices-actions";

export function PostNoticeForm() {
  const [state, action, pending] = useActionState(postNoticeAction, idleState);
  return (
    <form action={action} className="grid gap-2">
      <label className="flex flex-col gap-1.5 text-xs text-muted">Post your own
        <input name="text" required maxLength={160} placeholder="e.g. PHF portal is down for maintenance tonight" className="h-[38px] rounded-[10px] border border-white/[.14] bg-[#141418] px-2.5 text-[13px] text-[#ECECF1] outline-none placeholder:text-subtle focus:border-[rgba(155,135,255,.7)]" />
      </label>
      <div className="flex flex-wrap items-start gap-2">
      <details className="group open:order-last open:w-full">
        <summary className="inline-flex h-[34px] cursor-pointer list-none items-center rounded-xl border border-white/[.14] px-3.5 text-[13px] text-[#ECECF1] group-open:border-[rgba(155,135,255,.6)] [&::-webkit-details-marker]:hidden">Link · until · who</summary>
        <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
          <label className="mn-lbl sm:col-span-2">Link (optional)<input name="href" maxLength={300} placeholder="/portal/… or https://…" className="h-8 rounded-[9px] border border-white/10 bg-[#141418] px-2 text-xs normal-case tracking-normal text-[#ECECF1]" /></label>
          <label className="mn-lbl">Show for<select name="days" defaultValue="3">{[1, 2, 3, 7, 14, 30].map((d) => <option key={d} value={d}>{d} day{d === 1 ? "" : "s"}</option>)}</select></label>
          <label className="mn-lbl">Colour<select name="tone" defaultValue="info"><option value="info">Information (cyan)</option><option value="warning">Deadline or warning (amber)</option><option value="highlight">Good news (violet)</option></select></label>
          <label className="mn-lbl sm:col-span-2">Who sees it<select name="audience" defaultValue="all"><option value="all">Everyone</option><option value="members">Signed-in members only</option></select></label>
        </div>
      </details>
      <button type="submit" disabled={pending} className="mn-btn h-[34px] rounded-xl px-3.5 text-[13px] font-semibold disabled:opacity-60">{pending ? "Posting…" : "Post"}</button>
      </div>
      <ActionResult state={state} />
    </form>
  );
}
