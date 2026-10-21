import type { CiFacts, CiJob, DockerFacts } from "@cairn/shared";
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
  { tool: "flyway", re: /\bflyway\b/i },
];

const CAP_JOBS = 80;

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

function pushesOf(script: string[]): CiJob["pushes"] {
  const pushes: CiJob["pushes"] = [];
  for (const line of script) {
    const dest = /--destination[= ]\s*(\S+)/.exec(line)?.[1];
    if (dest) {
      const dockerfile = /--dockerfile[= ]\s*(\S+)/.exec(line)?.[1];
      pushes.push({
        image: imageRepository(dest),
        ...(dockerfile ? { dockerfile: dockerfile.replace(/^\.\//, "") } : {}),
      });
      continue;
    }
    const push = /\bdocker\s+push\s+(\S+)/.exec(line)?.[1];
    if (push) pushes.push({ image: imageRepository(push) });
  }
  return pushes;
}

function gitlabJobs(doc: Record<string, unknown>): CiJob[] {
  const jobs: CiJob[] = [];
  for (const [name, raw] of Object.entries(doc)) {
    if (GITLAB_RESERVED.has(name) || name.startsWith(".")) continue;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const job = raw as Record<string, unknown>;
    if (!("script" in job) && !("trigger" in job) && !("extends" in job)) continue;

    const script = [...strings(job.before_script), ...strings(job.script)];
    const rules = Array.isArray(job.rules) ? (job.rules as Record<string, unknown>[]) : [];
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

    const entry: CiJob = {
      name,
      manual: job.when === "manual" || rules.some((r) => r && r.when === "manual"),
      tools: TOOLS.filter((t) => script.some((l) => t.re.test(l))).map((t) => t.tool),
      pushes: pushesOf(script),
    };
    if (typeof job.stage === "string") entry.stage = job.stage;
    if (image) entry.image = image;
    if (env) entry.environment = env;
    jobs.push(entry);
    if (jobs.length >= CAP_JOBS) break;
  }
  return jobs;
}

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
        return {
          name,
          manual: false,
          tools: TOOLS.filter((t) => script.some((l) => t.re.test(l))).map((t) => t.tool),
          pushes: pushesOf(script),
        };
      });
    return { provider: "github", stages: [], jobs };
  }

  return {
    provider: "gitlab",
    stages: Array.isArray(doc.stages) ? (doc.stages as unknown[]).map(String) : [],
    jobs: gitlabJobs(doc),
  };
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
