import type { AdapterOptions, TrackerAdapter, TrackerConnection } from "./adapter";
import { githubTracker } from "./github";
import { gitlabTracker } from "./gitlab";
import { jiraTracker } from "./jira";
import { linearTracker } from "./linear";
import { notionTracker } from "./notion";
import { trelloTracker } from "./trello";

/** The adapter for a stored connection. Only `live` kinds of the catalog have one. */
export function createTracker(
  connection: TrackerConnection,
  options: AdapterOptions = {},
): TrackerAdapter {
  switch (connection.kind) {
    case "jira":
      return jiraTracker(connection, options);
    case "github":
      return githubTracker(connection, options);
    case "gitlab":
      return gitlabTracker(connection, options);
    case "linear":
      return linearTracker(connection, options);
    case "trello":
      return trelloTracker(connection, options);
    case "notion":
      return notionTracker(connection, options);
  }
}
