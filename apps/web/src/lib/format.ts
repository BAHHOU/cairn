const nf = new Intl.NumberFormat("fr-FR");

export const formatNumber = (n: number) => nf.format(n);

export function formatTokens(n: number): string {
  if (n >= 1_000_000)
    return `${(n / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} M`;
  if (n >= 1_000) return `${Math.round(n / 1_000).toLocaleString("fr-FR")} k`;
  return String(n);
}

export const formatEuros = (n: number) =>
  new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });

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
