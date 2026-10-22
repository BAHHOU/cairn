import {
  AI_NOISE_KINDS,
  FILE_KINDS,
  type FileKind,
  type FileRef,
  type KindStat,
  type LanguageStat,
  type ModuleStat,
  type ScanFileRecord,
  type ScanStats,
} from "@cairn/shared";
import type { Project } from "./project";

const TOP = 10;

const byTokens = (a: ScanFileRecord, b: ScanFileRecord) =>
  b.tokens - a.tokens || b.bytes - a.bytes || a.path.localeCompare(b.path);
const byBytes = (a: ScanFileRecord, b: ScanFileRecord) =>
  b.bytes - a.bytes || a.path.localeCompare(b.path);

const ref = (f: ScanFileRecord): FileRef => ({
  path: f.path,
  bytes: f.bytes,
  tokens: f.tokens,
  kind: f.kind,
});

/** The numbers: files, lines, bytes and estimated tokens, by kind, language and unit. */
export function computeStats(project: Project): ScanStats {
  const files = project.files;
  const noise = new Set<FileKind>(AI_NOISE_KINDS);

  const kinds = new Map<FileKind, KindStat>(
    FILE_KINDS.map((kind) => [kind, { kind, files: 0, bytes: 0, tokens: 0 }]),
  );
  const languages = new Map<string, LanguageStat>();
  const units = new Map<string, ModuleStat>();
  const deployable = new Set<string>();

  let lines = 0;
  let bytes = 0;
  let tokens = 0;
  let tokensNoise = 0;
  let tokensRelevant = 0;

  const structure = {
    javaTypes: 0,
    controllers: 0,
    endpoints: 0,
    services: 0,
    repositories: 0,
    entities: 0,
    schedulers: 0,
    listeners: 0,
    angularComponents: 0,
    testFiles: 0,
    sourceFiles: 0,
  };

  for (const f of files) {
    lines += f.lines;
    bytes += f.bytes;
    tokens += f.tokens;
    if (noise.has(f.kind)) tokensNoise += f.tokens;
    else tokensRelevant += f.tokens;

    const kind = kinds.get(f.kind);
    if (kind) {
      kind.files += 1;
      kind.bytes += f.bytes;
      kind.tokens += f.tokens;
    }

    if (f.language && f.kind !== "binary") {
      const lang = languages.get(f.language) ?? {
        language: f.language,
        files: 0,
        lines: 0,
        bytes: 0,
        tokens: 0,
      };
      lang.files += 1;
      lang.lines += f.lines;
      lang.bytes += f.bytes;
      lang.tokens += f.tokens;
      languages.set(f.language, lang);
    }

    const unit = project.unitOf(f.path);
    const stat = units.get(unit.key) ?? {
      path: unit.key,
      name: unit.name,
      files: 0,
      lines: 0,
      tokens: 0,
      deployable: false,
    };
    stat.files += 1;
    stat.lines += f.lines;
    stat.tokens += f.tokens;
    units.set(unit.key, stat);

    if (f.kind === "source") structure.sourceFiles += 1;
    if (f.kind === "test") structure.testFiles += 1;
    const java = f.facts?.java;
    if (java) {
      structure.javaTypes += java.types.length;
      for (const t of java.types) {
        if (t.roles.includes("application")) deployable.add(unit.key);
        if (t.roles.includes("controller")) structure.controllers += 1;
        if (t.roles.includes("service")) structure.services += 1;
        if (t.roles.includes("repository")) structure.repositories += 1;
        if (t.roles.includes("entity")) structure.entities += 1;
        if (t.roles.includes("scheduler")) structure.schedulers += 1;
        if (t.roles.includes("listener")) structure.listeners += 1;
      }
      structure.endpoints += java.endpoints;
    }
    const ts = f.facts?.ts;
    if (ts) structure.angularComponents += ts.angular.filter((a) => a.kind === "component").length;
  }

  for (const u of project.allUnits()) {
    if (u.angular && u.kind !== "folder") deployable.add(u.key);
    if (u.kind === "angular") deployable.add(u.key);
  }
  for (const stat of units.values()) stat.deployable = deployable.has(stat.path);

  return {
    files: files.length,
    lines,
    bytes,
    tokens,
    tokensAiRelevant: tokensRelevant,
    tokensNoise,
    byKind: [...kinds.values()].filter((k) => k.files > 0),
    byLanguage: [...languages.values()].sort(
      (a, b) => b.tokens - a.tokens || a.language.localeCompare(b.language),
    ),
    modules: [...units.values()].sort(
      (a, b) => b.tokens - a.tokens || a.path.localeCompare(b.path),
    ),
    largest: files
      .filter((f) => f.kind !== "binary")
      .sort(byTokens)
      .slice(0, TOP)
      .map(ref),
    noise: files
      .filter((f) => noise.has(f.kind))
      .sort(byBytes)
      .slice(0, TOP)
      .map(ref),
    structure,
  };
}
