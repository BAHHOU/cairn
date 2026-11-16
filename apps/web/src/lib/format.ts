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
  const hours = new Intl.NumberFormat(tag, { style: "unit", unit: "hour", unitDisplay: "short" });
  const mins = new Intl.NumberFormat(tag, { style: "unit", unit: "minute", unitDisplay: "short" });
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

  const relative = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "short" });

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
    /** A duration in minutes, in hours past the first hour: nobody plans a day in minutes. */
    minutes(total: number): string {
      if (total < 60) return mins.format(total);
      const h = Math.floor(total / 60);
      const m = total % 60;
      return m === 0 ? hours.format(h) : `${hours.format(h)} ${mins.format(m)}`;
    },
    /** Short month name, 0 = January. */
    month: (index: number) => month.format(Date.UTC(2000, index, 1)),
    /** "2 h ago" / "il y a 2 h", relative to now; past a month, the plain date. */
    ago(iso: string, now = Date.now()): string {
      const s = Math.round((new Date(iso).getTime() - now) / 1000);
      const abs = Math.abs(s);
      if (abs < 60) return relative.format(s, "second");
      if (abs < 3600) return relative.format(Math.round(s / 60), "minute");
      if (abs < 86_400) return relative.format(Math.round(s / 3600), "hour");
      if (abs < 30 * 86_400) return relative.format(Math.round(s / 86_400), "day");
      return date.format(new Date(iso));
    },
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
