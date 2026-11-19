import type { TrackerKind } from "@cairn/shared";

/** The kinds a project can link a board from: those whose adapter can list tickets. */
export const LISTABLE_KINDS = [
  "jira",
  "github",
  "linear",
  "taiga",
  "gitea",
  "bugzilla",
  "mantis",
  "trello",
  "notion",
  "gitlab",
  "azure",
  "youtrack",
  "openproject",
  "redmine",
  "asana",
  "clickup",
  "shortcut",
  "plane",
  "monday",
] as const satisfies readonly TrackerKind[];
export type ListableKind = (typeof LISTABLE_KINDS)[number];

export const isListable = (kind: string): kind is ListableKind =>
  (LISTABLE_KINDS as readonly string[]).includes(kind);

/**
 * What people paste, as the scope an adapter lists: a Jira project key or a JQL query, a Trello
 * board link, a Notion database link, a GitLab project path. Null when it is not one.
 */
export function parseScope(kind: ListableKind, raw: string): Record<string, string> | null {
  const value = raw.trim();
  if (!value || value.length > 500) return null;
  switch (kind) {
    case "jira":
      if (/^[A-Z][A-Z0-9]{1,9}$/.test(value)) return { jql: `project = ${value}` };
      return value.length >= 3 ? { jql: value } : null;
    case "trello": {
      const id =
        /trello\.com\/b\/([A-Za-z0-9]{8})/.exec(value)?.[1] ??
        /^[A-Za-z0-9]{8,24}$/.exec(value)?.[0];
      return id ? { board: id } : null;
    }
    case "notion": {
      const id = /([0-9a-f]{32}|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})(?:[?#]|$)/i.exec(
        value,
      )?.[1];
      return id ? { database: id.replace(/-/g, "").toLowerCase() } : null;
    }
    case "gitlab": {
      const path = value.replace(/^https?:\/\/[^/]+\//, "").replace(/\/+$/, "");
      return /^[\w.-]+(?:\/[\w.-]+)+$/.test(path) ? { project: path } : null;
    }
    case "github":
    case "gitea": {
      const path = value
        .replace(/^https?:\/\/[^/]+\//, "")
        .replace(/\/(issues|pulls).*$/, "")
        .replace(/\/+$/, "");
      return /^[\w.-]+\/[\w.-]+$/.test(path) ? { repo: path } : null;
    }
    case "linear": {
      const key = /linear\.app\/[^/]+\/team\/([A-Za-z0-9]+)/.exec(value)?.[1] ?? value;
      return /^[A-Za-z][A-Za-z0-9]{1,9}$/.test(key) ? { team: key.toUpperCase() } : null;
    }
    case "taiga": {
      const slug = /\/project\/([\w-]+)/.exec(value)?.[1] ?? /^[\w-]{1,100}$/.exec(value)?.[0];
      return slug ? { project: slug } : null;
    }
    case "bugzilla": {
      const product = /[?&]product=([^&#]+)/.exec(value)?.[1]?.replace(/\+/g, " ") ?? value;
      const name = decodeURIComponent(product).trim();
      return name.length >= 1 && name.length <= 64 && !/[/?&#]/.test(name)
        ? { product: name }
        : null;
    }
    case "mantis": {
      const id = /[?&]project_id=(\d+)/.exec(value)?.[1] ?? /^\d+$/.exec(value)?.[0];
      return id ? { project: id } : null;
    }
    case "azure": {
      // A project name, or any link inside it: dev.azure.com/<org>/<project>/…
      const name = /dev\.azure\.com\/[^/]+\/([^/?#]+)/.exec(value)?.[1] ?? value;
      const project = decodeURIComponent(name).trim();
      return /^[^/\\:*?"<>|#%]{1,64}$/.test(project) ? { project } : null;
    }
    case "youtrack":
      if (/^[A-Z][A-Z0-9_]{0,19}$/.test(value)) return { query: `project: ${value}` };
      return value.length >= 3 ? { query: value } : null;
    case "shortcut":
      return value.length >= 2 ? { query: value } : null;
    case "openproject": {
      const id = /\/projects\/([\w-]+)/.exec(value)?.[1] ?? /^[\w-]{1,100}$/.exec(value)?.[0];
      return id ? { project: id } : null;
    }
    case "redmine": {
      const id = /\/projects\/([\w-]+)/.exec(value)?.[1] ?? /^[\w-]{1,100}$/.exec(value)?.[0];
      return id ? { project: id } : null;
    }
    case "asana": {
      const id =
        /\/project\/(\d+)/.exec(value)?.[1] ??
        /app\.asana\.com\/0\/(\d+)/.exec(value)?.[1] ??
        /^\d{6,}$/.exec(value)?.[0];
      return id ? { project: id } : null;
    }
    case "clickup": {
      const id = /\/li\/(\d+)/.exec(value)?.[1] ?? /^\d{4,}$/.exec(value)?.[0];
      return id ? { list: id } : null;
    }
    case "plane": {
      const id = /([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})/i.exec(value)?.[1];
      return id ? { project: id.toLowerCase() } : null;
    }
    case "monday": {
      const id = /\/boards\/(\d+)/.exec(value)?.[1] ?? /^\d{4,}$/.exec(value)?.[0];
      return id ? { board: id } : null;
    }
  }
}

/** The scope as people read it back. */
export function describeScope(scope: Record<string, string>): string {
  return (
    scope.jql ??
    scope.repo ??
    scope.team ??
    scope.product ??
    scope.query ??
    scope.board ??
    scope.database ??
    scope.list ??
    scope.project ??
    ""
  );
}
