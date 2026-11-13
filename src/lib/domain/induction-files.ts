import { z } from "zod";

/**
 * PHF files about an induction beyond the merit lists: the schedule (dated steps), the
 * amendment revisions, and joining status. Pure parsers that keep only what the app
 * uses: names, emails, phone numbers, CNICs and job details in these files are never read.
 */

const num = z.union([z.number(), z.string().regex(/^-?\d+(\.\d+)?$/).transform(Number)]);
const when = (v: unknown) => {
  if (typeof v !== "string" || !v.trim()) return null;
  const t = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(v) ? v : `${v}+05:00`); // PHF times are Pakistan time
  return Number.isNaN(t) ? null : new Date(t);
};

// ── Schedule ───────────────────────────────────────────────────────────────────

export const scheduleFileSchema = z.looseObject({
  induction: num.optional(),
  updated: z.string().optional(),
  steps: z.array(z.looseObject({
    stepId: num,
    sortOrder: num.optional(),
    title: z.string().trim().min(1).max(200),
    detail: z.string().nullish(),
    statusId: num.nullish(),
    startDate: z.string().nullish(),
    endDate: z.string().nullish(),
  })).min(1, "the schedule has no steps"),
});

export type ScheduleStep = { stepId: number; sortOrder: number; title: string; detail: string | null; statusId: number | null; startsAt: Date | null; endsAt: Date | null };

export function parseSchedule(file: unknown): { induction: number | null; steps: ScheduleStep[] } {
  const f = scheduleFileSchema.parse(file);
  const steps = f.steps.map((s) => ({
    stepId: s.stepId,
    sortOrder: s.sortOrder ?? s.stepId,
    title: s.title.replace(/\s+/g, " "),
    detail: s.detail?.trim().slice(0, 200) || null,
    statusId: s.statusId ?? null,
    startsAt: when(s.startDate),
    endsAt: when(s.endDate),
  }));
  steps.sort((a, b) => a.sortOrder - b.sortOrder || a.stepId - b.stepId);
  return { induction: f.induction ?? null, steps };
}

// ── Joining status ─────────────────────────────────────────────────────────────

export const joiningFileSchema = z.array(z.looseObject({
  applicantId: num,
  typeName: z.string().trim().min(1),
  quotaName: z.string().nullish(),
  specialityName: z.string().nullish(),
  hospitalName: z.string().nullish(),
  status: z.string().trim().min(1),
  joiningDate: z.string().nullish(),
})).min(1, "the joining file has no rows");

export type JoiningRow = { applicantId: string; program: string; quota: string | null; speciality: string | null; hospital: string | null; status: "joined" | "pending" | "not_joined"; joinedOn: string | null };

const ddmmyyyy = (v: string | null | undefined) => {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v?.trim() ?? "");
  return m ? `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}` : null;
};
const clean = (v: string | null | undefined, max = 160) => (v ?? "").replace(/\s+/g, " ").trim().slice(0, max) || null;

/** Seat and joining status per applicant and programme. Personal fields in the file are not read. */
export function parseJoining(file: unknown): JoiningRow[] {
  const rows = joiningFileSchema.parse(file);
  const out = new Map<string, JoiningRow>();
  for (const r of rows) {
    const s = r.status.toLowerCase();
    const row: JoiningRow = {
      applicantId: String(r.applicantId),
      program: r.typeName.replace(/\s+/g, " ").trim(),
      quota: clean(r.quotaName, 80),
      speciality: clean(r.specialityName),
      hospital: clean(r.hospitalName, 200),
      status: s.startsWith("join") ? "joined" : s.startsWith("pend") ? "pending" : "not_joined",
      joinedOn: ddmmyyyy(r.joiningDate),
    };
    out.set(`${row.applicantId}|${row.program}`, row);
  }
  return [...out.values()];
}

// ── Revisions (amendments) ─────────────────────────────────────────────────────

/** { "<applicantId>": { "amendment_1": { programMarks?: {MD: 5}, degree?: 10.7, _timestamp }, … } } */
export const revisionsFileSchema = z.record(z.string().regex(/^\d{1,10}$/), z.record(z.string(), z.looseObject({ _timestamp: z.string().optional() })));

export type RevisionChange = { applicantId: string; field: "program_marks" | "parameter"; program: string; value: number; at: string | null };

/**
 * The final value of every amended mark: later amendments win. Programme marks become
 * "program_marks" corrections; other numbers (degree, matric, fsc …) "parameter" ones.
 */
export function parseRevisions(file: unknown): RevisionChange[] {
  const f = revisionsFileSchema.parse(file);
  const out = new Map<string, RevisionChange>();
  for (const [applicantId, amendments] of Object.entries(f)) {
    const ordered = Object.entries(amendments).sort(([ka, a], [kb, b]) => String(a._timestamp ?? "").localeCompare(String(b._timestamp ?? "")) || ka.localeCompare(kb));
    for (const [, a] of ordered) {
      const at = typeof a._timestamp === "string" ? a._timestamp : null;
      for (const [key, value] of Object.entries(a)) {
        if (key === "_timestamp") continue;
        if (key === "programMarks" && value && typeof value === "object") {
          for (const [program, v] of Object.entries(value as Record<string, unknown>)) {
            if (typeof v === "number" && Number.isFinite(v)) out.set(`${applicantId}|p|${program}`, { applicantId, field: "program_marks", program: program.trim(), value: v, at });
          }
        } else if (typeof value === "number" && Number.isFinite(value)) {
          out.set(`${applicantId}|x|${key}`, { applicantId, field: "parameter", program: key, value, at });
        }
      }
    }
  }
  return [...out.values()];
}
