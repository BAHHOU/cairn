export const TRACKER_ERROR_CODES = [
  "unauthorized",
  "not_found",
  "rate_limited",
  "unreachable",
  "timeout",
  "provider_error",
] as const;
export type TrackerErrorCode = (typeof TRACKER_ERROR_CODES)[number];

/** `message` is safe to display and store: it never contains a credential. */
export class TrackerError extends Error {
  readonly code: TrackerErrorCode;
  constructor(code: TrackerErrorCode, message: string) {
    super(message);
    this.name = "TrackerError";
    this.code = code;
  }
}

export interface FetchOptions {
  fetch?: typeof fetch;
  timeoutMs?: number;
}

/**
 * One call to a tracker's API, read-only in effect (GraphQL queries are POSTs), with every
 * failure mapped to a stable code. Redirects are refused: a credential never follows one.
 */
export async function trackerCall(
  tool: string,
  url: string,
  init: { method?: "GET" | "POST"; headers: Record<string, string>; body?: string },
  options: FetchOptions,
  notFound = `${tool}: not found`,
): Promise<unknown> {
  const doFetch = options.fetch ?? fetch;
  let response: Response;
  try {
    response = await doFetch(url, {
      method: init.method ?? "GET",
      headers: { accept: "application/json", ...init.headers },
      body: init.body,
      redirect: "error",
      signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      throw new TrackerError("timeout", `${tool} did not answer in time`);
    }
    throw new TrackerError("unreachable", `Cannot reach ${tool}`);
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new TrackerError("unauthorized", `${tool} refused the credentials`);
    }
    if (response.status === 404) throw new TrackerError("not_found", notFound);
    if (response.status === 429)
      throw new TrackerError("rate_limited", `${tool} rate limit reached`);
    throw new TrackerError("provider_error", `${tool} answered HTTP ${response.status}`);
  }
  try {
    return await response.json();
  } catch {
    throw new TrackerError("provider_error", `Unexpected answer from ${tool}`);
  }
}

/** Parses an answer, or fails with the tool's name instead of a schema dump. */
export function shaped<T>(tool: string, parse: () => T): T {
  try {
    return parse();
  } catch (error) {
    if (error instanceof TrackerError) throw error;
    throw new TrackerError("provider_error", `Unexpected answer from ${tool}`);
  }
}

/** Timestamps from any tool, as UTC ISO strings, so order and comparisons hold across offsets. */
export const utc = (stamp: string): string => {
  const ms = Date.parse(stamp);
  return Number.isNaN(ms) ? stamp : new Date(ms).toISOString();
};

/** A person's id the policy can map: the e-mail's local part, else the name the tool gives. */
export const localPart = (email: string | null | undefined): string | undefined =>
  email ? email.split("@")[0] : undefined;

/** Where a merge request can cite a ticket: branch, title, description, commit messages. */
export const changeTexts = (change: {
  sourceBranch: string;
  title: string;
  description: string;
  commitMessages: string[];
}): string[] => [change.sourceBranch, change.title, change.description, ...change.commitMessages];

/** Every match of `pattern`'s first group in the texts, through `key`, without duplicates. */
export function collect(
  texts: string[],
  patterns: RegExp[],
  key: (id: string) => string,
): string[] {
  const refs = new Set<string>();
  for (const text of texts) {
    for (const pattern of patterns) {
      for (const m of text.matchAll(pattern)) if (m[1]) refs.add(key(m[1]));
    }
  }
  return [...refs];
}

/** Rich text some tools store as HTML, as the plain text people read and compare. */
export function htmlText(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** `2026-10-16T…` → `2026-10-16`, for APIs that filter by day. */
export const day = (iso: string): string => iso.slice(0, 10);

/** The base of a self-hosted tool's address, without a trailing slash. */
export const trimBase = (url: string): string => url.replace(/\/+$/, "");

export const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
