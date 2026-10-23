/**
 * What a real scan of a repository produces.
 *
 * Everything here is a *fact* about the tree: counts, names, relations read from build files,
 * configuration and source. No file content is ever stored, and no secret value: a finding is
 * a path, a line and a rule. Tokens are an estimate (bytes / 4) and are always labelled as one.
 */

import type { ProjectArchitecture } from "./architecture";
import type { CodeGraph } from "./code-graph";
import type { DeliveryView, DocsView, OnboardingView } from "./guide";

export const SCAN_SCHEMA_VERSION = 1;

/** Bump when an extractor changes: cached per-file facts of an older version are recomputed. */
export const EXTRACTOR_VERSION = 4;

export const FILE_KINDS = [
  "source",
  "test",
  "config",
  "doc",
  "build",
  "data",
  "generated",
  "binary",
] as const;
export type FileKind = (typeof FILE_KINDS)[number];

/** What an AI assistant should normally never read: it costs tokens and teaches nothing. */
export const AI_NOISE_KINDS: readonly FileKind[] = ["data", "generated", "binary"];

/** Rough but honest: about four bytes per token for source text. Shown as an estimate everywhere. */
export const estimateTokens = (bytes: number): number => Math.ceil(bytes / 4);

export const FINDING_RULES = ["hardcoded-secret", "private-key", "access-token"] as const;
export type FindingRule = (typeof FINDING_RULES)[number];

/** Where a leak sits. The value itself is never read back, stored or displayed. */
export interface ScanFinding {
  rule: FindingRule;
  path: string;
  line?: number;
  /** Name of the key (`spring.datasource.password`) or of the token family (`gitlab`). */
  key?: string;
}

/* ------------------------------------------------------------------ *
 * Per-file facts. Cached by blob hash: an unchanged file is never read again.
 * ------------------------------------------------------------------ */

export const JAVA_ROLES = [
  "application",
  "controller",
  "listener",
  "scheduler",
  "repository",
  "service",
  "entity",
  "configuration",
] as const;
export type JavaRole = (typeof JAVA_ROLES)[number];

export interface JavaTypeFacts {
  name: string;
  kind: "class" | "interface" | "enum" | "record" | "annotation";
  line: number;
  roles: JavaRole[];
  /** `@Table(name = "...")` when written, else absent. */
  table?: string;
  /** Simple name of the entity a Spring Data repository manages. */
  entityOf?: string;
}

export interface JavaFacts {
  pkg: string;
  /** Fully qualified, `java.*` left out. Wildcards are kept as `a.b.*`. */
  imports: string[];
  types: JavaTypeFacts[];
  /** Configuration keys read through `@Value` / `@JmsListener`, only the messaging-ish ones. */
  placeholders: string[];
  /** `@ConfigurationProperties(prefix = "...")`. */
  prefixes: string[];
  usesJms: boolean;
  /** Literal queue names or `${key}` placeholders given to `@JmsListener`. */
  listens: string[];
  endpoints: number;
  basePath?: string;
  schedules: number;
}

export interface TsFacts {
  imports: string[];
  /** Angular building blocks declared in the file. */
  angular: { kind: "component" | "service" | "module" | "directive" | "pipe"; name: string }[];
  usesHttp: boolean;
}

export interface PomDependency {
  /** `groupId:artifactId` */
  id: string;
  scope?: string;
}

export interface PomFacts {
  artifactId: string;
  groupId?: string;
  packaging?: string;
  parent?: string;
  modules: string[];
  dependencies: PomDependency[];
  plugins: string[];
  javaVersion?: string;
  springBootVersion?: string;
}

export interface PackageJsonFacts {
  name?: string;
  dependencies: string[];
  angular?: string;
  scripts: string[];
}

export interface DockerFacts {
  from: string[];
  expose: number[];
  jars: string[];
  copies: string[];
}

export interface CiRule {
  /** The condition as written (`$CI_COMMIT_BRANCH == "develop"`). Absent for an unconditional rule. */
  if?: string;
  when?: string;
  allowFailure?: boolean;
}

export interface CiJob {
  name: string;
  stage?: string;
  image?: string;
  manual: boolean;
  tools: string[];
  /** Image repositories pushed by the job, tag removed. `registry` is the host or variable written before the path. */
  pushes: { image: string; tag?: string; dockerfile?: string; registry?: string }[];
  environment?: string;
  line?: number;
  /** `when:` of the job itself. */
  when?: string;
  allowFailure?: boolean;
  rules?: CiRule[];
  needs?: string[];
  artifacts?: string[];
  junit?: boolean;
  retry?: number;
  /** Weakening patterns found in the script, see `PIPELINE_FLAGS`. Scripts themselves are not kept. */
  flags?: string[];
  /** Variable names the script reads. Never their values. */
  vars?: string[];
}

export interface CiFacts {
  provider: "gitlab" | "github" | "jenkins";
  stages: string[];
  jobs: CiJob[];
  /** Conditions of the `workflow:` block, as written. */
  workflow?: string[];
  includes?: string[];
  /** Variables the file defines itself, with the line and the variables their value refers to. */
  definedVars?: { name: string; line?: number; from?: string[] }[];
}

/**
 * How a repository describes where it runs: Kubernetes and Argo CD objects, compose services, Helm
 * charts, Terraform. Read with patterns, never executed; a URL loses its credentials and its query.
 */
export interface DeployObject {
  kind: string;
  apiVersion: string;
  name?: string;
  namespace?: string;
  line: number;
  /** Container images the object runs, as written. */
  images: string[];
  /** Argo CD `Application` / Flux: what is synchronised from where to where. */
  sync?: {
    repoUrl?: string;
    path?: string;
    chart?: string;
    revision?: string;
    destNamespace?: string;
    destCluster?: string;
    automated?: boolean;
  };
}

export interface DeployFacts {
  objects: DeployObject[];
  compose?: { name: string; image?: string; built: boolean; ports: string[]; line: number }[];
  chart?: { name: string; version?: string; dependencies: string[] };
  kustomize?: { resources: number; images: string[] };
  terraform?: { providers: string[]; resources: number };
}

/** A configuration value worth knowing about. Secrets are never kept, URLs are reduced to a host. */
export interface ConfigEntry {
  key: string;
  value: string;
  line: number;
}

/** What a Markdown file says about the project, with every command and path redacted of credentials. */
export interface DocFacts {
  title?: string;
  words: number;
  headings: { level: number; text: string; line: number }[];
  /** Fenced code blocks, with the heading they sit under and the sentence that introduces them. */
  blocks: { line: number; lang?: string; lines: string[]; heading?: string; lead?: string }[];
  /** List items, to read the "tools to install" lists. */
  bullets: { line: number; text: string; heading?: string }[];
  /** Repository paths written in backticks. */
  paths: { path: string; line: number }[];
  /** Lines that warn: "do not commit", "does not work". */
  notes: { line: number; text: string }[];
  /** Paths that belong to the author's machine (`C:/dev/...`, `<your_path>/...`). */
  machinePaths: { text: string; line: number }[];
  /** `http://localhost:PORT/...` addresses. */
  localUrls: { url: string; line: number }[];
  /** Tool versions written in prose (`Java 8`, `Node 18`). */
  mentions: { tool: string; version: string; line: number }[];
}

export interface FileFacts {
  java?: JavaFacts;
  ts?: TsFacts;
  pom?: PomFacts;
  pkg?: PackageJsonFacts;
  docker?: DockerFacts;
  ci?: CiFacts;
  deploy?: DeployFacts;
  doc?: DocFacts;
  config?: ConfigEntry[];
  findings?: Omit<ScanFinding, "path">[];
  /** Why a file could not be read, so a gap is declared rather than silent. */
  unreadable?: string;
}

export interface ScanFileRecord {
  path: string;
  /** Git blob hash. Two records with the same hash have the same content. */
  sha: string;
  bytes: number;
  kind: FileKind;
  language?: string;
  lines: number;
  tokens: number;
  /** Which version of the extractors produced `facts`. */
  v: number;
  facts?: FileFacts;
}

/* ------------------------------------------------------------------ *
 * The report: the numbers a person reads.
 * ------------------------------------------------------------------ */

export interface KindStat {
  kind: FileKind;
  files: number;
  bytes: number;
  tokens: number;
}

export interface LanguageStat {
  language: string;
  files: number;
  lines: number;
  bytes: number;
  tokens: number;
}

export interface FileRef {
  path: string;
  bytes: number;
  tokens: number;
  kind: FileKind;
}

export interface ModuleStat {
  /** Top-level directory or Maven module. `.` groups the files at the root. */
  path: string;
  name: string;
  files: number;
  lines: number;
  tokens: number;
  /** Runs on its own (Spring Boot application, Angular app) rather than being a library. */
  deployable: boolean;
}

export interface ScanStats {
  files: number;
  lines: number;
  bytes: number;
  /** Estimated tokens to read every text file once. */
  tokens: number;
  /** Estimated tokens once binaries, data and generated files are excluded for the AI. */
  tokensAiRelevant: number;
  /** Estimated tokens wasted if an assistant reads the noise (data and generated files). */
  tokensNoise: number;
  byKind: KindStat[];
  byLanguage: LanguageStat[];
  modules: ModuleStat[];
  largest: FileRef[];
  noise: FileRef[];
  structure: {
    javaTypes: number;
    controllers: number;
    endpoints: number;
    services: number;
    repositories: number;
    entities: number;
    schedulers: number;
    listeners: number;
    angularComponents: number;
    testFiles: number;
    sourceFiles: number;
  };
}

export interface ScanIncremental {
  mode: "full" | "incremental";
  previousCommit: string | null;
  /** Files whose facts were taken from the previous scan because their hash is unchanged. */
  reused: number;
  /** Files read and analysed during this scan. */
  analysed: number;
  /** Files present in the previous scan and gone now. */
  removed: number;
}

export interface ScanReport {
  schemaVersion: number;
  commit: string;
  generatedAt: string;
  durationMs: number;
  stats: ScanStats;
  findings: ScanFinding[];
  incremental: ScanIncremental;
  counts: {
    archNodes: number;
    archEdges: number;
    archViolations: number;
    codeNodes: number;
    codeEdges: number;
    unreadable: number;
  };
}

/** What the web app reads back: everything but the heavy per-file index. */
export interface ScanView {
  id: string;
  importId: string;
  commitSha: string;
  createdAt: string;
  report: ScanReport;
  architecture: ProjectArchitecture;
  codeGraph: CodeGraph;
  /** Null for a scan made before these guides existed: a re-scan fills them. */
  delivery: DeliveryView | null;
  onboarding: OnboardingView | null;
  docs: DocsView | null;
}
