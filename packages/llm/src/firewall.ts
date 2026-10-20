/**
 * Context firewall: mask sensitive material before any text is sent to a model.
 * Only the category and the count are kept, never the matched value.
 */

export type FirewallCategory =
  | "private-key"
  | "jwt"
  | "api-key"
  | "iban"
  | "credential-assignment";

const RULES: ReadonlyArray<{ category: FirewallCategory; pattern: RegExp }> = [
  {
    category: "private-key",
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  },
  { category: "jwt", pattern: /\beyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}\b/g },
  {
    category: "api-key",
    pattern: /\b(?:AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{36,}|sk-[A-Za-z0-9]{20,}|glpat-[\w-]{20,})\b/g,
  },
  { category: "iban", pattern: /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){3,7}(?: ?[A-Z0-9]{1,4})?\b/g },
  {
    category: "credential-assignment",
    pattern: /\b(password|passwd|pwd|secret|token|api[_-]?key)\b(\s*[:=]\s*)(["']?)[^\s"']{4,}\3/gi,
  },
];

export interface FirewallResult {
  text: string;
  findings: Partial<Record<FirewallCategory, number>>;
}

export function maskSensitive(input: string): FirewallResult {
  const findings: FirewallResult["findings"] = {};
  let text = input;
  for (const { category, pattern } of RULES) {
    text = text.replace(pattern, (...args: unknown[]) => {
      findings[category] = (findings[category] ?? 0) + 1;
      if (category === "credential-assignment") {
        return `${args[1] as string}${args[2] as string}[MASKED:${category}]`;
      }
      return `[MASKED:${category}]`;
    });
  }
  return { text, findings };
}
