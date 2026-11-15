import type { RawJob } from "./parse";

/**
 * Which jobs we keep (doctors only), how they are grouped into folders, and how the
 * same advert from two sources is recognised. Pure.
 */

const DOCTOR = /\b(m\.?b\.?b\.?s|b\.?d\.?s|f\.?c\.?p\.?s|m\.?c\.?p\.?s|m\.?d\b|m\.?s\b|frcs|mrcp|medical officers?|w\.?m\.?o|women medical|demonstrators?|senior registrars?|registrars?|specialists?|consultants?|(assistant|associate) professors?|professors?|house (officers?|jobs?)|trainees?|pgr|post ?graduate|fellowship|residents?|resident medical officers?|r\.?m\.?o|dental surgeons?|anaesthetists?|anesthetists?|radiologists?|surgeons?|physicians?|paediatricians?|pediatricians?|gyn(ae)?cologists?|cardiologists?|psychiatrists?|pathologists?|orthop(a)?edic)\b/i;
const NOT_DOCTOR_ONLY = /\b(nurses?|nursing|staff nurse|charge nurse|pharmacists?|technicians?|technologists?|dispensers?|ward (boy|servant)|clerks?|accountants?|drivers?|naib qasid|security|sweepers?|lab assistant|data entry|computer operator|midwi(fe|ves)|lhv|cnic)\b/i;
const HEALTH_DEPT = /(health|medical|hospital|nursing|cardiology|cancer|teaching)/i;

/** True when the advert has at least one post a doctor (MBBS/BDS and above) can apply for. */
export function isDoctorJob(j: Pick<RawJob, "title" | "education" | "vacancies" | "employer" | "source">): boolean {
  const hay = [j.title, ...j.education, ...j.vacancies].join(" · ");
  if (DOCTOR.test(hay)) return true;
  // Official health-department adverts often have a generic title ("Various posts …"): keep them unless clearly non-doctor only.
  if ((j.source === "shcme" || j.source === "pshd") && /(clinical|medical|doctor|posts)/i.test(j.title) && !NOT_DOCTOR_ONLY.test(j.title)) return true;
  if (j.source === "ppsc" && HEALTH_DEPT.test(j.employer ?? "") && !NOT_DOCTOR_ONLY.test(j.title)) return true;
  return false;
}

export type PostType = "mo" | "demonstrator" | "registrar" | "specialist" | "faculty" | "trainee" | "other";
export const POST_TYPE_LABELS: Record<PostType, string> = {
  mo: "Medical officer / WMO",
  demonstrator: "Demonstrator",
  registrar: "Senior registrar",
  specialist: "Specialist / consultant",
  faculty: "Faculty",
  trainee: "House job / trainee",
  other: "Other doctor posts",
};

export function postType(j: Pick<RawJob, "title" | "vacancies">): PostType {
  const s = [j.title, ...j.vacancies].join(" ").toLowerCase();
  if (/(assistant|associate) professor|\bprofessor\b|lecturer/.test(s)) return "faculty";
  if (/registrar/.test(s)) return "registrar";
  if (/demonstrator/.test(s)) return "demonstrator";
  if (/specialist|consultant|anaesthetist|anesthetist|radiologist|surgeon\b|physician|paediatrician|pediatrician|gyn/.test(s)) return "specialist";
  if (/house (officer|job)|trainee|pgr|post ?graduate|fellowship|training program/.test(s)) return "trainee";
  if (/medical officer|\bw\.?m\.?o\b|\bm\.?o\b|women medical|\brmo\b|resident medical/.test(s)) return "mo";
  return "other";
}

export type Folder = "ppsc" | "teaching" | "district" | "federal" | "private";
export const FOLDER_LABELS: Record<Folder, string> = {
  ppsc: "PPSC",
  teaching: "Teaching hospitals",
  district: "DHQ / THQ",
  federal: "Federal & forces",
  private: "Private & NGOs",
};

/** Which folder a job sits in, from its source and employer. */
export function folderOf(j: Pick<RawJob, "source" | "employer" | "title">): Folder {
  if (j.source === "ppsc") return "ppsc";
  if (j.source === "shcme") return "teaching";
  if (j.source === "pshd") return "district";
  const s = `${j.employer ?? ""} ${j.title}`.toLowerCase();
  if (/ppsc|public service commission/.test(s)) return "ppsc";
  if (/army|navy|air force|\bpaf\b|cmh|\bcmh\b|military|armed forces|frontier corps|rangers|federal|ministry|\bfpsc\b|nih|pims|national/.test(s)) return "federal";
  if (/dhq|thq|district|tehsil|primary (&|and) secondary|p&shd|bhu|rhc/.test(s)) return "district";
  if (/medical (college|university)|teaching|specialized healthcare|shc&me|institute of|university hospital|mayo|services hospital|jinnah hospital|general hospital|nishtar|allied hospital/.test(s)) return "teaching";
  return "private";
}

/** Words that differ between sources for the same advert are dropped before comparing. */
const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/\b(jobs?|20\d\d|advertisement|latest|vacancies|govt|government|punjab)\b/g, "").replace(/[^a-z0-9]+/g, "");

/** Same advert from two sources: same employer (loosely) and same last date. */
export function dedupeKey(j: Pick<RawJob, "employer" | "title" | "lastDate">): string | null {
  if (!j.lastDate) return null;
  const who = norm(j.employer) || norm(j.title).slice(0, 40);
  return who ? `${who}|${j.lastDate}` : null;
}

/** Merge duplicates: an official item wins (its link and badge), the other fills gaps. */
export function mergeJobs(jobs: RawJob[]): RawJob[] {
  const byKey = new Map<string, RawJob>();
  const out: RawJob[] = [];
  for (const j of jobs) {
    const k = dedupeKey(j);
    const prev = k ? byKey.get(k) : undefined;
    if (!prev) {
      if (k) byKey.set(k, j);
      out.push(j);
      continue;
    }
    const [keep, other] = prev.official || !j.official ? [prev, j] : [j, prev];
    const merged: RawJob = {
      ...keep,
      city: keep.city ?? other.city,
      postedOn: keep.postedOn ?? other.postedOn,
      education: keep.education.length ? keep.education : other.education,
      vacancies: keep.vacancies.length ? keep.vacancies : other.vacancies,
      applyOnline: keep.applyOnline ?? other.applyOnline,
      images: keep.images?.length ? keep.images : (other.images ?? keep.images),
    };
    out[out.indexOf(prev)] = merged;
    byKey.set(k!, merged);
  }
  return out;
}

export type JobState = "open" | "closing" | "closed" | "unknown";

/** Open, closing within 7 days, or closed, from the last date (dates are compared in Pakistan time). */
export function jobState(lastDate: string | null, today: string): JobState {
  if (!lastDate) return "unknown";
  if (lastDate < today) return "closed";
  const days = (Date.parse(`${lastDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000;
  return days <= 7 ? "closing" : "open";
}

/** Today's date in Pakistan (UTC+5), as YYYY-MM-DD. */
export function todayPk(now = new Date()): string {
  return new Date(now.getTime() + 5 * 3_600_000).toISOString().slice(0, 10);
}
