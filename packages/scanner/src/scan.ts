import {
  type CodeGraph,
  type DeliveryView,
  type DocsView,
  EXTRACTOR_VERSION,
  estimateTokens,
  type OnboardingView,
  type ProjectArchitecture,
  SCAN_SCHEMA_VERSION,
  type ScanFileRecord,
  type ScanFinding,
  type ScanReport,
} from "@cairn/shared";
import { buildArchitecture } from "./architecture";
import { classify } from "./classify";
import { buildCodeGraph } from "./codegraph";
import { buildDelivery } from "./delivery";
import { buildDocs } from "./docs";
import { extractFile } from "./facts";
import { buildOnboarding } from "./onboarding";
import { Project } from "./project";
import { computeStats } from "./stats";
import type { TreeEntry } from "./tree";

/** Beyond this a text file is declared unread: reading it costs more than it teaches. */
const MAX_READ_BYTES = 1_000_000;
const READ_CONCURRENCY = 16;
const MAX_FINDINGS = 500;

export interface ScanInput {
  repositoryId: string;
  /** `group/project`, shown as the name of the system. */
  repoName: string;
  provider: string;
  commit: string;
  /** From `listTree`: path, blob hash and size of every file. No content. */
  entries: TreeEntry[];
  /** Reads one file of the checked-out commit. Only called for files whose hash is new. */
  read: (path: string) => Promise<Buffer>;
  /** The per-file records of the previous scan of the same repository, if any. */
  previous?: { commit: string; files: ScanFileRecord[] };
  generatedAt?: string;
}

export interface ScanResult {
  report: ScanReport;
  architecture: ProjectArchitecture;
  codeGraph: CodeGraph;
  /** Null when the repository has no pipeline file. */
  delivery: DeliveryView | null;
  onboarding: OnboardingView;
  docs: DocsView;
  /** Per-file records, kept so the next scan can skip every file whose hash did not change. */
  files: ScanFileRecord[];
}

async function inBatches<T, R>(
  items: T[],
  size: number,
  work: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const lanes = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      out[index] = await work(items[index] as T);
    }
  });
  await Promise.all(lanes);
  return out;
}

/**
 * Reads a repository the way Sonar does: deterministic, no model, nothing written back.
 * Every file whose git hash and extractor version match the previous scan is taken from it as is,
 * so a re-scan after a small commit only reads the files that actually changed.
 */
export async function scanRepository(input: ScanInput): Promise<ScanResult> {
  const started = Date.now();
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const cache = new Map<string, ScanFileRecord>();
  for (const record of input.previous?.files ?? []) {
    if (record.v === EXTRACTOR_VERSION) cache.set(`${record.path}\0${record.sha}`, record);
  }

  let reused = 0;
  let analysed = 0;

  const files = await inBatches(input.entries, READ_CONCURRENCY, async (entry) => {
    const meta = classify(entry.path, entry.bytes);
    const base = {
      path: entry.path,
      sha: entry.sha,
      bytes: entry.bytes,
      kind: meta.kind,
      ...(meta.language ? { language: meta.language } : {}),
    };

    const hit = cache.get(`${entry.path}\0${entry.sha}`);
    if (hit) {
      reused += 1;
      return {
        ...hit,
        ...base,
        tokens: meta.text ? estimateTokens(entry.bytes) : 0,
      } satisfies ScanFileRecord;
    }
    analysed += 1;

    if (!meta.text) {
      return { ...base, lines: 0, tokens: 0, v: EXTRACTOR_VERSION } satisfies ScanFileRecord;
    }
    const tokens = estimateTokens(entry.bytes);
    if (entry.bytes > MAX_READ_BYTES) {
      const counts = meta.kind !== "generated" && meta.kind !== "data";
      return {
        ...base,
        lines: 0,
        tokens,
        v: EXTRACTOR_VERSION,
        ...(counts ? { facts: { unreadable: "fichier de plus de 1 Mo, non analysé" } } : {}),
      } satisfies ScanFileRecord;
    }
    try {
      const text = (await input.read(entry.path)).toString("utf8");
      const extracted = extractFile(entry.path, meta.kind, text);
      return {
        ...base,
        lines: extracted.lines,
        tokens,
        v: EXTRACTOR_VERSION,
        ...(extracted.facts ? { facts: extracted.facts } : {}),
      } satisfies ScanFileRecord;
    } catch (error) {
      return {
        ...base,
        lines: 0,
        tokens,
        v: EXTRACTOR_VERSION,
        facts: { unreadable: `lecture impossible : ${(error as Error).message.slice(0, 120)}` },
      } satisfies ScanFileRecord;
    }
  });

  const present = new Set(input.entries.map((e) => e.path));
  const removed = (input.previous?.files ?? []).filter((f) => !present.has(f.path)).length;

  const project = new Project(files);
  const stats = computeStats(project);
  const architecture = buildArchitecture({
    project,
    repositoryId: input.repositoryId,
    repoName: input.repoName,
    provider: input.provider,
    commit: input.commit,
    generatedAt,
  });
  const codeGraph = buildCodeGraph({
    project,
    repositoryId: input.repositoryId,
    commit: input.commit,
    generatedAt,
  });

  const delivery = buildDelivery(project, {
    architecture,
    repoProvider:
      input.provider === "github" ? "github" : input.provider === "gitlab" ? "gitlab" : null,
    repoName: input.repoName,
  });
  const onboarding = buildOnboarding(project, delivery);
  const docs = buildDocs(project, stats);

  const findings: ScanFinding[] = [];
  for (const f of files) {
    for (const finding of f.facts?.findings ?? []) {
      if (findings.length < MAX_FINDINGS) findings.push({ ...finding, path: f.path });
    }
  }
  findings.sort((a, b) => a.path.localeCompare(b.path) || (a.line ?? 0) - (b.line ?? 0));

  const report: ScanReport = {
    schemaVersion: SCAN_SCHEMA_VERSION,
    commit: input.commit,
    generatedAt,
    durationMs: Date.now() - started,
    stats,
    findings,
    incremental: {
      mode: input.previous ? "incremental" : "full",
      previousCommit: input.previous?.commit ?? null,
      reused,
      analysed,
      removed,
    },
    counts: {
      archNodes: architecture.nodes.length,
      archEdges: architecture.edges.length,
      archViolations: architecture.violations.length,
      codeNodes: codeGraph.nodes.length,
      codeEdges: codeGraph.edges.length,
      unreadable: files.filter((f) => f.facts?.unreadable).length,
    },
  };

  return { report, architecture, codeGraph, delivery, onboarding, docs, files };
}
