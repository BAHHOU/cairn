import type { ScanFinding } from "@cairn/shared";
import { lineIndex } from "./text";

type Finding = Omit<ScanFinding, "path">;

const PRIVATE_KEY =
  /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED |PGP )?PRIVATE KEY(?: BLOCK)?-----/g;

const TOKENS: { family: string; re: RegExp }[] = [
  { family: "gitlab", re: /\bglpat-[A-Za-z0-9_-]{20,}/g },
  {
    family: "github",
    re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{30,}/g,
  },
  { family: "aws", re: /\bAKIA[0-9A-Z]{16}\b/g },
  { family: "slack", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/g },
];

/** `password = "abc12345"`, `"apiKey": "..."`. A value with a space is prose, not a credential. */
const KEY_VALUE =
  /\b([A-Za-z_.-]*(?:password|passwd|pwd|secret|api[-_]?key|private[-_]?key|access[-_]?token|auth[-_]?token)[A-Za-z_.-]*)["']?\s*[:=]\s*["']([^"'\s${}<>%][^"'\s]{3,199})["']/gi;
/** `-Djavax.net.ssl.trustStorePassword=abc123` on a command line or in an ENTRYPOINT. */
const JVM_PROPERTY = /-D([\w.-]*(?:password|passwd|secret)[\w.-]*)=([^\s"'${}<>][^\s"']{3,199})/gi;
const XML_VALUE = /<(password|passwd|secret|apikey)>\s*([^<\s${}][^<\s]{3,199})\s*<\/\1>/gi;

const CAP = 50;

/**
 * Looks for credentials committed as text. Only where it is and which family it belongs to is kept:
 * the matched value is dropped on the spot and never leaves this function.
 */
export function scanSecrets(text: string, options: { structuredKeyValues: boolean }): Finding[] {
  const lineOf = lineIndex(text);
  const found: Finding[] = [];
  const seen = new Set<string>();
  const push = (finding: Finding) => {
    const id = `${finding.rule}:${finding.key ?? ""}:${finding.line}`;
    if (seen.has(id) || found.length >= CAP) return;
    seen.add(id);
    found.push(finding);
  };

  for (const m of text.matchAll(PRIVATE_KEY)) {
    push({ rule: "private-key", line: lineOf(m.index ?? 0) });
  }
  for (const { family, re } of TOKENS) {
    for (const m of text.matchAll(re)) {
      push({ rule: "access-token", line: lineOf(m.index ?? 0), key: family });
    }
  }
  if (options.structuredKeyValues) {
    for (const m of text.matchAll(KEY_VALUE)) {
      push({ rule: "hardcoded-secret", line: lineOf(m.index ?? 0), key: m[1] as string });
    }
    for (const m of text.matchAll(JVM_PROPERTY)) {
      push({ rule: "hardcoded-secret", line: lineOf(m.index ?? 0), key: m[1] as string });
    }
    for (const m of text.matchAll(XML_VALUE)) {
      push({ rule: "hardcoded-secret", line: lineOf(m.index ?? 0), key: m[1] as string });
    }
  }
  return found;
}
