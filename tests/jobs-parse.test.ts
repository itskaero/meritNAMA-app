import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isJobzAdvertImage, jobzToRaw, parseDate, parseJobzDetail, parseJobzList, parsePpsc, parsePshd, parseShcme } from "@/lib/jobs/parse";
import { dedupeKey, folderOf, isDoctorJob, jobState, mergeJobs, postType, todayPk, type Folder } from "@/lib/jobs/rules";

const fx = (name: string) => readFileSync(`tests/fixtures/jobs/${name}`, "utf8");

describe("job dates", () => {
  it("reads every format the sources use", () => {
    expect(parseDate("12-Nov-2026")).toBe("2026-11-12");
    expect(parseDate("30 November, 2026 or as per paper ad")).toBe("2026-11-30");
    expect(parseDate("13.11.2026")).toBe("2026-11-13");
    expect(parseDate("26/11/2026")).toBe("2026-11-26");
    expect(parseDate("30-11-2026")).toBe("2026-11-30");
    expect(parseDate("as per paper ad")).toBeNull();
  });
});

describe("jobz.pk (saved pages)", () => {
  it("lists adverts with id, title, city and date", () => {
    const list = parseJobzList(fx("jobzpk-list.html"));
    expect(list.length).toBeGreaterThan(10);
    expect(list[0]).toMatchObject({ id: "788080", title: "Specialized Healthcare & Medical Education Department Jobs", city: "Lahore", postedOn: "2026-11-12" });
    expect(list.every((j) => /^\d+$/.test(j.id) && j.link.startsWith("https://www.jobz.pk/"))).toBe(true);
  });

  it("reads a detail page: employer, education, last date, vacancies", () => {
    const d = parseJobzDetail(fx("jobzpk-detail.html"));
    expect(d).toMatchObject({ organization: "Specialized Healthcare & Medical Education Department", education: ["MBBS"], lastDate: "2026-11-30" });
    expect(d.vacancies).toEqual(expect.arrayContaining(["Training Program", "Second Fellowship Program"]));
    const raw = jobzToRaw(parseJobzList(fx("jobzpk-list.html"))[0]!, d);
    expect(isDoctorJob(raw)).toBe(true);
    expect(folderOf(raw)).toBe("teaching");
    expect(postType(raw)).toBe("trainee");
  });

  it("keeps the advert scan and nothing else from the page's pictures", () => {
    const d = parseJobzDetail(fx("jobzpk-detail.html"));
    expect(d.images).toEqual(["https://www.jobz.pk/images/jobs/2026-11/788080_1.jpg"]);
    expect(jobzToRaw(parseJobzList(fx("jobzpk-list.html"))[0]!, d).images).toEqual(d.images);
    expect(jobzToRaw(parseJobzList(fx("jobzpk-list.html"))[0]!, null).images).toBeNull();
    expect(isJobzAdvertImage("https://www.jobz.pk/images/jobs/2026-11/1_2.jpg")).toBe(true);
    for (const bad of ["https://www.jobz.pk/images/male.jpg", "http://www.jobz.pk/images/jobs/a.jpg", "https://evil.example/images/jobs/a.jpg", "https://www.jobz.pk/images/jobs/a.jpg?x=1", "https://www.jobz.pk/images/jobs/../../etc.jpg"]) {
      expect(isJobzAdvertImage(bad)).toBe(false);
    }
  });
});

describe("official sources (saved pages)", () => {
  it("SHC&ME: description, last date and the advert link", () => {
    const jobs = parseShcme(fx("shcme-jobs.html"));
    expect(jobs.length).toBeGreaterThan(0);
    expect(jobs[0]).toMatchObject({ source: "shcme", official: true, lastDate: "2026-11-13" });
    expect(jobs[0]!.link).toMatch(/^https:\/\/health\.punjab\.gov\.pk\/uploads\/jobs\/.+\.pdf$/);
  });

  it("P&SHD: title without the close date, last date from it, advert link", () => {
    const jobs = parsePshd(fx("pshd-jobs.html"));
    expect(jobs.length).toBeGreaterThan(0);
    expect(jobs[0]!.title).not.toMatch(/Close date/i);
    expect(jobs[0]).toMatchObject({ source: "pshd", official: true, lastDate: "2026-11-26" });
    expect(jobs[0]!.link).toMatch(/^https:\/\/pshealthpunjab\.gov\.pk\/Upload\/Jobs\//);
    expect(isDoctorJob(jobs[0]!)).toBe(true);
  });

  it("PPSC: advertisement rows; a non-health exam is not a doctor job", () => {
    const jobs = parsePpsc(fx("ppsc-jobs.html"));
    expect(jobs[0]).toMatchObject({ source: "ppsc", adNo: "12/2026", lastDate: "2026-11-30", postedOn: "2026-11-08" });
    expect(isDoctorJob(jobs[0]!)).toBe(false);
  });
});

describe("rules", () => {
  const base = { source: "jobzpk" as const, employer: null, education: [], vacancies: [] };
  it("keeps doctor posts and drops nurse-only posts", () => {
    expect(isDoctorJob({ ...base, title: "Medical Officer and WMO jobs at DHQ" })).toBe(true);
    expect(isDoctorJob({ ...base, title: "Staff Nurse jobs", education: ["BSc Nursing"] })).toBe(false);
    expect(isDoctorJob({ ...base, title: "Hospital jobs", education: ["MBBS", "FCPS"] })).toBe(true);
  });

  it("puts jobs in folders", () => {
    const f = (employer: string, source: "jobzpk" | "ppsc" = "jobzpk"): Folder => folderOf({ source, employer, title: "" });
    expect(f("Combined Military Hospital CMH")).toBe("federal");
    expect(f("DHQ Hospital Sheikhupura")).toBe("district");
    expect(f("King Edward Medical University")).toBe("teaching");
    expect(f("Shaukat Khanum Memorial Hospital")).toBe("private");
    expect(f("anything", "ppsc")).toBe("ppsc");
  });

  it("merges the same advert from two sources, official link first", () => {
    const a = { ...base, sourceId: "1", title: "SHC&ME Department Jobs 2026", employer: "Specialized Healthcare & Medical Education Department", city: "Lahore", postedOn: null, lastDate: "2026-11-30", link: "https://www.jobz.pk/x", official: false, applyOnline: true, adNo: null, education: ["MBBS"], images: ["https://www.jobz.pk/images/jobs/2026-11/1_1.jpg"] };
    const b = { ...a, source: "shcme" as const, sourceId: "2", title: "Training program advert", link: "https://health.punjab.gov.pk/uploads/jobs/x.pdf", official: true, city: null, education: [], images: [] };
    expect(dedupeKey(a)).toBe(dedupeKey(b));
    const out = mergeJobs([a, b]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ official: true, link: b.link, city: "Lahore", education: ["MBBS"], images: a.images });
  });

  it("works out open, closing and closed in Pakistan time", () => {
    expect(jobState("2026-11-30", "2026-11-13")).toBe("open");
    expect(jobState("2026-11-17", "2026-11-13")).toBe("closing");
    expect(jobState("2026-11-12", "2026-11-13")).toBe("closed");
    expect(jobState(null, "2026-11-13")).toBe("unknown");
    expect(todayPk(new Date("2026-11-13T20:00:00Z"))).toBe("2026-11-14");
  });
});
