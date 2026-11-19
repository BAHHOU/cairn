import type { AdapterOptions, TrackerAdapter, TrackerConnection } from "./adapter";
import { asanaTracker } from "./asana";
import { azureTracker } from "./azure";
import { bugzillaTracker } from "./bugzilla";
import { clickupTracker } from "./clickup";
import { giteaTracker } from "./gitea";
import { githubTracker } from "./github";
import { gitlabTracker } from "./gitlab";
import { jiraTracker } from "./jira";
import { linearTracker } from "./linear";
import { mantisTracker } from "./mantis";
import { mondayTracker } from "./monday";
import { notionTracker } from "./notion";
import { openprojectTracker } from "./openproject";
import { planeTracker } from "./plane";
import { redmineTracker } from "./redmine";
import { shortcutTracker } from "./shortcut";
import { taigaTracker } from "./taiga";
import { trelloTracker } from "./trello";
import { youtrackTracker } from "./youtrack";

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
    case "taiga":
      return taigaTracker(connection, options);
    case "gitea":
      return giteaTracker(connection, options);
    case "bugzilla":
      return bugzillaTracker(connection, options);
    case "mantis":
      return mantisTracker(connection, options);
    case "azure":
      return azureTracker(connection, options);
    case "youtrack":
      return youtrackTracker(connection, options);
    case "openproject":
      return openprojectTracker(connection, options);
    case "redmine":
      return redmineTracker(connection, options);
    case "asana":
      return asanaTracker(connection, options);
    case "clickup":
      return clickupTracker(connection, options);
    case "shortcut":
      return shortcutTracker(connection, options);
    case "plane":
      return planeTracker(connection, options);
    case "monday":
      return mondayTracker(connection, options);
  }
}
