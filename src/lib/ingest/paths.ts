/**
 * Paths in the data folder: cleaning a path from a browser, a zip or a Git tree, and
 * reading what a path says (file name, folders, induction number). Pure.
 */

/** Clean a path from a browser, a zip or a Git tree: forward slashes, no empty, "." or ".." parts. */
export function cleanRelPath(input: string): string | null {
  if (input.startsWith("/") || input.startsWith(String.fromCharCode(92)) || /^[A-Za-z]:/.test(input)) return null; // absolute paths and drive letters
  const parts = input.replace(/\\/g, "/").split("/").filter((p) => p !== "" && p !== ".");
  if (!parts.length || parts.length > 6) return null;
  if (parts.some((p) => p === ".." || p.length > 120 || !/^[A-Za-z0-9][A-Za-z0-9._ \-()]*$/.test(p))) return null;
  if (!/\.json$/i.test(parts[parts.length - 1]!)) return null;
  return parts.join("/");
}

export type PathInfo = {
  rel: string;
  /** File name, as written. */
  name: string;
  /** File name, lower case. */
  lower: string;
  /** Folder names, lower case. */
  dirs: string[];
  /** Induction from an inductions/<n>/ folder or induction<n>_ / i<n>_ in the name. */
  induction: number | null;
};

/** Which induction a path names: an inductions/<n>/ folder, or induction<n>_ / i<n>_ in the file name. */
function inductionOf(parts: string[]): number | null {
  const at = parts.findIndex((p) => p.toLowerCase() === "inductions");
  const folder = at >= 0 ? /^(?:induction)?(\d{1,3})$/i.exec(parts[at + 1] ?? "") : null;
  if (folder) return Number(folder[1]);
  const name = parts[parts.length - 1]!;
  const m = /^(?:induction|i)(\d{1,3})[_-]/i.exec(name);
  return m ? Number(m[1]) : null;
}

export function pathInfo(rel: string): PathInfo {
  const parts = rel.replace(/\\/g, "/").split("/").filter(Boolean);
  const name = parts[parts.length - 1] ?? "";
  return { rel, name, lower: name.toLowerCase(), dirs: parts.slice(0, -1).map((d) => d.toLowerCase()), induction: parts.length ? inductionOf(parts) : null };
}
