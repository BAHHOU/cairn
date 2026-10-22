import type {
  DocAiFile,
  DocCoverageItem,
  DocFileView,
  DocKind,
  DocOutlineItem,
  DocsView,
  GuideFinding,
  GuideSource,
  ScanFileRecord,
  ScanStats,
} from "@cairn/shared";
import { rootReadme } from "./onboarding";
import type { Project } from "./project";

const baseName = (p: string) => p.slice(p.lastIndexOf("/") + 1);
const dirName = (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : ".");
const src = (path: string, line?: number): GuideSource => (line ? { path, line } : { path });

function kindOf(path: string): DocKind {
  const name = baseName(path).toLowerCase();
  if (/^readme/.test(name)) return "readme";
  if (/^(?:changelog|history|releases?|news)/.test(name)) return "changelog";
  if (/^contributing/.test(name)) return "contributing";
  if (/^licen[sc]e/.test(name)) return "license";
  if (/(?:^|\/)(?:docs?|documentation|guides?|wiki)\//i.test(path)) return "guide";
  return "other";
}

/** Directories of the repository, so a path to a folder counts as existing. */
function directories(project: Project): Set<string> {
  const dirs = new Set<string>();
  for (const f of project.files) {
    let dir = dirName(f.path);
    while (dir !== "." && !dirs.has(dir)) {
      dirs.add(dir);
      dir = dirName(dir);
    }
  }
  return dirs;
}

/** Build outputs and caches that a README rightly mentions and the repository rightly lacks. */
const GENERATED_SEGMENT =
  /(?:^|\/)(?:target|dist|node_modules|\.git|out|coverage|\.m2|\.angular)(?:\/|$)/;

const AI_FILES: { label: string; path: string; dir?: boolean }[] = [
  { label: "AGENTS.md", path: "AGENTS.md" },
  { label: "CLAUDE.md", path: "CLAUDE.md" },
  { label: "Instructions Copilot", path: ".github/copilot-instructions.md" },
  { label: "Instructions par dossier", path: ".github/instructions", dir: true },
  { label: "Règles Cursor", path: ".cursor/rules", dir: true },
  { label: "llms.txt", path: "llms.txt" },
];

/** The major version of a string like `1.8`, `8`, `21.0.8`. */
const major = (v: string) => (v.startsWith("1.") ? v.slice(2).split(".")[0] : v.split(".")[0]) ?? v;

export function buildDocs(project: Project, stats: ScanStats): DocsView {
  const docFiles = project.files.filter((f) => f.facts?.doc);
  const dirs = directories(project);
  const exists = (p: string) => project.byPath.has(p) || dirs.has(p.replace(/\/$/, ""));

  const files: DocFileView[] = docFiles
    .map((f) => {
      const doc = f.facts?.doc;
      return {
        path: f.path,
        ...(doc?.title ? { title: doc.title } : {}),
        kind: kindOf(f.path),
        words: doc?.words ?? 0,
        headings: doc?.headings.length ?? 0,
        tokens: f.tokens,
      } satisfies DocFileView;
    })
    .sort(
      (a, b) => a.path.split("/").length - b.path.split("/").length || a.path.localeCompare(b.path),
    );

  const readme = rootReadme(project);
  const readmeDoc = readme?.facts?.doc;
  const outline: DocsView["outline"] = readme
    ? {
        path: readme.path,
        items: (readmeDoc?.headings ?? [])
          .filter((h) => h.level <= 3)
          .map((h): DocOutlineItem => ({ level: h.level, text: h.text, line: h.line })),
      }
    : null;

  /* ---- coverage: what a reader expects to find ---- */
  const headingOf = (re: RegExp) => readmeDoc?.headings.find((h) => re.test(h.text));
  const anyDocHeading = (re: RegExp) => {
    for (const f of docFiles) {
      const h = f.facts?.doc?.headings.find((x) => re.test(x.text));
      if (h) return src(f.path, h.line);
    }
    return undefined;
  };
  const named = (re: RegExp) => project.files.find((f) => re.test(baseName(f.path)));
  const endpoints = stats.structure.endpoints;

  const apiDep = project.maven.find((m) =>
    m.pom.dependencies.some((d) => /springdoc|springfox|swagger|openapi/i.test(d.id)),
  );
  const apiFile = project.files.find((f) =>
    /(?:^|\/)(?:openapi|swagger)[\w.-]*\.(?:ya?ml|json)$/i.test(f.path),
  );
  const apiEvidence = apiFile ? src(apiFile.path) : apiDep ? src(apiDep.pomPath) : undefined;

  const adr = [...dirs].find((d) => /(?:^|\/)(?:adr|decisions|architecture)$/i.test(d));
  const architectureDoc = anyDocHeading(/architecture|conception|design/i);

  const coverage: DocCoverageItem[] = [];
  const item = (id: string, label: string, evidence: GuideSource | undefined, hint: string) =>
    coverage.push({
      id,
      label,
      present: Boolean(evidence),
      ...(evidence ? { evidence } : {}),
      hint,
    });

  item(
    "readme",
    "README à la racine",
    readme ? src(readme.path) : undefined,
    "Le point d'entrée de tout nouvel arrivant.",
  );
  const install = headingOf(
    /prereq|prérequis|install|getting started|setup|démarrage|installation/i,
  );
  item(
    "install",
    "Prérequis et installation",
    readme && install ? src(readme.path, install.line) : undefined,
    "Quels outils, quelles versions, dans quel ordre.",
  );
  const build = headingOf(/build|compil|package/i);
  item(
    "build",
    "Compilation",
    readme && build ? src(readme.path, build.line) : undefined,
    "La commande qui construit le projet, avec ses options.",
  );
  const run = headingOf(/\brun\b|start|usage|launch|lancer|exécut|utilisation/i);
  item(
    "run",
    "Lancer l'application",
    readme && run ? src(readme.path, run.line) : undefined,
    "Comment obtenir une instance qui répond en local.",
  );
  const testHeading = headingOf(/\btests?\b|testing/i);
  item(
    "tests",
    "Lancer les tests",
    readme && testHeading ? src(readme.path, testHeading.line) : undefined,
    "Comment vérifier un changement avant de le proposer.",
  );
  item(
    "architecture",
    "Architecture",
    architectureDoc ?? (adr ? src(adr) : undefined),
    "Les grandes parties et comment elles se parlent.",
  );
  item(
    "api",
    "Description de l'API",
    apiEvidence,
    endpoints > 0
      ? `${endpoints} points d'entrée HTTP, sans description lisible par une machine (OpenAPI).`
      : "Contrat des interfaces exposées.",
  );
  const pipelineDoc = anyDocHeading(/pipeline|ci\/cd|deploy|déploi|release|runbook|exploitation/i);
  item(
    "operations",
    "Livraison et exploitation",
    pipelineDoc,
    "Comment une version part en production, et que faire quand ça casse.",
  );
  const contributing = named(/^contributing/i);
  const contribHeading = anyDocHeading(/contribut/i);
  item(
    "contributing",
    "Guide de contribution",
    contributing ? src(contributing.path) : contribHeading,
    "Branches, relectures, conventions de commit.",
  );
  const changelog = named(/^(?:changelog|history|releases?)/i);
  item(
    "changelog",
    "Historique des versions",
    changelog ? src(changelog.path) : undefined,
    "Ce qui change d'une version à l'autre.",
  );
  const license = named(/^licen[sc]e/i);
  item(
    "license",
    "Licence",
    license ? src(license.path) : undefined,
    "Ce qu'on a le droit de faire du code.",
  );
  const owner = headingOf(/maintainer|contact|owner|support|responsable|équipe|team/i);
  item(
    "owner",
    "Qui prévenir",
    readme && owner ? src(readme.path, owner.line) : undefined,
    "Un document sans propriétaire se périme sans que personne ne le voie.",
  );

  /* ---- drift: the documentation contradicts the repository ---- */
  const drift: GuideFinding[] = [];

  const pinnedJava = new Set<string>();
  const pinnedNode = new Set<string>();
  const pinnedMaven = new Set<string>();
  const pinnedWhere = new Map<string, GuideSource>();
  for (const f of project.files) {
    for (const job of f.facts?.ci?.jobs ?? []) {
      const image = job.image ?? "";
      const j = /(?:temurin|openjdk|jdk)[-:_]?(\d{1,2})/i.exec(image)?.[1];
      const n = /node:(\d+)/i.exec(image)?.[1];
      const m = /maven:(\d+\.\d+(?:\.\d+)?)/i.exec(image)?.[1];
      if (j) {
        pinnedJava.add(j);
        pinnedWhere.set(`java:${j}`, src(f.path, job.line));
      }
      if (n) {
        pinnedNode.add(n);
        pinnedWhere.set(`node:${n}`, src(f.path, job.line));
      }
      if (m) {
        pinnedMaven.add(m);
        pinnedWhere.set(`maven:${m}`, src(f.path, job.line));
      }
    }
    for (const from of f.facts?.docker?.from ?? []) {
      const j = /(?:temurin|openjdk|jdk)[-:_]?(\d{1,2})/i.exec(from)?.[1];
      if (j) {
        pinnedJava.add(j);
        if (!pinnedWhere.has(`java:${j}`)) pinnedWhere.set(`java:${j}`, src(f.path));
      }
    }
  }

  for (const f of docFiles) {
    for (const mention of f.facts?.doc?.mentions ?? []) {
      const sets: Record<string, Set<string>> = {
        java: pinnedJava,
        node: pinnedNode,
        maven: pinnedMaven,
      };
      const pinned = sets[mention.tool];
      if (!pinned || pinned.size === 0) continue;
      const claimed = mention.tool === "maven" ? mention.version : major(mention.version);
      const actual = [...pinned].map((v) => (mention.tool === "maven" ? v : major(v)));
      if (actual.includes(claimed)) continue;
      const label = { java: "Java", node: "Node", maven: "Maven" }[mention.tool] ?? mention.tool;
      const first = [...pinned][0] as string;
      drift.push({
        id: `version-${f.path}-${mention.tool}-${mention.version}`,
        severity: "major",
        title: `${f.path} annonce ${label} ${mention.version}, la chaîne utilise ${label} ${[...pinned].join(" / ")}`,
        detail: `La documentation et la configuration ne disent pas la même chose. Un développeur qui suit le document installera ${label} ${mention.version} et obtiendra un poste qui ne reproduit pas la chaîne.`,
        source: src(f.path, mention.line),
        proposal: `Aligner le document sur ${pinnedWhere.get(`${mention.tool}:${first}`)?.path ?? "la configuration"}, ou l'inverse si c'est le document qui a raison.`,
      });
    }
  }

  const missing: { doc: ScanFileRecord; path: string; line: number }[] = [];
  for (const f of docFiles) {
    const base = dirName(f.path);
    for (const p of f.facts?.doc?.paths ?? []) {
      if (GENERATED_SEGMENT.test(p.path)) continue;
      const candidates = [p.path, base === "." ? p.path : `${base}/${p.path}`];
      if (candidates.some(exists)) continue;
      // `application.yml` alone names a file that exists somewhere: only a path with a folder is checkable.
      if (!p.path.includes("/")) {
        const tail = `/${p.path}`;
        if (project.files.some((x) => x.path.endsWith(tail) || x.path === p.path)) continue;
      }
      missing.push({ doc: f, path: p.path, line: p.line });
    }
  }
  for (const m of missing.slice(0, 8)) {
    drift.push({
      id: `missing-${m.doc.path}-${m.path}`,
      severity: "minor",
      title: `\`${m.path}\` est cité mais n'existe pas`,
      detail: `${m.doc.path} (ligne ${m.line}) renvoie vers un fichier ou un dossier absent à ce commit : déplacé, renommé, ou jamais versionné.`,
      source: src(m.doc.path, m.line),
      proposal: "Corriger le chemin dans le document, ou versionner le fichier manquant.",
    });
  }
  if (missing.length > 8) {
    drift.push({
      id: "missing-more",
      severity: "minor",
      title: `${missing.length - 8} autre${missing.length - 8 > 1 ? "s" : ""} chemin${missing.length - 8 > 1 ? "s" : ""} introuvable${missing.length - 8 > 1 ? "s" : ""}`,
      detail: "La liste est tronquée aux huit premiers.",
    });
  }

  const rank = { blocker: 0, critical: 1, major: 2, minor: 3 } as const;
  drift.sort((a, b) => rank[a.severity] - rank[b.severity] || a.id.localeCompare(b.id));

  /* ---- assistants ---- */
  const ai: DocAiFile[] = AI_FILES.map((a) => ({
    label: a.label,
    path: a.path,
    present: a.dir ? dirs.has(a.path) : project.byPath.has(a.path),
  }));

  /* ---- per-module READMEs ---- */
  const unitDirs = new Set<string>();
  for (const m of project.maven) if (!m.aggregator) unitDirs.add(m.dir);
  for (const a of project.angular) unitDirs.add(a.dir);
  const readmeDirs = new Set(files.filter((f) => f.kind === "readme").map((f) => dirName(f.path)));
  const modulesWithReadme = [...unitDirs].filter((d) => readmeDirs.has(d)).length;

  const tokens = files.reduce((s, f) => s + f.tokens, 0);
  return {
    files,
    outline,
    coverage,
    drift,
    ai,
    stats: {
      files: files.length,
      words: files.reduce((s, f) => s + f.words, 0),
      tokens,
      tokenShare: stats.tokens > 0 ? tokens / stats.tokens : 0,
      modulesWithReadme,
      modules: unitDirs.size,
    },
  };
}
