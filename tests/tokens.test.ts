import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// WCAG 2.x contrast checks for the design tokens (src/styles/tokens.css), light and dark.
const css = readFileSync(path.join(__dirname, "../src/styles/tokens.css"), "utf8");
const block = (selector: string) => {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`${selector} not found`);
  return css.slice(start, css.indexOf("}", start));
};
const themes = { light: block(":root {"), dark: block(':root[data-theme="dark"] {') };
const tokenIn = (src: string, name: string) => {
  const m = src.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
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

describe.each(Object.entries(themes))("design token contrast (%s)", (_name, src) => {
  const token = (n: string) => tokenIn(src, n);
  const surfaces = ["mn-navy-950", "mn-navy-900", "mn-navy-800"];

  it.each(surfaces)("body, heading and muted text are AA on %s", (bg) => {
    for (const fg of ["mn-text", "mn-text-heading", "mn-text-muted"]) expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(surfaces)("signal, status and ember colours are AA on %s", (bg) => {
    for (const fg of ["mn-cyan", "mn-amber", "mn-danger", "mn-success", "mn-ember"]) expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(4.5);
  });

  it("text on primary buttons is AA", () => {
    expect(contrast(token("mn-cyan-ink"), token("mn-cyan"))).toBeGreaterThanOrEqual(4.5);
  });

  it("subtle text meets AA on the page background", () => {
    expect(contrast(token("mn-text-subtle"), token("mn-navy-950"))).toBeGreaterThanOrEqual(4.5);
  });

  it("chart series stand apart from the surface (3:1 for graphics)", () => {
    for (const fg of ["mn-chart-1", "mn-chart-easier", "mn-chart-harder"]) expect(contrast(token(fg), token("mn-navy-900"))).toBeGreaterThanOrEqual(3);
  });
});

describe("theme blocks", () => {
  it("the system theme repeats the dark values exactly", () => {
    const sys = block(':root[data-theme="system"] {');
    const values = (s: string) => [...s.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => `${m[1]}=${m[2]}`).sort();
    expect(values(sys)).toEqual(values(themes.dark));
  });

  it("names the public site's copy in its header", () => {
    expect(css).toContain("assets/css/tokens.css in the public site");
    expect(css).toContain("src/styles/tokens.css in the app");
  });
});
