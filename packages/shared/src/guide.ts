import type { Severity } from "./domain";

/**
 * The three guides read out of an imported repository: how a commit travels (CI/CD), how a
 * newcomer gets it running (Démarrage), and what documentation exists and how far it has drifted
 * from the code (Documentation).
 *
 * Everything here is read from files, never measured at runtime: no durations, no approvals, no
 * run history. What cannot be read from the repository is absent, not estimated.
 * Every statement carries the file (and line) it comes from, so it can be contradicted.
 */

export interface GuideSource {
  path: string;
  line?: number;
}

/** A verifiable observation. Nothing is scored: a reader either agrees with the sentence or not. */
export interface GuideFinding {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  source?: GuideSource;
  /** What to do about it. Cairn proposes, it never edits the repository. */
  proposal?: string;
}

/* ------------------------------------------------------------------ *
 * CI/CD: the pipeline and where it leads
 * ------------------------------------------------------------------ */

export const PIPELINE_JOB_ROLES = [
  "build",
  "test",
  "quality",
  "security",
  "package",
  "publish",
  "deploy",
  "other",
] as const;
export type PipelineJobRole = (typeof PIPELINE_JOB_ROLES)[number];

export const PIPELINE_JOB_ROLE_LABEL: Record<PipelineJobRole, string> = {
  build: "Construction",
  test: "Tests",
  quality: "Qualité",
  security: "Sécurité",
  package: "Image",
  publish: "Publication",
  deploy: "Déploiement",
  other: "Autre",
};

/** `auto` runs by itself, `manual` waits for someone, `conditional` depends on the branch or tag. */
export type PipelineTrigger = "auto" | "manual" | "conditional";

export const PIPELINE_TRIGGER_LABEL: Record<PipelineTrigger, string> = {
  auto: "Automatique",
  manual: "Manuel",
  conditional: "Selon la branche",
};

/** Things the job does that weaken what it is supposed to guarantee. */
export const PIPELINE_FLAGS = [
  "tests-skipped",
  "test-failures-ignored",
  "tls-unverified",
  "lockfile-removed",
  "runs-always",
] as const;
export type PipelineFlag = (typeof PIPELINE_FLAGS)[number];

export const PIPELINE_FLAG_LABEL: Record<PipelineFlag, string> = {
  "tests-skipped": "Tests désactivés",
  "test-failures-ignored": "Échecs de tests ignorés",
  "tls-unverified": "Certificats TLS non vérifiés",
  "lockfile-removed": "Verrou des dépendances supprimé",
  "runs-always": "S'exécute même après un échec",
};

export interface PipelineJobView {
  name: string;
  stage: string;
  role: PipelineJobRole;
  line?: number;
  image?: { name: string; version?: string };
  tools: string[];
  trigger: PipelineTrigger;
  /** The conditions, in words: "branche develop ou branche master ou un tag". */
  conditions: string[];
  /** False when a failure lets the pipeline continue. */
  blocking: boolean;
  retry?: number;
  needs: string[];
  artifacts: string[];
  /** Publishes test reports (JUnit). */
  reportsTests: boolean;
  pushes: { image: string; tag?: string; dockerfile?: string; registry?: string }[];
  flags: PipelineFlag[];
  /** Variables the job reads. Names only, never values. */
  variables: string[];
}

export interface PipelineStageView {
  name: string;
  jobs: PipelineJobView[];
}

export interface PipelineImageView {
  repository: string;
  /** The tag as written, with its variables: `$QIS_ENVIRONMENT-$QIS_IMAGE_VERSION`. */
  tag?: string;
  dockerfile?: string;
  baseImage?: string;
  exposes: number[];
  /** The jar the image runs. */
  jar?: string;
  builtBy: string;
  /** Architecture node of the service the image runs, when it could be matched. */
  nodeId?: string;
  source?: GuideSource;
}

export const PIPELINE_VARIABLE_KINDS = ["gitlab", "secret", "project"] as const;
export type PipelineVariableKind = (typeof PIPELINE_VARIABLE_KINDS)[number];

export const PIPELINE_VARIABLE_KIND_LABEL: Record<PipelineVariableKind, string> = {
  gitlab: "Fournie par la plateforme CI",
  secret: "À fournir, sensible",
  project: "À fournir dans les réglages CI/CD",
};

export interface PipelineVariableView {
  name: string;
  kind: PipelineVariableKind;
  usedBy: string[];
  /** True when the pipeline file gives it a value or an alias itself. */
  definedInFile: boolean;
}

export interface PipelineEnvironmentView {
  name: string;
  /** Config files found for it in the repository. */
  files: number;
  example?: string;
}

/* ------------------------------------------------------------------ *
 * The delivery topology: what talks to what, from the commit to what runs.
 * ------------------------------------------------------------------ */

/** Columns of the picture, left to right. */
export const TOPOLOGY_LANES = ["source", "pipeline", "services", "deliver", "run", "data"] as const;
export type TopologyLane = (typeof TOPOLOGY_LANES)[number];

export const TOPOLOGY_LANE_LABEL: Record<TopologyLane, string> = {
  source: "Code",
  pipeline: "Pipeline",
  services: "Dépôts et services reliés",
  deliver: "Déploiement",
  run: "Exécution",
  data: "Dépendances",
};

export const TOPOLOGY_LANE_HINT: Record<TopologyLane, string> = {
  source: "Où vit le code",
  pipeline: "Ce que la chaîne exécute",
  services: "Registres, dépôts d'artefacts, qualité",
  deliver: "Ce qui met en ligne",
  run: "Ce qui tourne",
  data: "Ce dont l'application a besoin",
};

/** Technologies that get a logo. Anything else falls back to a generic icon of its `role`. */
export const TOPOLOGY_BRANDS = [
  "gitlab",
  "github",
  "git",
  "githubactions",
  "jenkins",
  "docker",
  "podman",
  "kubernetes",
  "argocd",
  "flux",
  "helm",
  "terraform",
  "ansible",
  "pulumi",
  "tekton",
  "sonarqube",
  "nexus",
  "jfrog",
  "harbor",
  "kaniko",
  "maven",
  "gradle",
  "npm",
  "nodejs",
  "angular",
  "java",
  "spring",
  "postgresql",
  "kafka",
  "redis",
  "flyway",
  "trivy",
  "snyk",
  "vault",
  "nginx",
  "prometheus",
  "grafana",
  "rancher",
  "portainer",
  "linux",
  "vmware",
  "googlecloud",
] as const;
export type TopologyBrand = (typeof TOPOLOGY_BRANDS)[number];

/** What a node is, for the generic icon used when no logo exists, and for the legend. */
export const TOPOLOGY_ROLES = [
  "repository",
  "pipeline",
  "step",
  "registry",
  "artifacts",
  "quality",
  "gitops",
  "deploy",
  "infrastructure",
  "cluster",
  "environment",
  "workload",
  "datastore",
  "queue",
  "external",
  "unknown",
] as const;
export type TopologyRole = (typeof TOPOLOGY_ROLES)[number];

/**
 * `found` is written in a file, `inferred` is a deduction (the edge says which), `missing` is what a
 * delivery chain normally has and this repository does not describe.
 */
export type TopologyBasis = "found" | "inferred" | "missing";

export const TOPOLOGY_BASIS_LABEL: Record<TopologyBasis, string> = {
  found: "Lu dans le dépôt",
  inferred: "Déduit",
  missing: "Non décrit dans le dépôt",
};

export interface TopologyNode {
  id: string;
  lane: TopologyLane;
  label: string;
  role: TopologyRole;
  brand?: TopologyBrand;
  /** One line under the label. */
  detail?: string;
  /** Small tags: job names, namespaces, image names. */
  chips?: string[];
  basis: TopologyBasis;
  source?: GuideSource;
  /** Architecture node this one is the same thing as, to open it in the architecture view. */
  archNodeId?: string;
  /** Job of the pipeline this node stands for, to open its detail. */
  jobs?: string[];
  /** Weak spots found in the jobs behind this node (see the findings of the pipeline). */
  alerts?: number;
}

export interface TopologyEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
  basis: TopologyBasis;
  source?: GuideSource;
}

export interface TopologyView {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  /** What the picture cannot say, in words. */
  gaps: string[];
}

export interface DeliveryView {
  path: string;
  provider: "gitlab" | "github" | "jenkins";
  stages: PipelineStageView[];
  images: PipelineImageView[];
  variables: PipelineVariableView[];
  environments: PipelineEnvironmentView[];
  /** `false` when merge requests are excluded from pipelines. `null` when it cannot be told. */
  mergeRequestPipelines: boolean | null;
  /** The pipeline pulls in other files that were not read. */
  includes: string[];
  /** Any step that reaches a running environment (kubectl, helm, an `environment:`). */
  deploysToEnvironment: boolean;
  findings: GuideFinding[];
  counts: { jobs: number; manual: number; nonBlocking: number; images: number };
  /** Absent on a scan made before the topology existed: it reappears on the next scan. */
  topology?: TopologyView;
}

/* ------------------------------------------------------------------ *
 * Démarrage: getting it running
 * ------------------------------------------------------------------ */

export const GUIDE_PHASES = ["prerequis", "services", "build", "run", "verify", "other"] as const;
export type GuidePhase = (typeof GUIDE_PHASES)[number];

export const GUIDE_PHASE_LABEL: Record<GuidePhase, string> = {
  prerequis: "Prérequis",
  services: "Services locaux",
  build: "Compilation",
  run: "Démarrage",
  verify: "Vérification",
  other: "Autres étapes",
};

export const GUIDE_PHASE_HINT: Record<GuidePhase, string> = {
  prerequis: "Ce qui doit être installé sur le poste",
  services: "Base de données, messagerie : ce qui tourne à côté de l'application",
  build: "Construire le projet",
  run: "Lancer l'application",
  verify: "Savoir que ça marche",
  other: "Le reste du README",
};

export interface GuideTool {
  id: string;
  label: string;
  /** The version the repository pins or documents. */
  version?: string;
  /** Where the version comes from, so a wrong one can be traced. */
  source: GuideSource;
  /** `pinned` is read from a build file; `documented` is only written in prose. */
  basis: "pinned" | "documented";
  /** The command that prints the installed version. */
  check?: string;
  note?: string;
}

export interface GuideStep {
  id: string;
  phase: GuidePhase;
  title: string;
  /** The sentence before the commands: why this step exists. */
  explanation?: string;
  /** Redacted: a value that looks like a credential is replaced by dots. */
  commands: string[];
  lang?: string;
  source: GuideSource;
}

export interface GuideWarning {
  id: string;
  text: string;
  source: GuideSource;
}

export interface GuideLocalUrl {
  url: string;
  source: GuideSource;
}

export interface OnboardingView {
  /** README the steps were read from. Null when the repository has none. */
  readme: GuideSource | null;
  tools: GuideTool[];
  steps: GuideStep[];
  /** "Do not commit", "does not work": what the authors themselves warn about. */
  warnings: GuideWarning[];
  /** Paths that belong to the author's machine and must be adapted. */
  localPaths: { text: string; source: GuideSource }[];
  urls: GuideLocalUrl[];
  /** Variables the pipeline and the README ask for, names only. */
  secretsToObtain: { name: string; source?: GuideSource }[];
  findings: GuideFinding[];
}

/* ------------------------------------------------------------------ *
 * Documentation
 * ------------------------------------------------------------------ */

export const DOC_KINDS = [
  "readme",
  "guide",
  "changelog",
  "contributing",
  "license",
  "other",
] as const;
export type DocKind = (typeof DOC_KINDS)[number];

export const DOC_KIND_LABEL: Record<DocKind, string> = {
  readme: "README",
  guide: "Guide",
  changelog: "Historique des versions",
  contributing: "Contribution",
  license: "Licence",
  other: "Autre document",
};

export interface DocFileView {
  path: string;
  title?: string;
  kind: DocKind;
  words: number;
  headings: number;
  /** Estimated tokens an assistant pays to read it. */
  tokens: number;
}

export interface DocOutlineItem {
  level: number;
  text: string;
  line: number;
}

export interface DocCoverageItem {
  id: string;
  label: string;
  present: boolean;
  evidence?: GuideSource;
  /** What a reader would expect to find, and does not. */
  hint: string;
}

export interface DocAiFile {
  label: string;
  path: string;
  present: boolean;
}

export interface DocsView {
  files: DocFileView[];
  outline: { path: string; items: DocOutlineItem[] } | null;
  coverage: DocCoverageItem[];
  /** The documentation contradicts the repository. */
  drift: GuideFinding[];
  /** Instruction files for AI assistants: what exists, what is missing. */
  ai: DocAiFile[];
  stats: {
    files: number;
    words: number;
    tokens: number;
    /** Share of tokens in documentation, over the whole repository. */
    tokenShare: number;
    modulesWithReadme: number;
    modules: number;
  };
}
