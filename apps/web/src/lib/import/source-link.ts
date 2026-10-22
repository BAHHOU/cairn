import type { GuideSource } from "@cairn/shared";

/** What is needed to turn a `path:line` of the scan into a link to the file on the forge. */
export interface SourceBase {
  webUrl: string | null;
  branch: string;
  provider: string;
}

/**
 * The page of a file on GitLab or GitHub, at the line a statement was read from. Null when the
 * repository has no web address, so the reference is shown as plain text rather than a dead link.
 */
export function sourceHref(base: SourceBase | null, source: GuideSource): string | null {
  if (!base?.webUrl || !/^https?:\/\//i.test(base.webUrl)) return null;
  const root = base.webUrl.replace(/\/+$/, "");
  const path = source.path.split("/").map(encodeURIComponent).join("/");
  const marker = base.provider === "github" ? "blob" : "-/blob";
  const line = source.line ? `#L${source.line}` : "";
  return `${root}/${marker}/${encodeURIComponent(base.branch)}/${path}${line}`;
}
