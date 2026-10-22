import type {
  CiFacts,
  CiJob,
  CiRule,
  DeliveryView,
  GuideFinding,
  GuideSource,
  PipelineEnvironmentView,
  PipelineFlag,
  PipelineImageView,
  PipelineJobRole,
  PipelineJobView,
  PipelineStageView,
  PipelineTrigger,
  PipelineVariableKind,
  PipelineVariableView,
} from "@cairn/shared";
import { PIPELINE_FLAGS } from "@cairn/shared";
import { imageNodeId } from "./architecture";
import { imageRepository } from "./facts/ci";
import type { Project } from "./project";
import { buildTopology, type TopologyContext } from "./topology";

/* ------------------------------------------------------------------ *
 * Words for a condition. `$CI_COMMIT_BRANCH == "develop"` is for a machine.
 * ------------------------------------------------------------------ */

const WHEN_LABEL: Record<string, string> = {
  on_success: "automatique",
  manual: "manuel",
  always: "toujours",
  never: "jamais",
  on_failure: "si échec",
  delayed: "différé",
};

/** Exported for tests: the human reading of one GitLab `if:` expression. */
export function humanizeCondition(expression: string): string {
  return expression
    .replace(/\$CI_COMMIT_BRANCH\s*==\s*["']([^"']+)["']/g, "branche $1")
    .replace(/\$CI_COMMIT_BRANCH\s*!=\s*null/g, "sur une branche")
    .replace(/\$CI_COMMIT_BRANCH\s*!=\s*["']([^"']+)["']/g, "hors branche $1")
    .replace(/\$CI_COMMIT_TAG\s*!=\s*null/g, "sur un tag")
    .replace(/\$CI_COMMIT_TAG\s*=~\s*\/([^/]+)\//g, "tag ~ $1")
    .replace(/\$CI_COMMIT_TAG\s*==\s*["']([^"']+)["']/g, "tag $1")
    .replace(/\$CI_PIPELINE_SOURCE\s*!=\s*["']merge_request_event["']/g, "hors merge request")
    .replace(/\$CI_PIPELINE_SOURCE\s*==\s*["']merge_request_event["']/g, "merge request")
    .replace(/\$CI_PIPELINE_SOURCE\s*==\s*["']schedule["']/g, "planifié")
    .replace(/\$CI_DEFAULT_BRANCH/g, "branche par défaut")
    .replace(/\s*\|\|\s*/g, " ou ")
    .replace(/\s*&&\s*/g, " et ")
    .replace(/^["']|["']$/g, "")
    .trim();
}

const isAutomatic = (r: CiRule) => !r.when || r.when === "on_success";

function triggerOf(job: CiJob): { trigger: PipelineTrigger; conditions: string[] } {
  const rules = job.rules ?? [];
  if (job.when === "manual" && rules.length === 0) return { trigger: "manual", conditions: [] };
  if (rules.length === 0) return { trigger: "auto", conditions: [] };

  const live = rules.filter((r) => r.when !== "never");
  const autos = live.filter(isAutomatic);
  const manuals = live.filter((r) => r.when === "manual");
  const conditional = autos.some((r) => r.if) || (autos.length > 0 && manuals.length > 0);

  const conditions: string[] = [];
  const single = rules.length === 1 && !rules[0]?.if && isAutomatic(rules[0] as CiRule);
  if (!single) {
    for (const r of rules) {
      const when = WHEN_LABEL[r.when ?? "on_success"] ?? r.when ?? "automatique";
      conditions.push(r.if ? `${humanizeCondition(r.if)} → ${when}` : `sinon → ${when}`);
    }
  }
  const trigger: PipelineTrigger =
    autos.length === 0 && manuals.length > 0 ? "manual" : conditional ? "conditional" : "auto";
  return { trigger, conditions };
}

/* ------------------------------------------------------------------ *
 * What a job is for.
 * ------------------------------------------------------------------ */

const SECURITY_TOOLS = ["trivy", "snyk", "dependency-check", "gitleaks"];

function roleOf(job: CiJob, stage: string): PipelineJobRole {
  const tools = new Set(job.tools);
  const label = `${job.name} ${stage}`;
  if (
    job.environment ||
    ["kubectl", "helm", "kustomize", "argocd", "flux", "terraform", "ansible", "compose"].some(
      (t) => tools.has(t),
    )
  ) {
    return "deploy";
  }
  if (job.pushes.length > 0 || tools.has("kaniko")) return "package";
  if (
    SECURITY_TOOLS.some((t) => tools.has(t)) ||
    /sast|secret[-_]?detect|vuln|trivy|snyk|dependency[-_]?(?:scan|check)|security/i.test(label)
  ) {
    return "security";
  }
  if (tools.has("sonar") || /sonar|quality|lint/i.test(label)) return "quality";
  if (/nexus|publish|upload|artifacts?\b|registry/i.test(job.name)) return "publish";
  if (/deploy|release|rollout/i.test(label)) return "deploy";
  if (/test|spec|e2e|integration|verify/i.test(label)) return "test";
  if (tools.has("maven") || tools.has("gradle") || tools.has("npm")) return "build";
  return "other";
}

/** `docker-remote.registry.host/library/maven:3.9.5-eclipse-temurin-21` -> `maven`, `3.9.5-eclipse-temurin-21`. */
function splitImage(ref: string): { name: string; version?: string } {
  const repo = imageRepository(ref);
  const name = repo.slice(repo.lastIndexOf("/") + 1) || ref;
  const last = ref.slice(ref.lastIndexOf("/") + 1);
  const colon = last.indexOf(":");
  const version = colon === -1 ? undefined : last.slice(colon + 1);
  return { name, ...(version ? { version } : {}) };
}

const isUnpinned = (ref: string) => {
  const { version } = splitImage(ref);
  return !version || version === "latest";
};

/* ------------------------------------------------------------------ *
 * Variables.
 * ------------------------------------------------------------------ */

const SECRET_NAME = /PASS|PWD|TOKEN|SECRET|KEY|CERT|CREDENTIAL|LOGIN/;

function variableKind(name: string, definedInFile: boolean): PipelineVariableKind {
  if (/^(CI|GITLAB|RUNNER)_/.test(name) || name === "CI") return "gitlab";
  if (SECRET_NAME.test(name)) return definedInFile ? "project" : "secret";
  return "project";
}

/* ------------------------------------------------------------------ *
 * Environments: folders named after an environment, under a conventional parent.
 * ------------------------------------------------------------------ */

const ENV_PARENT =
  /(?:^|\/)(?:build|config|configs|deploy|deployment|env|envs|environments|helm|k8s|kubernetes|overlays)\/([A-Za-z0-9_-]+)\//;
const ENV_NAME =
  /^(?:dev|development|int|integration|qual\d*|qa|test|uat|preprod|pre-prod|stag(?:e|ing)|prod|production|prd|sandbox|local|mock|demo)$/i;
const ENV_ORDER = [
  "local",
  "mock",
  "dev",
  "development",
  "int",
  "integration",
  "test",
  "qa",
  "qual",
];

function environmentsOf(project: Project): PipelineEnvironmentView[] {
  const found = new Map<string, PipelineEnvironmentView>();
  for (const f of project.files) {
    if (f.kind === "generated" || f.kind === "binary") continue;
    const name = ENV_PARENT.exec(f.path)?.[1];
    if (!name || !ENV_NAME.test(name)) continue;
    const key = name.toLowerCase();
    const entry = found.get(key) ?? { name: key, files: 0 };
    entry.files += 1;
    if (!entry.example) entry.example = f.path;
    found.set(key, entry);
  }
  const rank = (n: string) => {
    const i = ENV_ORDER.findIndex((o) => n.startsWith(o));
    return i === -1 ? ENV_ORDER.length : i;
  };
  return [...found.values()].sort(
    (a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name),
  );
}

/* ------------------------------------------------------------------ *
 * The builder.
 * ------------------------------------------------------------------ */

function findDockerfile(project: Project, ref: string): string | undefined {
  const clean = ref.replace(/^\.\//, "");
  if (project.byPath.has(clean)) return clean;
  const base = clean.slice(clean.lastIndexOf("/") + 1);
  return [...project.byPath.keys()].find((p) => p.slice(p.lastIndexOf("/") + 1) === base);
}

const src = (path: string, line?: number): GuideSource => (line ? { path, line } : { path });

export function buildDelivery(
  project: Project,
  context: Partial<TopologyContext> = {},
): DeliveryView | null {
  const ciFiles = project.files.filter((f) => f.facts?.ci);
  if (ciFiles.length === 0) return null;

  // GitLab and Jenkins have one pipeline file; GitHub has one per workflow, so those are merged.
  const primary =
    ciFiles.find((f) => f.facts?.ci?.provider !== "github") ?? (ciFiles[0] as (typeof ciFiles)[0]);
  const provider = (primary.facts as { ci: CiFacts }).ci.provider;
  const members = provider === "github" ? ciFiles : [primary];

  const jobsWithPath: { job: CiJob; path: string; stage: string }[] = [];
  const stageOrder: string[] = [];
  for (const file of members) {
    const ci = file.facts?.ci as CiFacts;
    const fileStage = file.path.slice(file.path.lastIndexOf("/") + 1).replace(/\.ya?ml$/, "");
    for (const s of ci.stages) if (!stageOrder.includes(s)) stageOrder.push(s);
    for (const job of ci.jobs) {
      // GitLab puts a job without `stage:` in `test`.
      const stage = job.stage ?? (provider === "gitlab" ? "test" : fileStage);
      if (!stageOrder.includes(stage)) stageOrder.push(stage);
      jobsWithPath.push({ job, path: file.path, stage });
    }
  }

  const stageJobs = new Map<string, PipelineJobView[]>();
  for (const { job, stage } of jobsWithPath) {
    const { trigger, conditions } = triggerOf(job);
    const view: PipelineJobView = {
      name: job.name,
      stage,
      role: roleOf(job, stage),
      tools: job.tools,
      trigger,
      conditions,
      blocking: !job.allowFailure,
      needs: job.needs ?? [],
      artifacts: job.artifacts ?? [],
      reportsTests: Boolean(job.junit),
      pushes: job.pushes,
      flags: (job.flags ?? []).filter((f): f is PipelineFlag =>
        (PIPELINE_FLAGS as readonly string[]).includes(f),
      ),
      variables: job.vars ?? [],
    };
    if (job.line) view.line = job.line;
    if (job.image) view.image = splitImage(job.image);
    if (job.retry) view.retry = job.retry;
    const list = stageJobs.get(stage) ?? [];
    list.push(view);
    stageJobs.set(stage, list);
  }
  const stages: PipelineStageView[] = stageOrder
    .filter((s) => stageJobs.has(s))
    .map((name) => ({ name, jobs: stageJobs.get(name) as PipelineJobView[] }));
  const allJobs = stages.flatMap((s) => s.jobs);
  const pathOfJob = new Map(jobsWithPath.map((j) => [j.job.name, j.path] as const));
  const jobSource = (job: PipelineJobView) =>
    src(pathOfJob.get(job.name) ?? primary.path, job.line);

  /* ---- images ---- */
  const images: PipelineImageView[] = [];
  const seenImage = new Set<string>();
  for (const job of allJobs) {
    for (const push of job.pushes) {
      const repository = imageRepository(push.image);
      if (!repository || seenImage.has(`${repository}:${push.tag ?? ""}`)) continue;
      seenImage.add(`${repository}:${push.tag ?? ""}`);
      const dockerPath = push.dockerfile ? findDockerfile(project, push.dockerfile) : undefined;
      const docker = dockerPath ? project.byPath.get(dockerPath)?.facts?.docker : undefined;
      const image: PipelineImageView = {
        repository,
        exposes: docker?.expose ?? [],
        builtBy: job.name,
        nodeId: imageNodeId(repository),
        source: dockerPath ? src(dockerPath) : jobSource(job),
      };
      if (push.tag) image.tag = push.tag;
      if (dockerPath) image.dockerfile = dockerPath;
      const base = docker?.from[docker.from.length - 1];
      if (base) image.baseImage = base;
      const jar = docker?.jars[0];
      if (jar) image.jar = jar;
      images.push(image);
    }
  }

  /* ---- variables ---- */
  const ciOfPrimary = primary.facts?.ci as CiFacts;
  const defined = new Map((ciOfPrimary.definedVars ?? []).map((v) => [v.name, v] as const));
  const usage = new Map<string, Set<string>>();
  const use = (name: string, by: string) => {
    const set = usage.get(name) ?? new Set<string>();
    set.add(by);
    usage.set(name, set);
  };
  for (const job of allJobs) for (const v of job.variables) use(v, job.name);
  for (const v of defined.values()) for (const ref of v.from ?? []) use(ref, "variables");
  const variables: PipelineVariableView[] = [...usage.entries()]
    .map(([name, usedBy]) => {
      const definedInFile = defined.has(name) && !(defined.get(name)?.from?.length ?? 0);
      return {
        name,
        kind: variableKind(name, definedInFile),
        usedBy: [...usedBy].sort(),
        definedInFile,
      } satisfies PipelineVariableView;
    })
    .sort((a, b) => {
      const order: Record<PipelineVariableKind, number> = { secret: 0, project: 1, gitlab: 2 };
      return order[a.kind] - order[b.kind] || a.name.localeCompare(b.name);
    });

  /* ---- findings ---- */
  const findings: GuideFinding[] = [];
  const add = (f: GuideFinding) => findings.push(f);
  const testsRunElsewhere = (self: PipelineJobView) =>
    allJobs.some(
      (j) =>
        j !== self &&
        (j.tools.includes("maven") || j.tools.includes("gradle") || j.tools.includes("npm")) &&
        !j.flags.includes("tests-skipped"),
    );

  for (const job of allJobs) {
    if ((job.role === "quality" || job.role === "security") && !job.blocking) {
      add({
        id: `nonblocking-${job.name}`,
        severity: job.role === "security" ? "critical" : "major",
        title: `« ${job.name} » n'arrête rien`,
        detail:
          "Le job s'exécute et publie son résultat, mais un échec laisse passer la suite de la chaîne. Le rapport existe ; la barrière, non.",
        source: jobSource(job),
        proposal:
          "Retirer l'indulgence sur ce job, au moins pour la branche principale et les tags.",
      });
    }
    if (job.flags.includes("test-failures-ignored")) {
      add({
        id: `failures-ignored-${job.name}`,
        severity: "major",
        title: `Les échecs de tests sont ignorés dans « ${job.name} »`,
        detail:
          "Le job demande à Maven de continuer malgré des tests en échec : un test rouge ne fait pas échouer l'étape.",
        source: jobSource(job),
        proposal: "Laisser les tests échouer, ou isoler explicitement les tests instables.",
      });
    }
    if (job.flags.includes("tests-skipped")) {
      add({
        id: `tests-skipped-${job.name}`,
        severity: testsRunElsewhere(job) ? "minor" : "major",
        title: `« ${job.name} » désactive les tests`,
        detail: testsRunElsewhere(job)
          ? "Ce que ce job produit n'est pas retesté ici. C'est acceptable seulement si l'étape qui l'a construit a bloqué sur ses tests."
          : "Aucun autre job ne lance les tests : ce qui est produit n'a jamais été vérifié par la chaîne.",
        source: jobSource(job),
      });
    }
    if (job.flags.includes("lockfile-removed")) {
      add({
        id: `lockfile-removed-${job.name}`,
        severity: "major",
        title: `« ${job.name} » supprime le verrou des dépendances`,
        detail:
          "Le fichier de verrouillage npm est effacé avant l'installation : deux exécutions du même commit peuvent embarquer des versions différentes, et une dépendance compromise passe sans bruit.",
        source: jobSource(job),
        proposal: "Conserver le verrou et installer avec `npm ci`.",
      });
    }
    if (job.flags.includes("runs-always") && ["publish", "deploy", "package"].includes(job.role)) {
      add({
        id: `runs-always-${job.name}`,
        severity: "major",
        title: `« ${job.name} » s'exécute même si les étapes précédentes échouent`,
        detail:
          "La règle `when: always` lance le job quel que soit le résultat de la construction et des tests : une version cassée peut être publiée.",
        source: jobSource(job),
        proposal: "Utiliser `when: on_success` pour tout ce qui publie.",
      });
    }
  }

  const insecure = allJobs.filter((j) => j.flags.includes("tls-unverified"));
  if (insecure.length > 0) {
    const first = insecure[0] as PipelineJobView;
    add({
      id: "tls-unverified",
      severity: "major",
      title: `${insecure.length} job${insecure.length > 1 ? "s" : ""} désactive${insecure.length > 1 ? "nt" : ""} la vérification des certificats TLS`,
      detail: `Les téléchargements de dépendances ne vérifient plus l'identité du serveur : ${insecure
        .map((j) => j.name)
        .join(", ")}. Un intermédiaire peut servir un artefact piégé.`,
      source: jobSource(first),
      proposal:
        "Installer l'autorité de certification interne dans l'image plutôt que de désactiver la vérification.",
    });
  }

  const mrRules = ciOfPrimary.workflow ?? [];
  let mergeRequestPipelines: boolean | null = null;
  if (mrRules.some((c) => /\$CI_PIPELINE_SOURCE\s*!=\s*["']merge_request_event["']/.test(c))) {
    mergeRequestPipelines = false;
  } else if (mrRules.some((c) => /merge_request_event/.test(c))) {
    mergeRequestPipelines = true;
  }
  if (mergeRequestPipelines === false) {
    add({
      id: "no-merge-request-pipeline",
      severity: "major",
      title: "Aucun pipeline sur les merge requests",
      detail:
        "La règle `workflow` exclut les merge requests : le code n'est ni construit ni testé avant d'être relu et fusionné. L'échec n'apparaît qu'après la fusion.",
      source: src(primary.path),
      proposal:
        "Laisser le pipeline tourner sur les merge requests, au moins pour la construction et les tests.",
    });
  }

  const includes = ciOfPrimary.includes ?? [];
  if (!allJobs.some((j) => j.role === "security")) {
    add({
      id: "no-security-job",
      severity: "major",
      title: "Aucune analyse de sécurité dans la chaîne",
      detail: `Ni analyse des dépendances, ni scan d'image, ni détection de secrets n'est lancée par ce pipeline${
        includes.length > 0 ? " (les fichiers inclus n'ont pas été lus)" : ""
      }. Rien ne cherche les failles connues avant la publication.`,
      source: src(primary.path),
      proposal:
        "Ajouter un scan de l'image et une détection de secrets, d'abord en mode informatif.",
    });
  }

  const deploysToEnvironment = allJobs.some((j) => j.role === "deploy");
  if (!deploysToEnvironment) {
    add({
      id: "no-environment-deploy",
      severity: "minor",
      title: "La chaîne s'arrête avant le déploiement",
      detail:
        "Aucun job ne déploie vers un environnement (ni kubectl, ni helm, ni `environment:`). Le pipeline construit et publie ; le déploiement est piloté ailleurs et n'est pas visible depuis ce dépôt.",
      source: src(primary.path),
    });
  }

  for (const job of allJobs) {
    const raw = jobsWithPath.find((j) => j.job.name === job.name)?.job.image;
    if (raw && isUnpinned(raw)) {
      add({
        id: `unpinned-image-${job.name}`,
        severity: "minor",
        title: `« ${job.name} » utilise une image non épinglée`,
        detail: `L'image ${splitImage(raw).name} n'a pas de version fixe : le même commit peut se construire différemment d'un jour à l'autre.`,
        source: jobSource(job),
      });
    }
  }

  const rank = { blocker: 0, critical: 1, major: 2, minor: 3 } as const;
  findings.sort((a, b) => rank[a.severity] - rank[b.severity] || a.id.localeCompare(b.id));

  const draft: Omit<DeliveryView, "topology"> = {
    path: primary.path,
    provider,
    stages,
    images,
    variables,
    environments: environmentsOf(project),
    mergeRequestPipelines,
    includes,
    deploysToEnvironment,
    findings,
    counts: {
      jobs: allJobs.length,
      manual: allJobs.filter((j) => j.trigger === "manual").length,
      nonBlocking: allJobs.filter((j) => !j.blocking).length,
      images: images.length,
    },
  };
  return {
    ...draft,
    topology: buildTopology(project, draft, {
      architecture: context.architecture ?? null,
      repoProvider: context.repoProvider ?? null,
      repoName: context.repoName ?? "",
    }),
  };
}
