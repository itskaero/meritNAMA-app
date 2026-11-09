"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { fieldClass } from "@/components/ui/form";

/** "Add a poll" in the question form: a question, 2–6 options, and when it closes. Controlled so input survives a failed post. */
export function PollBuilder() {
  const [on, setOn] = useState(false);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [days, setDays] = useState("7");
  if (!on) {
    return (
      <div>
        <Button type="button" size="sm" variant="secondary" onClick={() => setOn(true)}>Add a poll</Button>
        <p className="mt-1.5 text-xs text-subtle">One question with 2 to 6 answers. Verified members vote; results show after voting.</p>
      </div>
    );
  }
  return (
    <fieldset className="grid gap-3 rounded-2xl border border-line-strong p-4">
      <legend className="px-1 text-sm font-semibold">Poll</legend>
      <input type="hidden" name="poll" value="1" />
      <label className="grid gap-1.5 text-sm font-medium">Poll question
        <input name="pollQuestion" required minLength={8} maxLength={140} value={question} onChange={(e) => setQuestion(e.target.value)} className={fieldClass} placeholder="e.g. Which round will Paediatrics close lowest?" />
      </label>
      <div className="grid gap-2">
        {options.map((o, i) => (
          <div key={i} className="flex items-center gap-2">
            <label className="sr-only" htmlFor={`poll-opt-${i}`}>Option {i + 1}</label>
            <input id={`poll-opt-${i}`} name={`option_${i}`} required={i < 2} maxLength={80} value={o} onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))} className={fieldClass} placeholder={`Option ${i + 1}`} />
            {options.length > 2 ? (
              <button type="button" onClick={() => setOptions(options.filter((_, j) => j !== i))} className="h-10 flex-none rounded-full px-3 text-xs text-muted hover:bg-hover hover:text-ink" aria-label={`Remove option ${i + 1}`}>Remove</button>
            ) : null}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="button" size="sm" variant="ghost" disabled={options.length >= 6} onClick={() => setOptions([...options, ""])}>Add an option</Button>
        <label className="flex items-center gap-2 text-sm text-muted">Closes
          <select name="closesInDays" value={days} onChange={(e) => setDays(e.target.value)} className={cn(fieldClass, "h-9 w-auto py-0")}>
            <option value="">Never</option>
            {[3, 7, 14, 30].map((d) => <option key={d} value={d}>in {d} days</option>)}
          </select>
        </label>
      </div>
      <button type="button" onClick={() => setOn(false)} className="justify-self-start text-xs text-subtle hover:text-ink">Remove the poll</button>
    </fieldset>
  );
}
