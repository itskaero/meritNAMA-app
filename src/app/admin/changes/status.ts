import type { BadgeTone } from "@/components/ui/badge";

export const STATUS_TONE: Record<string, BadgeTone> = { pending: "warning", published: "success", discarded: "neutral", rolled_back: "historical" };
export const statusLabel = (s: string) => s.replace("_", " ");
