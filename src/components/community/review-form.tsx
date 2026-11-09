"use client";

import { useActionState, useState } from "react";
import { saveReviewAction } from "@/app/portal/explore/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { ActionResult, Field, fieldClass } from "@/components/ui/form";
import { idleState } from "@/lib/action-state";
import { REVIEW_DIMENSIONS, type ReviewDimension } from "@/lib/domain/community";

type Existing = { specialityId: number | null; induction: number; body: string } & Record<ReviewDimension, number>;

/** Write or edit your review: speciality, induction, four 1–5 ratings, and a short text. */
export function ReviewForm({ hospitalId, specialities, inductions, existing, defaultSpecialityId }: {
  hospitalId: number;
  specialities: { id: number; name: string }[];
  inductions: number[];
  existing: Existing | null;
  defaultSpecialityId?: number | null;
}) {
  const [state, action, pending] = useActionState(saveReviewAction, idleState);
  const [spec, setSpec] = useState(String(existing?.specialityId ?? defaultSpecialityId ?? ""));
  const [ind, setInd] = useState(String(existing?.induction ?? inductions[0] ?? ""));
  const [ratings, setRatings] = useState<Record<ReviewDimension, number>>({
    training: existing?.training ?? 0, workload: existing?.workload ?? 0, hostel: existing?.hostel ?? 0, stipend: existing?.stipend ?? 0,
  });
  const [body, setBody] = useState(existing?.body ?? "");
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="hospitalId" value={hospitalId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Speciality">
          {(id) => (
            <select id={id} name="specialityId" value={spec} onChange={(e) => setSpec(e.target.value)} className={fieldClass}>
              <option value="">Whole hospital</option>
              {specialities.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
        </Field>
        <Field label="Your induction">
          {(id) => (
            <select id={id} name="induction" value={ind} onChange={(e) => setInd(e.target.value)} className={fieldClass}>
              {inductions.map((n) => <option key={n} value={n}>Induction {n}</option>)}
            </select>
          )}
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {REVIEW_DIMENSIONS.map((d) => (
          <fieldset key={d.key} className="grid gap-1.5">
            <legend className="mb-1.5 text-sm font-medium">{d.label}</legend>
            <input type="hidden" name={d.key} value={ratings[d.key] || ""} />
            <div className="grid grid-cols-5 gap-1" role="radiogroup" aria-label={d.label}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={ratings[d.key] === n}
                  aria-label={`${n} of 5`}
                  onClick={() => setRatings({ ...ratings, [d.key]: n })}
                  className={cn(
                    "h-9 rounded-lg border font-mono text-sm font-semibold transition-colors",
                    n <= ratings[d.key] ? "border-signal/60 bg-signal/20 text-ink" : "border-line text-muted hover:border-line-strong",
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
            <span className="flex justify-between text-[0.7rem] text-subtle"><span>{d.low}</span><span>{d.high}</span></span>
          </fieldset>
        ))}
      </div>
      <Field label="Your review" hint={`${body.trim().length}/2000 · what would you tell someone choosing this place? No names, phone numbers or emails.`}>
        {(id) => <textarea id={id} name="body" required minLength={20} maxLength={2000} rows={5} value={body} onChange={(e) => setBody(e.target.value)} className={cn(fieldClass, "leading-relaxed")} />}
      </Field>
      <div><Button type="submit" disabled={pending}>{pending ? "Saving…" : existing ? "Update my review" : "Post review"}</Button></div>
      <ActionResult state={state} />
    </form>
  );
}
