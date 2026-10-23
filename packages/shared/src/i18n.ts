import { z } from "zod";

/**
 * Languages of the product. French is the reference: every key exists there first, and a test
 * fails when another catalog misses one.
 */
export const LOCALES = ["fr", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "fr";
export const localeSchema = z.enum(LOCALES);

export const LOCALE_LABEL: Record<Locale, string> = {
  fr: "Français",
  en: "English",
};

/** BCP 47 tag used for number and date formatting. */
export const LOCALE_TAG: Record<Locale, string> = {
  fr: "fr-FR",
  en: "en-GB",
};

export const isLocale = (value: unknown): value is Locale =>
  typeof value === "string" && (LOCALES as readonly string[]).includes(value);

/** Picks the first supported language of an `Accept-Language` header. */
export function matchLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;
  const ranked = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag = "", q] = part.trim().split(";q=");
      return { lang: tag.toLowerCase().split("-")[0], q: q ? Number(q) : 1 };
    })
    .filter((x) => x.q > 0)
    .sort((a, b) => b.q - a.q);
  const found = ranked.find((x) => isLocale(x.lang))?.lang;
  return isLocale(found) ? found : DEFAULT_LOCALE;
}

export type MsgParam = string | number;

/**
 * Text that is produced by code but shown to people: a key of the message catalog and its values,
 * never a finished sentence. It is stored as is (scan results, AI fallbacks) and rendered in the
 * viewer's language, so changing language never needs a new scan.
 * Technical names (class, queue, image) are params: they are never translated.
 */
export interface Msg {
  key: string;
  params?: Record<string, MsgParam>;
}

export const msg = (key: string, params?: Record<string, MsgParam>): Msg =>
  params ? { key, params } : { key };

export const msgSchema = z.object({
  key: z.string().min(1),
  params: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
});
