/**
 * Admin-written formulas over a candidate's parameters, e.g.
 *
 *   degree + houseJob + position + min(experience, 5) + mdcat
 *
 * A small expression language, parsed here (never `eval`): numbers, parameter names,
 * + - * / with the usual precedence, parentheses, comparisons (< <= > >= == !=, giving
 * 1 or 0), && and ||, and the functions min, max, abs, round(x[, digits]),
 * clamp(x, lo, hi) and if(condition, then, else). Pure.
 */

export class FormulaError extends Error {
  constructor(message: string, readonly at: number | null = null) {
    super(at == null ? message : `${message} (at character ${at + 1})`);
    this.name = "FormulaError";
  }
}

type Node =
  | { k: "num"; v: number }
  | { k: "var"; name: string; at: number }
  | { k: "neg"; a: Node }
  | { k: "bin"; op: string; a: Node; b: Node }
  | { k: "call"; fn: string; args: Node[]; at: number };

const FUNCTIONS: Record<string, [min: number, max: number]> = { min: [1, 20], max: [1, 20], abs: [1, 1], round: [1, 2], clamp: [3, 3], if: [3, 3] };
export const FORMULA_FUNCTIONS = Object.keys(FUNCTIONS);
const MAX_LENGTH = 500;

type Tok = { t: "num" | "id" | "op" | "(" | ")" | "," | "end"; v: string; at: number };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i]!;
    if (/\s/.test(ch)) { i++; continue; }
    const num = /^(?:\d+(?:\.\d*)?|\.\d+)/.exec(src.slice(i));
    if (num) { out.push({ t: "num", v: num[0], at: i }); i += num[0].length; continue; }
    const id = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
    if (id) { out.push({ t: "id", v: id[0], at: i }); i += id[0].length; continue; }
    const op = /^(?:<=|>=|==|!=|&&|\|\||[-+*/<>])/.exec(src.slice(i));
    if (op) { out.push({ t: "op", v: op[0], at: i }); i += op[0].length; continue; }
    if (ch === "(" || ch === ")" || ch === ",") { out.push({ t: ch, v: ch, at: i }); i++; continue; }
    throw new FormulaError(`Unexpected “${ch}”`, i);
  }
  out.push({ t: "end", v: "", at: src.length });
  return out;
}

const LEVELS = [["||"], ["&&"], ["==", "!="], ["<", "<=", ">", ">="], ["+", "-"], ["*", "/"]];

function parse(src: string): Node {
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p]!;
  const expect = (t: Tok["t"], what: string) => {
    if (peek().t !== t) throw new FormulaError(`Expected ${what}`, peek().at);
    return toks[p++]!;
  };
  const level = (n: number): Node => {
    if (n === LEVELS.length) return unary();
    let a = level(n + 1);
    while (peek().t === "op" && LEVELS[n]!.includes(peek().v)) {
      const op = toks[p++]!.v;
      a = { k: "bin", op, a, b: level(n + 1) };
    }
    return a;
  };
  const unary = (): Node => {
    if (peek().t === "op" && (peek().v === "-" || peek().v === "+")) {
      const op = toks[p++]!.v;
      const a = unary();
      return op === "-" ? { k: "neg", a } : a;
    }
    return primary();
  };
  const primary = (): Node => {
    const tok = peek();
    if (tok.t === "num") { p++; return { k: "num", v: Number(tok.v) }; }
    if (tok.t === "(") { p++; const e = level(0); expect(")", "“)”"); return e; }
    if (tok.t === "id") {
      p++;
      if (peek().t !== "(") return { k: "var", name: tok.v, at: tok.at };
      const fn = tok.v.toLowerCase();
      const arity = FUNCTIONS[fn];
      if (!arity) throw new FormulaError(`Unknown function “${tok.v}”; use ${FORMULA_FUNCTIONS.join(", ")}`, tok.at);
      p++;
      const args: Node[] = [];
      if (peek().t !== ")") {
        args.push(level(0));
        while (peek().t === ",") { p++; args.push(level(0)); }
      }
      expect(")", "“)”");
      if (args.length < arity[0] || args.length > arity[1]) throw new FormulaError(`${fn}() takes ${arity[0] === arity[1] ? arity[0] : `${arity[0]} to ${arity[1]}`} argument${arity[1] === 1 ? "" : "s"}`, tok.at);
      return { k: "call", fn, args, at: tok.at };
    }
    throw new FormulaError(tok.t === "end" ? "The formula ends too early" : `Unexpected “${tok.v}”`, tok.at);
  };
  const tree = level(0);
  if (peek().t !== "end") throw new FormulaError(`Unexpected “${peek().v}”`, peek().at);
  return tree;
}

function variablesOf(n: Node, out = new Set<string>()): Set<string> {
  if (n.k === "var") out.add(n.name);
  else if (n.k === "neg") variablesOf(n.a, out);
  else if (n.k === "bin") { variablesOf(n.a, out); variablesOf(n.b, out); }
  else if (n.k === "call") n.args.forEach((a) => variablesOf(a, out));
  return out;
}

/** null: a parameter the candidate does not have; the whole result is then null. */
function evaluate(n: Node, vars: Readonly<Record<string, number | null | undefined>>): number | null {
  switch (n.k) {
    case "num": return n.v;
    case "var": { const v = vars[n.name]; return typeof v === "number" && Number.isFinite(v) ? v : null; }
    case "neg": { const a = evaluate(n.a, vars); return a == null ? null : -a; }
    case "bin": {
      const a = evaluate(n.a, vars), b = evaluate(n.b, vars);
      if (a == null || b == null) return null;
      switch (n.op) {
        case "+": return a + b;
        case "-": return a - b;
        case "*": return a * b;
        case "/": return b === 0 ? null : a / b;
        case "<": return +(a < b);
        case "<=": return +(a <= b);
        case ">": return +(a > b);
        case ">=": return +(a >= b);
        case "==": return +(Math.abs(a - b) < 1e-9);
        case "!=": return +(Math.abs(a - b) >= 1e-9);
        case "&&": return +(a !== 0 && b !== 0);
        case "||": return +(a !== 0 || b !== 0);
      }
      return null;
    }
    case "call": {
      if (n.fn === "if") {
        const c = evaluate(n.args[0]!, vars);
        return c == null ? null : evaluate(n.args[c !== 0 ? 1 : 2]!, vars);
      }
      const xs = n.args.map((a) => evaluate(a, vars));
      if (xs.some((x) => x == null)) return null;
      const v = xs as number[];
      switch (n.fn) {
        case "min": return Math.min(...v);
        case "max": return Math.max(...v);
        case "abs": return Math.abs(v[0]!);
        case "round": { const f = 10 ** Math.max(0, Math.min(6, Math.round(v[1] ?? 0))); return Math.round(v[0]! * f) / f; }
        case "clamp": return Math.min(Math.max(v[0]!, v[1]!), v[2]!);
      }
      return null;
    }
  }
}

export type CompiledFormula = {
  source: string;
  variables: string[];
  /** The value, or null when a parameter is missing (or a division by zero). */
  evaluate: (vars: Readonly<Record<string, number | null | undefined>>) => number | null;
};

/**
 * Parse a formula. With `known`, every parameter it uses must be one of them.
 * Throws FormulaError with a position on a mistake.
 */
export function compileFormula(source: string, known?: readonly string[]): CompiledFormula {
  const src = source.trim();
  if (!src) throw new FormulaError("The formula is empty");
  if (src.length > MAX_LENGTH) throw new FormulaError(`Keep the formula under ${MAX_LENGTH} characters`);
  const tree = parse(src);
  const variables = [...variablesOf(tree)].sort();
  if (known) {
    const set = new Set(known);
    const unknown = variables.filter((v) => !set.has(v));
    if (unknown.length) throw new FormulaError(`Unknown parameter${unknown.length > 1 ? "s" : ""}: ${unknown.join(", ")}. Available: ${[...set].sort().join(", ") || "none"}`);
  }
  return { source: src, variables, evaluate: (vars) => {
    const v = evaluate(tree, vars);
    return v == null || !Number.isFinite(v) ? null : v;
  } };
}

// ── Candidate parameters ────────────────────────────────────────────────────────

type CertLike = { status?: string | null; certificateMarks?: number | string | null; computerizedMarks?: number | string | null };

/** Figures derived from a candidate's certificates, available to formulas. */
export const CERTIFICATE_PARAMETERS = {
  certCount: "Certificates on file",
  certPassed: "Certificates with status Pass",
  certMaxMarks: "Highest certificate marks",
  certMaxComputerized: "Highest computerised marks",
} as const;

export function certificateParameters(certs: readonly CertLike[]): Record<keyof typeof CERTIFICATE_PARAMETERS, number> {
  const nums = (k: "certificateMarks" | "computerizedMarks") => certs.map((c) => Number(c[k])).filter((n) => Number.isFinite(n));
  const maxOf = (xs: number[]) => (xs.length ? Math.max(...xs) : 0);
  return {
    certCount: certs.length,
    certPassed: certs.filter((c) => String(c.status ?? "").trim().toLowerCase() === "pass").length,
    certMaxMarks: maxOf(nums("certificateMarks")),
    certMaxComputerized: maxOf(nums("computerizedMarks")),
  };
}

/** Everything a formula can use for one candidate: imported parameters, the imported total and certificate figures. */
export function formulaVariables(c: { baseMarks: number; params?: Readonly<Record<string, number>> | null; certificates?: readonly CertLike[] | null }) {
  return { ...(c.params ?? {}), marksTotal: c.baseMarks, ...certificateParameters(c.certificates ?? []) };
}
