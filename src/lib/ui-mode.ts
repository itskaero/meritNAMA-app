/**
 * Interface mode. "simple" (default): labelled sidebar, larger type, everything a
 * visible link. "pro": icon rail, Ctrl K palette button, denser tables.
 * Stored in a cookie so the server renders the right layout without a flash.
 */
export const UI_MODES = ["simple", "pro"] as const;
export type UiMode = (typeof UI_MODES)[number];
export const UI_MODE_COOKIE = "mn_mode";

export function parseUiMode(value: string | undefined): UiMode {
  return value === "pro" ? "pro" : "simple";
}

/** Time (ms) up to which "What's new" items were dismissed. */
export const WHATS_NEW_COOKIE = "mn_news_seen";

/** Colour theme: dark by default (v3); light, or follow the device ("system"), on request. */
export const THEMES = ["light", "dark", "system"] as const;
export type Theme = (typeof THEMES)[number];
export const THEME_COOKIE = "mn_theme";

export function parseTheme(value: string | undefined): Theme {
  return value === "light" || value === "system" ? value : "dark";
}
