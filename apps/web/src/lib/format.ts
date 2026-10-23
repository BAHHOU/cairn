import { LOCALE_TAG, type Locale } from "@cairn/shared";

/**
 * Number and date formatting bound to a language. Server components get it from
 * `getFormat()` (@/i18n/server), client components from `useFormat()` (@/i18n/client).
 */
export function createFormat(locale: Locale) {
  const tag = LOCALE_TAG[locale];
  const nf = new Intl.NumberFormat(tag);
  const compact = new Intl.NumberFormat(tag, { maximumFractionDigits: 1 });
  const euros = new Intl.NumberFormat(tag, {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  });
  const date = new Intl.DateTimeFormat(tag, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
  const month = new Intl.DateTimeFormat(tag, { month: "short", timeZone: "UTC" });
  const oneDecimal = new Intl.NumberFormat(tag, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const mb = new Intl.NumberFormat(tag, {
    style: "unit",
    unit: "megabyte",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const kb = new Intl.NumberFormat(tag, {
    style: "unit",
    unit: "kilobyte",
    maximumFractionDigits: 0,
  });

  return {
    number: (n: number) => nf.format(n),
    tokens(n: number): string {
      if (n >= 1_000_000) return `${compact.format(n / 1_000_000)} M`;
      if (n >= 1_000) return `${nf.format(Math.round(n / 1_000))} k`;
      return String(n);
    },
    euros: (n: number) => euros.format(n),
    date: (iso: string) => date.format(new Date(iso)),
    /** Scan figures: exact below 10 000, then `12 k`, then `1,2 M`. */
    compact(n: number): string {
      if (n >= 1_000_000) return `${oneDecimal.format(n / 1_000_000)} M`;
      if (n >= 10_000) return `${nf.format(Math.round(n / 1000))} k`;
      return nf.format(n);
    },
    /** File sizes in binary units, in the language's notation (Mo / MB). */
    bytes: (n: number) =>
      n >= 1_048_576 ? mb.format(n / 1_048_576) : kb.format(Math.round(n / 1024)),
    seconds: (ms: number) => oneDecimal.format(ms / 1000),
    /** Short month name, 0 = January. */
    month: (index: number) => month.format(Date.UTC(2000, index, 1)),
  };
}

export type Format = ReturnType<typeof createFormat>;

export type Tone = "good" | "warn" | "bad";

export const scoreTone = (score: number): Tone =>
  score >= 70 ? "good" : score >= 50 ? "warn" : "bad";

export const TONE_TEXT: Record<Tone, string> = {
  good: "text-primary",
  warn: "text-warning",
  bad: "text-destructive",
};

export const TONE_BG: Record<Tone, string> = {
  good: "bg-primary",
  warn: "bg-warning",
  bad: "bg-destructive",
};
