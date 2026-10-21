/** Helpers shared by the extractors. Pure string work, no I/O. */

/**
 * Blanks comments and keeps strings, so `"http://x"` survives and line numbers do not move.
 * `backticks` is for TypeScript template strings.
 */
export function stripComments(src: string, backticks = false): string {
  const strings = backticks
    ? /"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`/
    : /"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/;
  const re = new RegExp(`${strings.source}|\\/\\*[\\s\\S]*?\\*\\/|\\/\\/[^\\n]*`, "g");
  return src.replace(re, (m) => {
    if (m.startsWith("/*")) return m.replace(/[^\n]/g, " ");
    if (m.startsWith("//")) return "";
    return m;
  });
}

/** Line number (1-based) of a character offset, with the line starts computed once. */
export function lineIndex(text: string): (offset: number) => number {
  const starts: number[] = [0];
  for (let i = 0; i < text.length; i += 1) if (text.charCodeAt(i) === 10) starts.push(i + 1);
  return (offset: number) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if ((starts[mid] ?? 0) <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
}

export const countLines = (text: string): number => {
  if (text.length === 0) return 0;
  let n = 1;
  for (let i = 0; i < text.length; i += 1) if (text.charCodeAt(i) === 10) n += 1;
  return text.endsWith("\n") ? n - 1 : n;
};

/** Text between the parenthesis opened right at `open` and its match. Strings are respected. */
export function balanced(text: string, open: number): string | undefined {
  if (text[open] !== "(") return undefined;
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    const c = text[i];
    if (c === '"') {
      i += 1;
      while (i < text.length && text[i] !== '"') i += text[i] === "\\" ? 2 : 1;
    } else if (c === "(") depth += 1;
    else if (c === ")") {
      depth -= 1;
      if (depth === 0) return text.slice(open + 1, i);
    }
  }
  return undefined;
}

/** Splits annotation arguments on the commas that are not nested in (), {} or a string. */
export function splitTopLevel(args: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < args.length; i += 1) {
    const c = args[i];
    if (c === '"') {
      i += 1;
      while (i < args.length && args[i] !== '"') i += args[i] === "\\" ? 2 : 1;
    } else if (c === "(" || c === "{") depth += 1;
    else if (c === ")" || c === "}") depth -= 1;
    else if (c === "," && depth === 0) {
      parts.push(args.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(args.slice(start));
  return parts.map((p) => p.trim()).filter(Boolean);
}

/** First string literal of an argument list: `("/api")`, `(value = "/api")`, `({"/a", "/b"})`. */
export function firstLiteral(
  args: string,
  names: string[] = ["value", "path"],
): string | undefined {
  for (const part of splitTopLevel(args)) {
    const named = /^(\w+)\s*=\s*([\s\S]*)$/.exec(part);
    const key = named?.[1];
    const body = named ? (named[2] ?? "") : part;
    if (key && !names.includes(key)) continue;
    const literal = /"([^"]*)"/.exec(body);
    if (literal) return literal[1];
  }
  return undefined;
}

/** Value of `name = "..."` among the top-level arguments only. */
export function namedLiteral(args: string, name: string): string | undefined {
  for (const part of splitTopLevel(args)) {
    const m = new RegExp(`^${name}\\s*=\\s*"([^"]*)"`).exec(part);
    if (m) return m[1];
  }
  return undefined;
}

export const lastSegment = (dotted: string): string => dotted.slice(dotted.lastIndexOf(".") + 1);

/** Keeps a scheme and a host, drops everything that could carry a credential or a path. */
export function reduceUrl(value: string): string | undefined {
  const m =
    /^([a-z][a-z0-9+.-]*(?::[a-z0-9+.-]+)?):\/\/(?:[^@/\s]*@)?([^/:?#\s,;]+)(?::(\d+))?/i.exec(
      value.trim(),
    );
  if (!m) return undefined;
  return `${m[1]}://${m[2]}${m[3] ? `:${m[3]}` : ""}`;
}
