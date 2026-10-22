import type { ConfigEntry, ScanFinding } from "@cairn/shared";
import { isMap, isScalar, isSeq, LineCounter, parseAllDocuments } from "yaml";
import { lastSegment, reduceUrl } from "./text";

export type Finding = Omit<ScanFinding, "path">;

const SECRET_SUFFIX =
  /(password|passwd|pwd|passphrase|secret|apikey|api-key|api_key|private-key|private_key|credentials?)$/i;
const SECRET_EXACT = /^(token|access-token|auth-token|bearer|client-secret|secret-key)$/i;
/** Values that point at somewhere else (an environment variable, a vault) are not secrets. */
const PLACEHOLDER = /^(\$\{.*\}|#\{.*\}|\{\{.*\}\}|@[\w.]+@|<.*>|%.*%|\$[A-Z_][A-Z0-9_]*)$/;
const EMPTY = new Set(["", "null", "~", "none", "false", "true", "xxx", "***", "changeme-in-prod"]);

const INTERESTING =
  /(queue|topic|\.port$|\bhosts?\b|host$|\burl$|\buri$|-url$|-uri$|endpoint|context-path|jdbc|broker|bootstrap|issuer)/i;

const CAP_ENTRIES = 300;

export const isSecretKey = (dottedKey: string): boolean => {
  const last = lastSegment(dottedKey).replace(/\[\d*]$/, "");
  return SECRET_SUFFIX.test(last) || SECRET_EXACT.test(last);
};

const isRealSecretValue = (value: string): boolean =>
  !EMPTY.has(value.trim().toLowerCase()) && !PLACEHOLDER.test(value.trim());

interface Leaf {
  key: string;
  value: string;
  line: number;
}

function collectYaml(text: string): Leaf[] {
  const counter = new LineCounter();
  const docs = parseAllDocuments(text, {
    lineCounter: counter,
    uniqueKeys: false,
    merge: true,
  });
  const leaves: Leaf[] = [];
  const lineOfKey = (node: unknown): number => {
    const range = (node as { range?: [number, number, number] } | null)?.range;
    return range ? counter.linePos(range[0]).line : 0;
  };

  const walk = (node: unknown, prefix: string): void => {
    if (leaves.length > 5000) return;
    if (isMap(node)) {
      for (const pair of node.items) {
        const keyNode = pair.key;
        const name = isScalar(keyNode) ? String(keyNode.value) : String(keyNode);
        const path = prefix ? `${prefix}.${name}` : name;
        const value = pair.value;
        if (isScalar(value)) {
          leaves.push({ key: path, value: String(value.value ?? ""), line: lineOfKey(keyNode) });
        } else {
          walk(value, path);
        }
      }
    } else if (isSeq(node)) {
      for (const item of node.items) {
        if (isScalar(item)) {
          leaves.push({
            key: `${prefix}[]`,
            value: String(item.value ?? ""),
            line: lineOfKey(item),
          });
        } else walk(item, `${prefix}[]`);
      }
    }
  };

  if (docs.length > 0 && docs.every((d) => d.errors.length > 0 && d.contents === null)) {
    throw new Error(docs[0]?.errors[0]?.message ?? "invalid YAML");
  }
  for (const d of docs) walk(d.contents, "");
  return leaves;
}

function collectProperties(text: string): Leaf[] {
  const leaves: Leaf[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("!")) return;
    const m = /^([^=:\s]+)\s*[=:]\s*(.*)$/.exec(line);
    if (m) leaves.push({ key: m[1] as string, value: (m[2] ?? "").trim(), line: i + 1 });
  });
  return leaves;
}

/**
 * Reads a YAML or `.properties` file and keeps only what explains the architecture: ports, hosts,
 * queue and topic names, URLs reduced to a host. A key that looks like a secret is never kept with
 * its value; it becomes a finding that says where it sits and nothing more.
 */
export function extractConfig(
  text: string,
  format: "yaml" | "properties",
  options: { reportSecrets: boolean },
): { entries: ConfigEntry[]; findings: Finding[] } {
  const leaves = format === "yaml" ? collectYaml(text) : collectProperties(text);
  const entries: ConfigEntry[] = [];
  const findings: Finding[] = [];

  for (const leaf of leaves) {
    if (isSecretKey(leaf.key)) {
      if (options.reportSecrets && isRealSecretValue(leaf.value)) {
        findings.push({ rule: "hardcoded-secret", line: leaf.line, key: leaf.key });
      }
      continue;
    }
    if (entries.length >= CAP_ENTRIES || !INTERESTING.test(leaf.key)) continue;
    const reduced = leaf.value.includes("://") ? reduceUrl(leaf.value) : undefined;
    const value = reduced ?? leaf.value;
    if (!value || value.length > 100) continue;
    entries.push({ key: leaf.key, value, line: leaf.line });
  }
  return { entries, findings };
}
