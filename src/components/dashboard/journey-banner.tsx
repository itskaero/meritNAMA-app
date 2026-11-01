import Image from "next/image";
import campus from "@/assets/journey/campus.jpg";
import { Icon, type IconName } from "../icon";

const stages: { label: string; icon: IconName }[] = [
  { label: "Preparation", icon: "books" },
  { label: "Induction", icon: "clipboard" },
  { label: "Training", icon: "stethoscope" },
  { label: "Specialist", icon: "award" },
];

/**
 * "Your PG Journey" banner. The current stage is only highlighted once it is known
 * from a linked candidate record — until then every stage is shown as neutral.
 */
export function JourneyBanner({ current }: { current: number | null }) {
  return (
    <section aria-labelledby="journey-banner" className="relative isolate overflow-hidden rounded-[1.75rem] border border-white/10">
      <Image src={campus} alt="" fill placeholder="blur" sizes="(min-width: 1024px) 70vw, 100vw" className="-z-20 object-cover object-[50%_60%]" />
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-canvas/95 via-canvas/70 to-canvas/10" />
      <div className="flex flex-col gap-8 p-6 sm:p-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-md">
          <p className="font-mono text-[0.68rem] font-semibold uppercase tracking-[0.26em] text-amber">Postgraduate training</p>
          <h2 id="journey-banner" className="mt-2 font-serif text-4xl leading-none tracking-tight sm:text-5xl">
            Your PG Journey
          </h2>
          <p className="mt-3 text-sm text-muted">Track, plan and make informed decisions for your postgraduate training.</p>
        </div>
        <ol className="grid grid-cols-4 gap-2 sm:gap-3" aria-label="Journey stages">
          {stages.map((s, i) => {
            const state = current === null ? "unknown" : i < current ? "done" : i === current ? "current" : "next";
            return (
              <li key={s.label} className="flex flex-col items-center gap-2 text-center" aria-current={state === "current" ? "step" : undefined}>
                <span
                  className={
                    state === "current"
                      ? "grid h-11 w-11 place-items-center rounded-full bg-ink text-canvas shadow-glow"
                      : state === "done"
                        ? "grid h-11 w-11 place-items-center rounded-full bg-signal/20 text-signal-strong ring-1 ring-signal/40"
                        : "grid h-11 w-11 place-items-center rounded-full bg-canvas/60 text-muted ring-1 ring-white/15 backdrop-blur"
                  }
                >
                  <Icon name={s.icon} className="h-5 w-5" />
                </span>
                <span className="rounded-full bg-canvas/60 px-2 py-0.5 text-[0.7rem] font-medium text-ink backdrop-blur">{s.label}</span>
              </li>
            );
          })}
        </ol>
      </div>
      {current === null ? (
        <p className="border-t border-white/10 bg-canvas/50 px-6 py-2.5 text-xs text-subtle backdrop-blur sm:px-8">
          Your stage appears here once your candidate record is linked.
        </p>
      ) : null}
    </section>
  );
}
