import type { CiFacts, CiJob, CiRule, DockerFacts } from "@cairn/shared";
import { parse } from "yaml";

const GITLAB_RESERVED = new Set([
  "stages",
  "variables",
  "workflow",
  "cache",
  "default",
  "include",
  "image",
  "services",
  "before_script",
  "after_script",
  "pages",
]);

const TOOLS: { tool: string; re: RegExp }[] = [
  { tool: "maven", re: /\bmvn\b|\.\/mvnw\b/ },
  { tool: "gradle", re: /\bgradle\b|\.\/gradlew\b/ },
  { tool: "npm", re: /\bnpm\b|\bnpx\b|\byarn\b|\bpnpm\b/ },
  { tool: "sonar", re: /sonar/i },
  { tool: "kaniko", re: /kaniko/i },
  { tool: "docker", re: /\bdocker\b/ },
  { tool: "kubectl", re: /\bkubectl\b/ },
  { tool: "helm", re: /\bhelm\b/ },
  { tool: "kustomize", re: /\bkustomize\b/ },
  { tool: "argocd", re: /\bargocd\b/i },
  { tool: "flux", re: /\bflux\b/ },
  { tool: "terraform", re: /\bterraform\b|\btofu\b/ },
  { tool: "ansible", re: /\bansible(?:-playbook)?\b/ },
  { tool: "compose", re: /docker[- ]compose/ },
  { tool: "ssh", re: /\b(?:ssh|scp|rsync)\s/ },
  { tool: "flyway", re: /\bflyway\b/i },
  { tool: "trivy", re: /\btrivy\b/i },
  { tool: "snyk", re: /\bsnyk\b/i },
  { tool: "dependency-check", re: /dependency-check|owasp/i },
  { tool: "gitleaks", re: /\bgitleaks\b|trufflehog/i },
];

/** Patterns that weaken what a job is meant to guarantee. Only the fact is kept, not the script line. */
const FLAGS: { flag: string; re: RegExp }[] = [
  {
    flag: "tests-skipped",
    re: /-Dmaven\.test\.skip(?:=true)?(?![\w.])|-DskipTests(?:=true)?(?![\w.])/,
  },
  {
    flag: "test-failures-ignored",
    re: /-Dmaven\.test\.failure\.ignore(?:=true)?(?![\w.])|-DtestFailureIgnore(?:=true)?/,
  },
  {
    flag: "tls-unverified",
    re: /ssl\.insecure=true|ssl\.allowall=true|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]?0|strict-ssl\s*[= ]\s*false|GIT_SSL_NO_VERIFY|sslVerify\s+false|--no-check-certificate|--insecure\b/,
  },
  {
    flag: "lockfile-removed",
    re: /\brm\s+(?:-\w+\s+)*[^\n]*(?:package-lock\.json|yarn\.lock|pnpm-lock\.yaml)/,
  },
];

/** Variables the script reads: `$NAME` or `${NAME}`. Names only; lower-case ones are shell locals. */
const VAR_REF = /\$\{?([A-Z][A-Z0-9_]{2,})\}?/g;
const SHELL_VARS = new Set(["HOME", "PATH", "PWD", "JAVA_HOME", "MAVEN_OPTS", "USER", "SHELL"]);

const CAP_JOBS = 80;
const CAP_VARS = 40;

const strings = (value: unknown): string[] => {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  return [];
};

/** `registry.host/team/app:tag` -> `team/app`. The registry host and the tag carry no meaning here. */
export function imageRepository(ref: string): string {
  const noTag = ref.replace(/(@sha256:[0-9a-f]+)$/, "").replace(/:[^/]*$/, "");
  const parts = noTag.split("/");
  const first = parts[0] ?? "";
  if (parts.length > 1 && (first.includes(".") || first.includes(":") || first === "localhost")) {
    parts.shift();
  }
  return parts.join("/");
}

/** The tag as written, variables included: `$ENV-$VERSION`. Undefined when there is none. */
export function imageTag(ref: string): string | undefined {
  const last = ref.slice(ref.lastIndexOf("/") + 1);
  const colon = last.indexOf(":");
  return colon === -1 ? undefined : last.slice(colon + 1) || undefined;
}

/** `$CI_REGISTRY/team/app:tag` -> `$CI_REGISTRY`; `registry.host:5000/app` -> `registry.host:5000`; `team/app` -> none. */
export function registryOf(ref: string): string | undefined {
  const parts = ref.split("/");
  const first = parts[0] ?? "";
  if (parts.length < 2) return undefined;
  if (
    first.startsWith("$") ||
    first.includes(".") ||
    first.includes(":") ||
    first === "localhost"
  ) {
    return first.slice(0, 120);
  }
  return undefined;
}

function pushesOf(script: string[]): CiJob["pushes"] {
  const pushes: CiJob["pushes"] = [];
  for (const line of script) {
    const dest = /--destination[= ]\s*(\S+)/.exec(line)?.[1];
    if (dest) {
      const dockerfile = /--dockerfile[= ]\s*(\S+)/.exec(line)?.[1];
      const tag = imageTag(dest);
      const registry = registryOf(dest);
      pushes.push({
        image: imageRepository(dest),
        ...(tag ? { tag } : {}),
        ...(dockerfile ? { dockerfile: dockerfile.replace(/^\.\//, "") } : {}),
        ...(registry ? { registry } : {}),
      });
      continue;
    }
    const push = /\bdocker\s+push\s+(\S+)/.exec(line)?.[1];
    if (push) {
      const tag = imageTag(push);
      const registry = registryOf(push);
      pushes.push({
        image: imageRepository(push),
        ...(tag ? { tag } : {}),
        ...(registry ? { registry } : {}),
      });
    }
  }
  return pushes;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function lineOfKey(text: string, key: string): number | undefined {
  const match = new RegExp(`^${escapeRe(key)}\\s*:`, "m").exec(text);
  return match ? text.slice(0, match.index).split("\n").length : undefined;
}

function lineOfIndented(text: string, key: string): number | undefined {
  const match = new RegExp(`^[ \\t]+${escapeRe(key)}\\s*:`, "m").exec(text);
  return match ? text.slice(0, match.index).split("\n").length : undefined;
}

const asRules = (raw: unknown): CiRule[] => {
  if (!Array.isArray(raw)) return [];
  const rules: CiRule[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const rule = r as Record<string, unknown>;
    const entry: CiRule = {};
    if (typeof rule.if === "string") entry.if = rule.if.trim().slice(0, 240);
    if (typeof rule.when === "string") entry.when = rule.when;
    if (rule.allow_failure === true) entry.allowFailure = true;
    rules.push(entry);
  }
  return rules;
};

const needsOf = (raw: unknown): string[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((n) =>
      typeof n === "string"
        ? n
        : n && typeof n === "object"
          ? String((n as Record<string, unknown>).job ?? "")
          : "",
    )
    .filter(Boolean);
};

function gitlabJobs(doc: Record<string, unknown>, text: string): CiJob[] {
  const jobs: CiJob[] = [];
  for (const [name, raw] of Object.entries(doc)) {
    if (GITLAB_RESERVED.has(name) || name.startsWith(".")) continue;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const job = raw as Record<string, unknown>;
    if (!("script" in job) && !("trigger" in job) && !("extends" in job)) continue;

    const script = [...strings(job.before_script), ...strings(job.script)];
    const rules = asRules(job.rules);
    const image =
      typeof job.image === "string"
        ? job.image
        : job.image && typeof job.image === "object"
          ? String((job.image as Record<string, unknown>).name ?? "")
          : undefined;
    const env =
      typeof job.environment === "string"
        ? job.environment
        : job.environment && typeof job.environment === "object"
          ? String((job.environment as Record<string, unknown>).name ?? "")
          : undefined;

    const joined = script.join("\n");
    const flags = FLAGS.filter((f) => f.re.test(joined)).map((f) => f.flag);
    if (job.when === "always" || rules.some((r) => r.when === "always")) flags.push("runs-always");

    const vars = new Set<string>();
    for (const source of [joined, ...rules.map((r) => r.if ?? "")]) {
      for (const m of source.matchAll(VAR_REF)) {
        const v = m[1] as string;
        if (!SHELL_VARS.has(v) && vars.size < CAP_VARS) vars.add(v);
      }
    }

    const artifactsRaw =
      job.artifacts && typeof job.artifacts === "object"
        ? (job.artifacts as Record<string, unknown>)
        : {};
    const reports =
      artifactsRaw.reports && typeof artifactsRaw.reports === "object"
        ? (artifactsRaw.reports as Record<string, unknown>)
        : {};
    const retryRaw = job.retry;
    const retry =
      typeof retryRaw === "number"
        ? retryRaw
        : retryRaw && typeof retryRaw === "object"
          ? Number((retryRaw as Record<string, unknown>).max)
          : undefined;

    const entry: CiJob = {
      name,
      manual: job.when === "manual" || rules.some((r) => r.when === "manual"),
      tools: TOOLS.filter((t) => script.some((l) => t.re.test(l))).map((t) => t.tool),
      pushes: pushesOf(script),
    };
    if (typeof job.stage === "string") entry.stage = job.stage;
    if (image) entry.image = image;
    if (env) entry.environment = env;
    const line = lineOfKey(text, name);
    if (line) entry.line = line;
    if (typeof job.when === "string") entry.when = job.when;
    if (job.allow_failure === true || rules.some((r) => r.allowFailure)) entry.allowFailure = true;
    if (rules.length > 0) entry.rules = rules;
    const needs = needsOf(job.needs);
    if (needs.length > 0) entry.needs = needs;
    const artifacts = strings(artifactsRaw.paths).slice(0, 12);
    if (artifacts.length > 0) entry.artifacts = artifacts;
    if (reports.junit) entry.junit = true;
    if (retry && Number.isFinite(retry)) entry.retry = retry;
    if (flags.length > 0) entry.flags = flags;
    if (vars.size > 0) entry.vars = [...vars];
    jobs.push(entry);
    if (jobs.length >= CAP_JOBS) break;
  }
  return jobs;
}

const includesOf = (raw: unknown): string[] => {
  const items = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return items
    .map((i) => {
      if (typeof i === "string") return i;
      if (i && typeof i === "object") {
        const o = i as Record<string, unknown>;
        return String(o.local ?? o.template ?? o.remote ?? o.project ?? "");
      }
      return "";
    })
    .filter(Boolean)
    .slice(0, 20);
};

export function extractCi(path: string, text: string): CiFacts | undefined {
  const base = path.slice(path.lastIndexOf("/") + 1).toLowerCase();

  if (base === "jenkinsfile") {
    const stages = [...text.matchAll(/stage\s*\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1] as string);
    return {
      provider: "jenkins",
      stages,
      jobs: stages.map((name) => ({ name, manual: false, tools: [], pushes: [] })),
    };
  }

  const parsed = parse(text, { maxAliasCount: 50, merge: true }) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
  const doc = parsed as Record<string, unknown>;

  if (path.startsWith(".github/workflows/")) {
    const jobsMap =
      doc.jobs && typeof doc.jobs === "object" ? (doc.jobs as Record<string, unknown>) : {};
    const jobs: CiJob[] = Object.entries(jobsMap)
      .slice(0, CAP_JOBS)
      .map(([name, raw]) => {
        const job = (raw ?? {}) as Record<string, unknown>;
        const steps = Array.isArray(job.steps) ? (job.steps as Record<string, unknown>[]) : [];
        const script = steps.flatMap((s) => strings(s?.run));
        const entry: CiJob = {
          name,
          manual: false,
          tools: TOOLS.filter((t) => script.some((l) => t.re.test(l))).map((t) => t.tool),
          pushes: pushesOf(script),
        };
        const line = lineOfIndented(text, name);
        if (line) entry.line = line;
        const needs = strings(job.needs);
        if (needs.length > 0) entry.needs = needs;
        const flags = FLAGS.filter((f) => f.re.test(script.join("\n"))).map((f) => f.flag);
        if (flags.length > 0) entry.flags = flags;
        return entry;
      });
    return { provider: "github", stages: [], jobs };
  }

  const workflow =
    doc.workflow && typeof doc.workflow === "object"
      ? asRules((doc.workflow as Record<string, unknown>).rules)
          .map((r) => r.if)
          .filter((c): c is string => Boolean(c))
      : [];
  const variables =
    doc.variables && typeof doc.variables === "object" && !Array.isArray(doc.variables)
      ? (doc.variables as Record<string, unknown>)
      : {};
  const includes = includesOf(doc.include);

  const facts: CiFacts = {
    provider: "gitlab",
    stages: Array.isArray(doc.stages) ? (doc.stages as unknown[]).map(String) : [],
    jobs: gitlabJobs(doc, text),
  };
  if (workflow.length > 0) facts.workflow = workflow;
  if (includes.length > 0) facts.includes = includes;
  const defined = Object.entries(variables);
  if (defined.length > 0) {
    facts.definedVars = defined.map(([name, value]) => {
      const from = [...String(value ?? "").matchAll(VAR_REF)].map((m) => m[1] as string);
      const line = lineOfIndented(text, name);
      return { name, ...(line ? { line } : {}), ...(from.length > 0 ? { from } : {}) };
    });
  }
  return facts;
}

const CAP_DOCKER = 40;

export function extractDocker(text: string): DockerFacts {
  const from: string[] = [];
  const expose: number[] = [];
  const jars = new Set<string>();
  const copies: string[] = [];
  const joined = text.replace(/\\\r?\n/g, " ");
  for (const raw of joined.split(/\r?\n/)) {
    const line = raw.trim();
    const instruction = /^([A-Za-z]+)\s+(.*)$/.exec(line);
    if (!instruction) continue;
    const key = (instruction[1] as string).toUpperCase();
    const rest = instruction[2] as string;
    if (key === "FROM") {
      const image = rest.replace(/--platform=\S+\s*/, "").split(/\s+/)[0];
      if (image) from.push(image);
    } else if (key === "EXPOSE") {
      for (const p of rest.split(/\s+/)) {
        const n = Number.parseInt(p, 10);
        if (Number.isFinite(n)) expose.push(n);
      }
    } else if (key === "COPY" || key === "ADD") {
      const args = rest.split(/\s+/).filter((a) => !a.startsWith("--"));
      for (const source of args.slice(0, -1)) if (copies.length < CAP_DOCKER) copies.push(source);
    }
    if (key === "COPY" || key === "ADD" || key === "ENTRYPOINT" || key === "CMD" || key === "RUN") {
      for (const m of rest.matchAll(/[\w.${}/-]*[\w}]\.jar\b/g)) {
        const name = (m[0] as string).split("/").pop();
        if (name) jars.add(name);
      }
    }
  }
  return { from: from.slice(0, CAP_DOCKER), expose, jars: [...jars].slice(0, CAP_DOCKER), copies };
}
