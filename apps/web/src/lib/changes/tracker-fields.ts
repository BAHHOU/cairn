import type { TrackerKind } from "@cairn/shared";
import { z } from "zod";

/**
 * What each live tracker needs to connect, shared by the form (client) and the action (server).
 * Labels and hints: `integrations.field.<name>`. Secret fields are encrypted and never shown back.
 */

export const LIVE_TRACKERS = [
  "jira",
  "github",
  "gitlab",
  "linear",
  "trello",
  "notion",
  "taiga",
  "gitea",
  "bugzilla",
  "mantis",
  "azure",
  "youtrack",
  "openproject",
  "redmine",
  "asana",
  "clickup",
  "shortcut",
  "plane",
  "monday",
] as const;
export type LiveTracker = (typeof LIVE_TRACKERS)[number];

export const isLiveTracker = (kind: TrackerKind): kind is LiveTracker =>
  (LIVE_TRACKERS as readonly string[]).includes(kind);

export type FieldName =
  | "baseUrl"
  | "edition"
  | "user"
  | "token"
  | "apiUrl"
  | "defaultRepo"
  | "project"
  | "projects"
  | "apiKey"
  | "teams"
  | "key"
  | "criteriaId"
  | "criteriaName"
  | "statusProperty"
  | "approvedAtProperty"
  | "approverProperty"
  | "orgUrl"
  | "username"
  | "password"
  | "workspace";

export interface Field {
  name: FieldName;
  type: "text" | "url" | "secret" | "edition" | "email";
  required: boolean;
  placeholder?: string;
  /** Shown only for one Jira edition. */
  edition?: "basic" | "bearer";
  defaultValue?: string;
}

export const TRACKER_FIELDS: Record<LiveTracker, Field[]> = {
  jira: [
    { name: "edition", type: "edition", required: true },
    { name: "baseUrl", type: "url", required: true, placeholder: "https://jira.example.com" },
    { name: "user", type: "email", required: true, edition: "basic" },
    { name: "token", type: "secret", required: true },
    { name: "projects", type: "text", required: false, placeholder: "PAY, TRE" },
    { name: "criteriaId", type: "text", required: false, placeholder: "customfield_10042" },
    { name: "criteriaName", type: "text", required: false, placeholder: "Acceptance Criteria" },
  ],
  github: [
    { name: "token", type: "secret", required: true },
    { name: "defaultRepo", type: "text", required: false, placeholder: "owner/repository" },
    { name: "apiUrl", type: "url", required: true, defaultValue: "https://api.github.com" },
  ],
  gitlab: [
    { name: "baseUrl", type: "url", required: true, defaultValue: "https://gitlab.com" },
    { name: "project", type: "text", required: true, placeholder: "group/project" },
    { name: "token", type: "secret", required: true },
  ],
  linear: [
    { name: "apiKey", type: "secret", required: true },
    { name: "teams", type: "text", required: false, placeholder: "ENG, OPS" },
  ],
  trello: [
    { name: "key", type: "text", required: true },
    { name: "token", type: "secret", required: true },
  ],
  notion: [
    { name: "token", type: "secret", required: true, placeholder: "ntn_…" },
    { name: "statusProperty", type: "text", required: true, defaultValue: "Status" },
    { name: "approvedAtProperty", type: "text", required: false, placeholder: "Approved on" },
    { name: "approverProperty", type: "text", required: false, placeholder: "Approver" },
  ],
  taiga: [
    { name: "baseUrl", type: "url", required: true, defaultValue: "https://api.taiga.io" },
    { name: "project", type: "text", required: true, placeholder: "acme-payments" },
    { name: "username", type: "text", required: true },
    { name: "password", type: "secret", required: true },
  ],
  gitea: [
    { name: "baseUrl", type: "url", required: true, placeholder: "https://codeberg.org" },
    { name: "token", type: "secret", required: true },
    { name: "defaultRepo", type: "text", required: false, placeholder: "owner/repository" },
  ],
  bugzilla: [
    { name: "baseUrl", type: "url", required: true, placeholder: "https://bugzilla.example.org" },
    { name: "apiKey", type: "secret", required: true },
  ],
  mantis: [
    { name: "baseUrl", type: "url", required: true, placeholder: "https://mantis.example.org" },
    { name: "token", type: "secret", required: true },
  ],
  azure: [
    { name: "orgUrl", type: "url", required: true, placeholder: "https://dev.azure.com/your-org" },
    { name: "token", type: "secret", required: true },
  ],
  youtrack: [
    { name: "baseUrl", type: "url", required: true, placeholder: "https://acme.youtrack.cloud" },
    { name: "token", type: "secret", required: true, placeholder: "perm:…" },
    { name: "projects", type: "text", required: false, placeholder: "PAY, TRE" },
  ],
  openproject: [
    { name: "baseUrl", type: "url", required: true, placeholder: "https://acme.openproject.com" },
    { name: "apiKey", type: "secret", required: true },
  ],
  redmine: [
    { name: "baseUrl", type: "url", required: true, placeholder: "https://redmine.example.org" },
    { name: "apiKey", type: "secret", required: true },
  ],
  asana: [{ name: "token", type: "secret", required: true }],
  clickup: [{ name: "token", type: "secret", required: true, placeholder: "pk_…" }],
  shortcut: [{ name: "token", type: "secret", required: true }],
  plane: [
    { name: "baseUrl", type: "url", required: true, defaultValue: "https://api.plane.so" },
    { name: "workspace", type: "text", required: true, placeholder: "acme" },
    { name: "apiKey", type: "secret", required: true, placeholder: "plane_api_…" },
    { name: "projects", type: "text", required: false, placeholder: "WEB, API" },
  ],
  monday: [
    { name: "token", type: "secret", required: true },
    { name: "statusProperty", type: "text", required: true, defaultValue: "Status" },
    { name: "approvedAtProperty", type: "text", required: false, placeholder: "Approved on" },
    { name: "approverProperty", type: "text", required: false, placeholder: "Approver" },
  ],
};

const url = z
  .string()
  .trim()
  .url()
  .max(300)
  .refine((u) => u.startsWith("https://") || process.env.NODE_ENV !== "production");
const list = (pattern: RegExp) =>
  z
    .string()
    .trim()
    .max(300)
    .optional()
    .transform((v) =>
      (v ?? "")
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean),
    )
    .pipe(z.array(z.string().regex(pattern)));
const secret = z.string().trim().min(8).max(500);
const optional = z
  .string()
  .trim()
  .max(120)
  .optional()
  .transform((v) => v || undefined);
const KEY = /^[A-Z][A-Z0-9]{1,9}$/;
/** Tools that need only a personal token. */
const tokenOnly = z
  .object({ token: secret })
  .transform((v) => ({ settings: {}, secret: { token: v.token } }));

/**
 * Server-side validation per kind: what is stored in clear (`settings`) and what is encrypted
 * (`secret`). Nothing the browser sends is trusted beyond these shapes.
 */
export const TRACKER_INPUT = {
  jira: z
    .object({
      edition: z.enum(["basic", "bearer"]),
      baseUrl: url,
      user: z.string().trim().email().max(200).optional().or(z.literal("")),
      token: secret,
      projects: list(KEY),
      criteriaId: z
        .string()
        .trim()
        .regex(/^(customfield_\d+)?$/)
        .optional(),
      criteriaName: optional,
    })
    .refine((v) => v.edition === "bearer" || Boolean(v.user), { path: ["user"] })
    .transform((v) => ({
      settings: {
        baseUrl: v.baseUrl.replace(/\/+$/, ""),
        edition: v.edition,
        user: v.edition === "basic" ? v.user : undefined,
        projects: v.projects,
        contentFields:
          v.criteriaId && v.criteriaName ? [{ id: v.criteriaId, name: v.criteriaName }] : [],
      },
      secret: { token: v.token },
    })),
  github: z
    .object({
      token: secret,
      defaultRepo: z
        .string()
        .trim()
        .regex(/^([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)?$/)
        .optional(),
      apiUrl: url,
    })
    .transform((v) => ({
      settings: { apiUrl: v.apiUrl.replace(/\/+$/, ""), defaultRepo: v.defaultRepo || undefined },
      secret: { token: v.token },
    })),
  gitlab: z
    .object({
      baseUrl: url,
      project: z
        .string()
        .trim()
        .regex(/^[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+)+$/),
      token: secret,
    })
    .transform((v) => ({
      settings: { baseUrl: v.baseUrl.replace(/\/+$/, ""), project: v.project },
      secret: { token: v.token },
    })),
  linear: z
    .object({ apiKey: secret, teams: list(KEY) })
    .transform((v) => ({ settings: { teams: v.teams }, secret: { apiKey: v.apiKey } })),
  trello: z
    .object({
      key: z
        .string()
        .trim()
        .regex(/^[a-f0-9]{32}$/i),
      token: secret,
    })
    .transform((v) => ({ settings: { key: v.key }, secret: { token: v.token } })),
  notion: z
    .object({
      token: secret,
      statusProperty: z.string().trim().min(1).max(120),
      approvedAtProperty: optional,
      approverProperty: optional,
    })
    .transform((v) => ({
      settings: {
        statusProperty: v.statusProperty,
        approvedAtProperty: v.approvedAtProperty,
        approverProperty: v.approverProperty,
      },
      secret: { token: v.token },
    })),
  taiga: z
    .object({
      baseUrl: url,
      project: z
        .string()
        .trim()
        .regex(/^[a-z0-9][a-z0-9-]{0,99}$/i),
      username: z.string().trim().min(1).max(200),
      password: z.string().min(1).max(500),
    })
    .transform((v) => ({
      settings: {
        baseUrl: v.baseUrl.replace(/\/+$/, ""),
        project: v.project,
        username: v.username,
      },
      secret: { password: v.password },
    })),
  gitea: z
    .object({
      baseUrl: url,
      token: secret,
      defaultRepo: z
        .string()
        .trim()
        .regex(/^([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)?$/)
        .optional(),
    })
    .transform((v) => ({
      settings: { baseUrl: v.baseUrl.replace(/\/+$/, ""), defaultRepo: v.defaultRepo || undefined },
      secret: { token: v.token },
    })),
  bugzilla: z.object({ baseUrl: url, apiKey: secret }).transform((v) => ({
    settings: { baseUrl: v.baseUrl.replace(/\/+$/, "") },
    secret: { token: v.apiKey },
  })),
  mantis: z.object({ baseUrl: url, token: secret }).transform((v) => ({
    settings: { baseUrl: v.baseUrl.replace(/\/+$/, "") },
    secret: { token: v.token },
  })),
  azure: z.object({ orgUrl: url, token: secret }).transform((v) => ({
    settings: { orgUrl: v.orgUrl.replace(/\/+$/, "") },
    secret: { token: v.token },
  })),
  youtrack: z.object({ baseUrl: url, token: secret, projects: list(KEY) }).transform((v) => ({
    settings: { baseUrl: v.baseUrl.replace(/\/+$/, ""), projects: v.projects },
    secret: { token: v.token },
  })),
  openproject: z.object({ baseUrl: url, apiKey: secret }).transform((v) => ({
    settings: { baseUrl: v.baseUrl.replace(/\/+$/, "") },
    secret: { token: v.apiKey },
  })),
  redmine: z.object({ baseUrl: url, apiKey: secret }).transform((v) => ({
    settings: { baseUrl: v.baseUrl.replace(/\/+$/, "") },
    secret: { token: v.apiKey },
  })),
  asana: tokenOnly,
  clickup: tokenOnly,
  shortcut: tokenOnly,
  plane: z
    .object({
      baseUrl: url,
      workspace: z
        .string()
        .trim()
        .regex(/^[a-z0-9][a-z0-9_-]{0,47}$/i),
      apiKey: secret,
      projects: list(KEY),
    })
    .transform((v) => ({
      settings: {
        baseUrl: v.baseUrl.replace(/\/+$/, ""),
        workspace: v.workspace,
        projects: v.projects,
      },
      secret: { token: v.apiKey },
    })),
  monday: z
    .object({
      token: z.string().trim().min(8).max(2000),
      statusProperty: z.string().trim().min(1).max(120),
      approvedAtProperty: optional,
      approverProperty: optional,
    })
    .transform((v) => ({
      settings: {
        statusProperty: v.statusProperty,
        approvedAtProperty: v.approvedAtProperty,
        approverProperty: v.approverProperty,
      },
      secret: { token: v.token },
    })),
} satisfies Record<LiveTracker, z.ZodType>;
