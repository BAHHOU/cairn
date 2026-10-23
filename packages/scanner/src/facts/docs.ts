import type { DocFacts } from "@cairn/shared";
import { redact, stripUrlQuery } from "./redact";

const CAP_HEADINGS = 120;
const CAP_BLOCKS = 40;
const CAP_BLOCK_LINES = 30;
const CAP_BULLETS = 80;
const CAP_PATHS = 80;
const CAP_NOTES = 20;
const CAP_MACHINE = 20;
const CAP_URLS = 12;
const CAP_MENTIONS = 24;
const LINE_MAX = 240;

const FENCE = /^\s*(```+|~~~+)\s*([\w+-]*)/;
const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const BULLET = /^\s*(?:[-*+]|\d+[.)])\s+(.+)$/;

/** `[label](target)` -> `label`, emphasis and code marks dropped: what a person reads. */
const plain = (s: string) =>
  s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\[[^\]]*\]/g, "$1")
    .replace(/[*_`]{1,3}/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\\$/g, "")
    .replace(/\s+/g, " ")
    .trim();

const clip = (s: string, max = LINE_MAX) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

const NOTE =
  /\b(?:do not commit|don'?t commit|never commit|doesn'?t work|does not work|do not work|not working|deprecated|warning|caution|attention|important|ne pas commiter|ne fonctionne pas)\b|⚠/i;

const MENTIONS: { tool: string; re: RegExp }[] = [
  { tool: "java", re: /\b(?:Java|JDK)\s*(?:version\s*)?(\d{1,2})(?![\d.]*\w)/g },
  { tool: "node", re: /\bNode(?:\.js)?\s*v?(\d{1,2})(?:\.\d+)*\b/g },
  { tool: "maven", re: /\bMaven\s*v?(\d+\.\d+(?:\.\d+)?)\b/g },
  { tool: "angular", re: /\bAngular\s*v?(\d{1,2})(?:\.\d+)*\b/g },
  { tool: "spring-boot", re: /\bSpring Boot\s*v?(\d+\.\d+(?:\.\d+)?)\b/g },
  { tool: "postgresql", re: /\bPostgre(?:SQL|s)\s*v?(\d{1,2}(?:\.\d+)?)\b/g },
];

const FILE_EXT =
  /\.(?:ya?ml|xml|json|properties|conf|cfg|ini|sh|ps1|bat|java|kt|ts|tsx|js|md|sql|jks|crt|pem|tar|gz|zip|jar|env|toml|gradle|lock)$/i;

const MACHINE_PATH =
  /(?:(?<![A-Za-z0-9:/.-])[A-Za-z]:[\\/](?![\\/])[^\s`'")]*|<[^>\s]+>[^\s`'")]*|\/(?:home|Users)\/[^\s`'")]*)/g;

/** A backticked token that reads like a path inside the repository. */
function repoPath(token: string): string | null {
  const t = token
    .trim()
    .replace(/^\.\//, "")
    .replace(/[),.;:]+$/, "");
  if (t.length < 3 || t.length > 160) return null;
  if (/\s|[<>*{}$|=]|^https?:|^[A-Za-z]:[\\/]|^~|^\/|^-|@/.test(t)) return null;
  if (!(t.includes("/") || FILE_EXT.test(t))) return null;
  // A dotted class name or a version is not a path.
  if (!t.includes("/") && !/^[\w.-]+$/.test(t)) return null;
  return t;
}

/**
 * Reads a Markdown file: its outline, the commands it tells people to run, the files it cites, the
 * addresses it opens, and the versions it claims. Prose is not kept; commands and sentences are
 * redacted of anything that looks like a credential before they are stored.
 */
export function extractDoc(text: string): DocFacts {
  const lines = text.split(/\r?\n/);
  const facts: DocFacts = {
    words: 0,
    headings: [],
    blocks: [],
    bullets: [],
    paths: [],
    notes: [],
    machinePaths: [],
    localUrls: [],
    mentions: [],
  };

  const seenPath = new Set<string>();
  const seenMention = new Set<string>();
  const seenUrl = new Set<string>();
  let heading: string | undefined;
  let fence: { marker: string; lang?: string; line: number; lines: string[] } | null = null;
  let lastText: { line: number; text: string } | null = null;
  let inFrontMatter = lines[0]?.trim() === "---";

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i] as string;
    const lineNo = i + 1;

    if (inFrontMatter) {
      if (i > 0 && raw.trim() === "---") inFrontMatter = false;
      continue;
    }

    const fenceMatch = FENCE.exec(raw);
    if (fence) {
      if (fenceMatch && raw.trim().startsWith(fence.marker.slice(0, 3))) {
        if (facts.blocks.length < CAP_BLOCKS) {
          const block: DocFacts["blocks"][number] = {
            line: fence.line,
            lines: fence.lines,
          };
          if (fence.lang) block.lang = fence.lang;
          if (heading) block.heading = heading;
          if (lastText && fence.line - lastText.line <= 3) block.lead = clip(redact(lastText.text));
          facts.blocks.push(block);
        }
        fence = null;
      } else {
        const trimmed = raw.replace(/\s+$/, "");
        if (trimmed.trim() && fence.lines.length < CAP_BLOCK_LINES) {
          fence.lines.push(clip(redact(trimmed)));
        }
        for (const m of raw.matchAll(MACHINE_PATH)) {
          if (facts.machinePaths.length < CAP_MACHINE) {
            facts.machinePaths.push({ text: clip(redact(m[0]), 120), line: lineNo });
          }
        }
      }
      continue;
    }
    if (fenceMatch) {
      fence = {
        marker: fenceMatch[1] as string,
        ...(fenceMatch[2] ? { lang: fenceMatch[2] } : {}),
        line: lineNo,
        lines: [],
      };
      continue;
    }

    const h = HEADING.exec(raw);
    if (h) {
      const level = (h[1] as string).length;
      const label = plain(h[2] as string);
      if (label) {
        heading = label;
        if (!facts.title && level === 1) facts.title = label;
        if (facts.headings.length < CAP_HEADINGS) {
          facts.headings.push({ level, text: clip(label, 120), line: lineNo });
        }
      }
      lastText = null;
      continue;
    }

    const body = plain(raw);
    if (!body) continue;
    facts.words += body.split(" ").length;

    const bullet = BULLET.exec(raw);
    if (bullet && facts.bullets.length < CAP_BULLETS) {
      const item = plain(bullet[1] as string);
      if (item) {
        const entry: DocFacts["bullets"][number] = { line: lineNo, text: clip(redact(item)) };
        if (heading) entry.heading = heading;
        facts.bullets.push(entry);
      }
    }

    if (NOTE.test(body) && facts.notes.length < CAP_NOTES && body.length <= 320) {
      facts.notes.push({ line: lineNo, text: clip(redact(body.replace(/^[-*+]\s+/, "")), 300) });
    }

    // Links are dropped first so a version in a URL (`Java+JDK+21`) is not read as prose.
    const prose = raw.replace(/\]\([^)]*\)/g, "]");
    for (const { tool, re } of MENTIONS) {
      for (const m of prose.matchAll(re)) {
        const key = `${tool}:${m[1]}`;
        if (!seenMention.has(key) && facts.mentions.length < CAP_MENTIONS) {
          seenMention.add(key);
          facts.mentions.push({ tool, version: m[1] as string, line: lineNo });
        }
      }
    }

    for (const m of raw.matchAll(/`([^`\n]{2,160})`/g)) {
      const token = m[1] as string;
      const path = repoPath(token);
      if (path && !seenPath.has(path) && facts.paths.length < CAP_PATHS) {
        seenPath.add(path);
        facts.paths.push({ path, line: lineNo });
      }
      for (const machine of token.matchAll(MACHINE_PATH)) {
        if (facts.machinePaths.length < CAP_MACHINE) {
          facts.machinePaths.push({ text: clip(redact(machine[0]), 120), line: lineNo });
        }
      }
    }

    for (const m of raw.matchAll(/https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?[^\s)>"'`]*/g)) {
      const url = stripUrlQuery(m[0].replace(/[.,;]+$/, ""));
      if (!seenUrl.has(url) && facts.localUrls.length < CAP_URLS) {
        seenUrl.add(url);
        facts.localUrls.push({ url, line: lineNo });
      }
    }

    lastText = { line: lineNo, text: body };
  }

  return facts;
}
