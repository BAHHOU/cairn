/**
 * The interface's look, per viewer: an accent (the brand colour), a base (the tint of the
 * neutrals), a corner radius and a typeface, alone or bundled as a template. Light and dark are
 * next-themes' business. Stored in a cookie so the server renders the page in its theme at once.
 *
 * Colours live in globals.css as `[data-accent]` and `[data-base]` blocks; this file only names
 * them, plus a swatch per option for the customizer. Status colours follow the message, never
 * the brand: green is safe, orange asks for a look, red is critical, solid dark red blocks
 * (lib/tone.ts). A base may tune their shades, never their meaning.
 */

/** Kept from the Cairn days so saved choices survive the rename. */
export const THEME_COOKIE = "cairn-theme";

export const ACCENTS = [
  "citron",
  "blue",
  "purple",
  "pink",
  "heather",
  "violet",
  "copper",
  "lagoon",
  "indigo",
  "emerald",
  "graphite",
] as const;
export type Accent = (typeof ACCENTS)[number];

export const BASES = ["mineral", "apple", "basalt", "obsidian", "slate", "stone"] as const;
export type Base = (typeof BASES)[number];

export const RADII = [0, 0.25, 0.5, 0.75, 1] as const;
export type Radius = (typeof RADII)[number];

export const FONTS = ["satoshi", "schibsted", "plex", "system"] as const;
export type Font = (typeof FONTS)[number];

export interface ThemePrefs {
  accent: Accent;
  base: Base;
  radius: Radius;
  font: Font;
}

/** Swatches for the customizer, light then dark, matching globals.css. */
export const ACCENT_SWATCH: Record<Accent, [string, string]> = {
  citron: ["#D5E66B", "#D5E66B"],
  blue: ["#0071E3", "#0A84FF"],
  purple: ["#8944AB", "#BF5AF2"],
  pink: ["#D30F45", "#FF375F"],
  heather: ["oklch(0.5 0.15 340)", "oklch(0.76 0.12 340)"],
  violet: ["#8855F6", "#8855F6"],
  copper: ["oklch(0.55 0.13 45)", "oklch(0.75 0.12 52)"],
  lagoon: ["oklch(0.53 0.095 205)", "oklch(0.77 0.1 200)"],
  indigo: ["oklch(0.5 0.17 278)", "oklch(0.75 0.13 278)"],
  emerald: ["oklch(0.56 0.125 162)", "oklch(0.72 0.14 162)"],
  graphite: ["oklch(0.25 0.01 280)", "oklch(0.94 0 0)"],
};

export const BASE_SWATCH: Record<Base, [string, string]> = {
  mineral: ["#F5F4EE", "#0F1A16"],
  apple: ["#F5F5F7", "#1C1C1E"],
  basalt: ["oklch(0.962 0.006 330)", "oklch(0.2 0.013 330)"],
  obsidian: ["#F1EEF6", "#080A0F"],
  slate: ["oklch(0.962 0.006 255)", "oklch(0.2 0.013 255)"],
  stone: ["oklch(0.962 0.006 70)", "oklch(0.2 0.01 70)"],
};

/** Ready-made looks: one click sets every part. */
export const TEMPLATES = {
  mergeok: { accent: "citron", base: "mineral", radius: 0.75, font: "satoshi" },
  apple: { accent: "blue", base: "apple", radius: 0.75, font: "system" },
  cairn: { accent: "heather", base: "basalt", radius: 0.5, font: "schibsted" },
  nebula: { accent: "violet", base: "obsidian", radius: 0.75, font: "schibsted" },
  ledger: { accent: "copper", base: "stone", radius: 0.25, font: "plex" },
  console: { accent: "graphite", base: "slate", radius: 0, font: "plex" },
  tide: { accent: "lagoon", base: "slate", radius: 1, font: "schibsted" },
  classic: { accent: "emerald", base: "slate", radius: 0.5, font: "schibsted" },
} as const satisfies Record<string, ThemePrefs>;
export type Template = keyof typeof TEMPLATES;

export const DEFAULT_THEME: ThemePrefs = TEMPLATES.mergeok;

const one = <T extends string | number>(list: readonly T[], v: unknown, fallback: T): T =>
  list.includes(v as T) ? (v as T) : fallback;

/** The cookie's value, trusted for nothing: anything unknown falls back to the default. */
export function parseTheme(raw: string | undefined): ThemePrefs {
  let v: Record<string, unknown> = {};
  try {
    const parsed = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === "object") v = parsed as Record<string, unknown>;
  } catch {}
  return {
    accent: one(ACCENTS, v.accent, DEFAULT_THEME.accent),
    base: one(BASES, v.base, DEFAULT_THEME.base),
    radius: one(RADII, v.radius, DEFAULT_THEME.radius),
    font: one(FONTS, v.font, DEFAULT_THEME.font),
  };
}

/** The template these preferences match exactly, if any. */
export const templateOf = (p: ThemePrefs): Template | null =>
  (Object.keys(TEMPLATES) as Template[]).find((k) => {
    const t: ThemePrefs = TEMPLATES[k];
    return t.accent === p.accent && t.base === p.base && t.radius === p.radius && t.font === p.font;
  }) ?? null;

/** What the root element carries for these preferences. */
export const themeAttributes = (p: ThemePrefs) => ({
  "data-accent": p.accent,
  "data-base": p.base,
  "data-font": p.font,
  style: { "--radius": `${p.radius}rem` } as React.CSSProperties,
});
