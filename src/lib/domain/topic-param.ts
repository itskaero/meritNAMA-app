import { topicSchema, type Topic } from "./community";

/** Parse the "kind|key" form used in URLs and selects (e.g. "round|20:6"); null if invalid. */
export function parseTopicParam(value: string | string[] | undefined): Topic | null {
  if (typeof value !== "string") return null;
  const [kind, key = ""] = value.split("|");
  const r = topicSchema.safeParse({ kind, key });
  return r.success ? r.data : null;
}

export const topicParam = (t: Topic) => `${t.kind}|${t.key}`;
