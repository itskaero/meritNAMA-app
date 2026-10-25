import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// WCAG 2.x contrast checks for the shared design tokens (src/styles/tokens.css).
const css = readFileSync(path.join(__dirname, "../src/styles/tokens.css"), "utf8");
const token = (name: string) => {
  const m = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`token --${name} not found`);
  return m[1]!;
};
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

describe("design token contrast", () => {
  const surfaces = ["mn-navy-950", "mn-navy-900", "mn-navy-800"];
  it.each(surfaces)("body text and muted text are AA on %s", (bg) => {
    expect(contrast(token("mn-text"), token(bg))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token("mn-text-muted"), token(bg))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(surfaces)("cyan and amber signals are AA on %s", (bg) => {
    expect(contrast(token("mn-cyan"), token(bg))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token("mn-amber"), token(bg))).toBeGreaterThanOrEqual(4.5);
  });

  it("text on primary buttons is AA", () => {
    expect(contrast(token("mn-cyan-ink"), token("mn-cyan"))).toBeGreaterThanOrEqual(4.5);
  });

  it("subtle text meets AA on the page background", () => {
    expect(contrast(token("mn-text-subtle"), token("mn-navy-950"))).toBeGreaterThanOrEqual(4.5);
  });
});
