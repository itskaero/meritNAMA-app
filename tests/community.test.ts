import { describe, expect, it } from "vitest";
import { defaultDisplayName, displayNameSchema, findPersonalData, threadInputSchema, topicSchema } from "@/lib/domain/community";
import { parseSnippetParam, pollInputSchema, pollPercents, REVIEW_DIMENSIONS, reviewInputSchema, snippetParam, snippetSchema, storedSnippet } from "@/lib/domain/community";

describe("community rules", () => {
  it("spots personal data", () => {
    expect(findPersonalData("my cnic is 35202-1234567-1")).toBe("a CNIC number");
    expect(findPersonalData("3520212345671")).toBe("a CNIC number");
    expect(findPersonalData("call 0300-1234567")).toBe("a phone number");
    expect(findPersonalData("whatsapp +92 300 1234567")).toBe("a phone number");
    expect(findPersonalData("mail me at someone@example.com")).toBe("an email address");
    expect(findPersonalData("closing merit was 23.76 in round 3 of induction 20")).toBeNull();
    expect(findPersonalData("PHF/26/JAN/01 had 1383 allocations")).toBeNull();
  });

  it("validates threads and explains refusals", () => {
    const ok = threadInputSchema.safeParse({ topic: { kind: "speciality", key: "1" }, title: "Anaesthesia closing in round 2?", body: "Did closing merit fall after round 1?" });
    expect(ok.success).toBe(true);
    const pii = threadInputSchema.safeParse({ topic: { kind: "general" }, title: "Need help with my file", body: "Please call me on 03001234567 tonight" });
    expect(pii.success).toBe(false);
    expect(JSON.stringify(pii.error?.issues)).toContain("Remove a phone number");
    expect(threadInputSchema.safeParse({ topic: { kind: "general" }, title: "Hi", body: "short" }).success).toBe(false);
  });

  it("checks topic keys per kind", () => {
    expect(topicSchema.safeParse({ kind: "round", key: "20:6" }).success).toBe(true);
    expect(topicSchema.safeParse({ kind: "round", key: "20" }).success).toBe(false);
    expect(topicSchema.safeParse({ kind: "general", key: "x" }).success).toBe(false);
    expect(topicSchema.safeParse({ kind: "hospital", key: "1;drop" }).success).toBe(false);
  });

  it("gives anonymous default names and checks chosen ones", () => {
    expect(defaultDisplayName("a@b.c")).toMatch(/^member-[0-9a-f]{6}$/);
    expect(defaultDisplayName("a@b.c")).toBe(defaultDisplayName("a@b.c"));
    expect(defaultDisplayName("a@b.c")).not.toContain("a@b");
    expect(displayNameSchema.safeParse("Dr Ayesha_K").success).toBe(true);
    expect(displayNameSchema.safeParse("<script>").success).toBe(false);
    expect(displayNameSchema.safeParse("me@mail.com").success).toBe(false);
  });
});

describe("merit snippets", () => {
  const ok = { induction: 20, round: 6, program: "FCPS", quota: "Punjab", speciality: "Anaesthesia", hospital: "Jinnah Hospital, Lahore" };

  it("accepts a well-formed group and round-trips through the URL form", () => {
    expect(snippetSchema.parse(ok)).toEqual(ok);
    expect(parseSnippetParam(snippetParam(ok))).toEqual(ok);
  });

  it("refuses typed numbers, extra fields and bad rounds", () => {
    expect(snippetSchema.safeParse({ ...ok, closing: 19.2 }).success).toBe(false);
    expect(snippetSchema.safeParse({ ...ok, round: 0 }).success).toBe(false);
    expect(snippetSchema.safeParse({ ...ok, induction: "20" }).success).toBe(false);
    expect(parseSnippetParam("{not json")).toBeNull();
    expect(parseSnippetParam(undefined)).toBeNull();
    expect(storedSnippet(null)).toBeNull();
  });
});

describe("polls and reviews", () => {
  it("validates polls: distinct options, 2–6 of them, no personal data", () => {
    expect(pollInputSchema.parse({ question: "Which round will Paeds close lowest?", options: [" R5 ", "R6"] }).options).toEqual(["R5", "R6"]);
    expect(pollInputSchema.safeParse({ question: "Which round will close lowest?", options: ["R5"] }).success).toBe(false);
    expect(pollInputSchema.safeParse({ question: "Which round will close lowest?", options: ["R5", "r5"] }).success).toBe(false);
    expect(pollInputSchema.safeParse({ question: "Call me on 0300-1234567 please", options: ["a", "b"] }).success).toBe(false);
  });

  it("rounds poll percentages to exactly 100", () => {
    expect(pollPercents([1, 1, 1])).toEqual([34, 33, 33]);
    expect(pollPercents([2, 1])).toEqual([67, 33]);
    expect(pollPercents([0, 0])).toEqual([0, 0]);
    expect(pollPercents([7, 0, 3]).reduce((a, b) => a + b)).toBe(100);
  });

  it("validates reviews: four 1–5 ratings and a real text", () => {
    const ok = { hospitalId: 1, induction: 20, training: 4, workload: 2, hostel: 3, stipend: 1, body: "Good teaching on rounds, but the stipend is often two months late." };
    expect(reviewInputSchema.parse(ok).specialityId).toBeUndefined();
    expect(reviewInputSchema.safeParse({ ...ok, hostel: 6 }).success).toBe(false);
    expect(reviewInputSchema.safeParse({ ...ok, body: "Too short" }).success).toBe(false);
    expect(reviewInputSchema.safeParse({ ...ok, body: "Email me at someone@example.org for details about this." }).success).toBe(false);
    expect(REVIEW_DIMENSIONS.map((d) => d.key)).toEqual(["training", "workload", "hostel", "stipend"]);
  });
});
