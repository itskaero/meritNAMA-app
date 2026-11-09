import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "./cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const base =
  "inline-flex items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap transition-colors disabled:opacity-50 disabled:pointer-events-none";
const variants: Record<Variant, string> = {
  primary: "bg-signal text-signal-ink shadow-[var(--mn-shadow-1)] hover:bg-signal-strong",
  secondary: "border border-line-strong bg-surface text-ink hover:bg-hover",
  ghost: "text-muted hover:text-ink hover:bg-hover",
  danger: "border border-danger/50 text-danger hover:bg-danger/10",
};
const sizes: Record<Size, string> = { sm: "h-9 px-3.5 text-sm", md: "h-10 px-4 text-sm" };

type Common = { variant?: Variant; size?: Size };

export function Button({ variant = "primary", size = "md", className, ...props }: Common & ComponentProps<"button">) {
  return <button className={cn(base, variants[variant], sizes[size], className)} {...props} />;
}

export function ButtonLink({ variant = "primary", size = "md", className, ...props }: Common & ComponentProps<typeof Link>) {
  return <Link className={cn(base, variants[variant], sizes[size], className)} {...props} />;
}
