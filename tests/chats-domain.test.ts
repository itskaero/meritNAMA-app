import { describe, expect, it } from "vitest";
import { CHAT_MESSAGE_MAX, chatMessageSchema, chatNameSchema, dmKey, dmRefusal, dmVerdict, isChatReaction, tallyReactions, unreadLabel } from "@/lib/domain/chats";

const base = { me: "a", them: "b", iBlocked: false, blockedMe: false, themDmOpen: true, meIsStaff: false };

describe("chat domain", () => {
  it("keys a pair the same either way round", () => {
    expect(dmKey("b", "a")).toBe(dmKey("a", "b"));
    expect(dmKey("a", "b")).not.toBe(dmKey("a", "c"));
  });

  it("allows an ordinary message and refuses the rest in plain words", () => {
    expect(dmVerdict(base)).toEqual({ ok: true });
    expect(dmVerdict({ ...base, them: "a" })).toMatchObject({ ok: false, reason: "self" });
    expect(dmVerdict({ ...base, iBlocked: true })).toMatchObject({ reason: "blocked" });
    expect(dmVerdict({ ...base, blockedMe: true })).toMatchObject({ reason: "blocked_by" });
    expect(dmVerdict({ ...base, themDmOpen: false })).toMatchObject({ reason: "dm_off" });
  });

  it("lets staff past a closed inbox but never past a block", () => {
    expect(dmVerdict({ ...base, themDmOpen: false, meIsStaff: true })).toEqual({ ok: true });
    expect(dmVerdict({ ...base, blockedMe: true, meIsStaff: true })).toMatchObject({ ok: false });
  });

  it("does not tell someone they were blocked", () => {
    expect(dmRefusal("blocked_by")).toBe(dmRefusal("dm_off"));
    expect(dmRefusal("blocked_by")).not.toMatch(/block/i);
  });

  it("cleans and limits messages", () => {
    expect(chatMessageSchema.parse("  hi   there \n\n\n\nyou ")).toBe("hi there\n\nyou");
    expect(chatMessageSchema.safeParse("   ").success).toBe(false);
    expect(chatMessageSchema.safeParse("x".repeat(CHAT_MESSAGE_MAX + 1)).success).toBe(false);
    expect(chatMessageSchema.safeParse("x".repeat(CHAT_MESSAGE_MAX)).success).toBe(true);
  });

  it("checks chat names", () => {
    expect(chatNameSchema.safeParse("ab").success).toBe(false);
    expect(chatNameSchema.parse("  FCPS   2026 ")).toBe("FCPS 2026");
  });

  it("accepts only the fixed reactions", () => {
    expect(isChatReaction("👍")).toBe(true);
    expect(isChatReaction("hello")).toBe(false);
    expect(tallyReactions([{ emoji: "✅", mine: false }, { emoji: "👍", mine: true }, { emoji: "👍", mine: false }, { emoji: "zzz", mine: true }]))
      .toEqual([{ emoji: "👍", count: 2, mine: true }, { emoji: "✅", count: 1, mine: false }]);
  });

  it("caps the unread badge", () => {
    expect(unreadLabel(0)).toBe("");
    expect(unreadLabel(7)).toBe("7");
    expect(unreadLabel(250)).toBe("99+");
  });
});
