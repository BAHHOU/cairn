import type {
  DeliveryView,
  DocFacts,
  GuideFinding,
  GuidePhase,
  GuideSource,
  GuideStep,
  GuideTool,
  GuideWarning,
  OnboardingView,
  ScanFileRecord,
} from "@cairn/shared";
import type { Project } from "./project";

const README = /^readme(?:\.\w+)?\.md$/i;
const baseName = (p: string) => p.slice(p.lastIndexOf("/") + 1);
const depth = (p: string) => p.split("/").length;

/** The README that describes the whole repository: the shallowest one. */
export function rootReadme(project: Project): ScanFileRecord | undefined {
  return project.files
    .filter((f) => f.facts?.doc && README.test(baseName(f.path)))
    .sort((a, b) => depth(a.path) - depth(b.path) || a.path.localeCompare(b.path))[0];
}

const src = (path: string, line?: number): GuideSource => (line ? { path, line } : { path });

/* ------------------------------------------------------------------ *
 * Tools: what the build files pin, then what the README adds.
 * ------------------------------------------------------------------ */

/** The tool a README bullet is about, spelled once. */
const CANONICAL: [RegExp, string][] = [
  [/^(?:jdk|java|openjdk)\b/i, "jdk"],
  [/^node(?:\.?js)?\b/i, "node"],
  [/^maven\b|^mvn\b/i, "maven"],
  [/^docker\b/i, "docker"],
  [/^git\b/i, "git"],
  [/^angular\b/i, "angular"],
];

const canonicalOf = (label: string) => {
  for (const [re, id] of CANONICAL) if (re.test(label.trim())) return id;
  return label.trim().toLowerCase().split(/\s+/)[0] ?? label.toLowerCase();
};

const PREREQ_HEADING =
  /prereq|prérequis|tools to install|outils|logiciels|requirements?|to install/i;

function pinnedTools(project: Project, delivery: DeliveryView | null): GuideTool[] {
  const tools: GuideTool[] = [];
  const ciPath = delivery?.path;
  const ci = ciPath ? project.byPath.get(ciPath)?.facts?.ci : undefined;

  const imageOf = (re: RegExp) => {
    for (const job of ci?.jobs ?? []) {
      const match = job.image ? re.exec(job.image) : null;
      if (match && ciPath) return { match, source: src(ciPath, job.line), job: job.name };
    }
    return undefined;
  };

  // Java: the pipeline image first, then the Dockerfile, then the pom.
  const jdkCi = imageOf(/(?:temurin|openjdk|jdk)[-:_]?(\d{1,2})/i);
  let jdkDocker: { version: string; path: string } | undefined;
  let pomVersion: { version: string; path: string } | undefined;
  for (const f of project.files) {
    const from = f.facts?.docker?.from.find((x) => /jdk|openjdk|temurin/i.test(x));
    const m = from ? /(?:jdk|openjdk|temurin)[-:_]?(\d{1,2})/i.exec(from) : null;
    if (m && !jdkDocker) jdkDocker = { version: m[1] as string, path: f.path };
    const pv = f.facts?.pom?.javaVersion;
    if (pv && !pomVersion) pomVersion = { version: pv.replace(/^1\./, ""), path: f.path };
  }
  const jdk = jdkCi
    ? { version: jdkCi.match[1] as string, source: jdkCi.source }
    : jdkDocker
      ? { version: jdkDocker.version, source: src(jdkDocker.path) }
      : pomVersion
        ? { version: pomVersion.version, source: src(pomVersion.path) }
        : undefined;
  if (jdk) {
    const others = [
      jdkDocker && jdkDocker.version !== jdk.version
        ? `${jdkDocker.path} utilise Java ${jdkDocker.version}`
        : null,
      pomVersion && pomVersion.version !== jdk.version
        ? `${pomVersion.path} cible Java ${pomVersion.version}`
        : null,
    ].filter(Boolean);
    tools.push({
      id: "jdk",
      label: "JDK",
      version: jdk.version,
      source: jdk.source,
      basis: "pinned",
      check: "java -version",
      ...(others.length > 0
        ? { note: `Versions différentes dans le dépôt : ${others.join(" ; ")}.` }
        : {}),
    });
  }

  const maven = imageOf(/maven:(\d+\.\d+(?:\.\d+)?)/i);
  if (maven) {
    tools.push({
      id: "maven",
      label: "Maven",
      version: maven.match[1] as string,
      source: maven.source,
      basis: "pinned",
      check: "mvn -v",
    });
  } else if (project.maven.length > 0) {
    const root = project.maven[0];
    if (root) {
      tools.push({
        id: "maven",
        label: "Maven",
        source: src(root.pomPath),
        basis: "pinned",
        check: "mvn -v",
      });
    }
  }

  const node = imageOf(/node:(\d+(?:\.\d+){0,2})/i);
  if (node) {
    tools.push({
      id: "node",
      label: "Node.js",
      version: node.match[1] as string,
      source: node.source,
      basis: "pinned",
      check: "node -v",
    });
  }

  const app = project.angular[0];
  if (app) {
    tools.push({
      id: "angular",
      label: "Angular",
      version: app.version.replace(/^[\^~>=\s]+/, ""),
      source: src(app.packagePath),
      basis: "pinned",
      check: "npx ng version",
    });
  }

  const dockerfile = project.files.find((f) => f.facts?.docker);
  if (dockerfile) {
    tools.push({
      id: "docker",
      label: "Docker",
      source: src(dockerfile.path),
      basis: "pinned",
      check: "docker --version",
      note: "Les images sont construites à partir des Dockerfile du dépôt.",
    });
  }
  return tools;
}

function documentedTools(readme: ScanFileRecord, covered: Set<string>): GuideTool[] {
  const doc = readme.facts?.doc as DocFacts;
  const tools: GuideTool[] = [];
  for (const b of doc.bullets) {
    if (!b.heading || !PREREQ_HEADING.test(b.heading)) continue;
    const head = b.text.split(/\s[([:–—-]|:/)[0]?.trim() ?? "";
    if (!head || head.length > 60) continue;
    const versioned = /^(.*?)\s+v?(\d+(?:\.\d+)+)\b/.exec(head);
    const label = (versioned?.[1] ?? head).trim();
    const version = versioned?.[2];
    if (!label) continue;
    const id = canonicalOf(label);
    if (covered.has(id)) continue;
    covered.add(id);
    tools.push({
      id,
      label,
      ...(version ? { version } : {}),
      source: src(readme.path, b.line),
      basis: "documented",
    });
  }
  return tools;
}

/* ------------------------------------------------------------------ *
 * Steps: the commands of the README, in the order it gives them.
 * ------------------------------------------------------------------ */

function phaseOf(text: string, commands: string): GuidePhase {
  if (/prereq|prérequis|tools to install/i.test(text)) return "prerequis";
  if (/verif|vérif|smoke|health|check/i.test(text)) return "verify";
  if (/docker|postgres|database|base de donn|\bmq\b|kafka|redis|wsl|service|dbeaver/i.test(text)) {
    return "services";
  }
  if (/compil|build|package|install\b/i.test(text)) return "build";
  if (/\brun\b|start|launch|démarr|lancer|serve|watch|exécut/i.test(text)) return "run";
  if (/\bdocker\s+(?:run|build|load|compose)\b/.test(commands)) return "services";
  if (/\bmvn\b.*\b(?:install|package|clean|verify)\b|\bgradle\b.*\bbuild\b/.test(commands)) {
    return "build";
  }
  if (/\bnpm\s+(?:run|start|ci|install)\b|\bng\s+serve\b|\bjava\s+-jar\b/.test(commands)) {
    return "run";
  }
  if (/\bcurl\b/.test(commands)) return "verify";
  return "other";
}

const SHELL_LANGS = new Set([
  "",
  "bash",
  "sh",
  "shell",
  "console",
  "cmd",
  "powershell",
  "ps1",
  "zsh",
  "bat",
]);

function stepsOf(readme: ScanFileRecord): GuideStep[] {
  const doc = readme.facts?.doc as DocFacts;
  const steps: GuideStep[] = [];
  const perHeading = new Map<string, number>();
  doc.blocks.forEach((block, i) => {
    if (block.lines.length === 0) return;
    // Configuration snippets (yaml, xml…) and bare `KEY=value` examples are not commands to run.
    if (!SHELL_LANGS.has((block.lang ?? "").toLowerCase())) return;
    if (block.lines.every((l) => /^[A-Z_][A-Z0-9_]*=/.test(l.trim()))) return;
    const commands = block.lines.join("\n");
    const context = `${block.heading ?? ""} ${block.lead ?? ""}`;
    const phase: GuidePhase = phaseOf(context, commands);
    const lead = block.lead?.replace(/^[-*+]\s+/, "").trim();
    const seen = (perHeading.get(block.heading ?? "") ?? 0) + 1;
    perHeading.set(block.heading ?? "", seen);
    const base = block.heading ?? lead ?? "Commande";
    const title = seen > 1 ? `${base} (${seen})` : base;
    const explanation = lead && lead !== block.heading ? lead : undefined;
    steps.push({
      id: `step-${i + 1}`,
      phase,
      title,
      ...(explanation ? { explanation } : {}),
      commands: block.lines,
      ...(block.lang ? { lang: block.lang } : {}),
      source: src(readme.path, block.line),
    });
  });
  return steps;
}

/* ------------------------------------------------------------------ *
 * The builder.
 * ------------------------------------------------------------------ */

export function buildOnboarding(project: Project, delivery: DeliveryView | null): OnboardingView {
  const readme = rootReadme(project);
  const doc = readme?.facts?.doc;

  const pinned = pinnedTools(project, delivery);
  const covered = new Set(pinned.map((t) => t.id));
  const documented = readme ? documentedTools(readme, covered) : [];
  const tools = [...pinned, ...documented];

  const steps = readme ? stepsOf(readme) : [];
  const warnings: GuideWarning[] = readme
    ? (doc?.notes ?? []).map((n, i) => ({
        id: `warn-${i + 1}`,
        text: n.text,
        source: src(readme.path, n.line),
      }))
    : [];

  const seenPath = new Set<string>();
  const localPaths = readme
    ? (doc?.machinePaths ?? [])
        .filter((p) => {
          if (seenPath.has(p.text)) return false;
          seenPath.add(p.text);
          return true;
        })
        .map((p) => ({ text: p.text, source: src(readme.path, p.line) }))
    : [];
  const urls = readme
    ? (doc?.localUrls ?? []).map((u) => ({ url: u.url, source: src(readme.path, u.line) }))
    : [];

  const secretsToObtain = (delivery?.variables ?? [])
    .filter((v) => v.kind !== "gitlab" && !v.definedInFile)
    .map((v) => {
      const job = delivery?.stages.flatMap((s) => s.jobs).find((j) => v.usedBy.includes(j.name));
      return {
        name: v.name,
        ...(delivery && job ? { source: src(delivery.path, job.line) } : {}),
      };
    });

  const findings: GuideFinding[] = [];
  if (!readme) {
    findings.push({
      id: "no-readme",
      severity: "major",
      title: "Aucun README à la racine",
      detail:
        "Un nouveau développeur n'a aucun point de départ écrit : il devra tout apprendre de la bouche de ses voisins.",
      proposal: "Ajouter un README avec les prérequis, la compilation et le démarrage local.",
    });
  } else {
    if (steps.length === 0) {
      findings.push({
        id: "no-commands",
        severity: "major",
        title: "Le README ne contient aucune commande",
        detail: "Il décrit le projet mais ne dit pas comment l'installer ni le lancer.",
        source: src(readme.path),
      });
    }
    const headings = doc?.headings ?? [];
    const allText = `${headings.map((h) => h.text).join(" ")} ${steps.map((s) => s.commands.join(" ")).join(" ")}`;
    if (
      steps.length > 0 &&
      !/\btest|spec|verify|\bmvn\b.*\btest\b|npm (?:run )?test/i.test(allText)
    ) {
      findings.push({
        id: "no-tests-howto",
        severity: "minor",
        title: "Le README n'explique pas comment lancer les tests",
        detail:
          "Ni section ni commande ne mentionne les tests : le premier réflexe d'un nouvel arrivant n'a pas de réponse écrite.",
        source: src(readme.path),
      });
    }
    if (localPaths.length > 0) {
      findings.push({
        id: "machine-paths",
        severity: "minor",
        title: `${localPaths.length} chemin${localPaths.length > 1 ? "s" : ""} propre${localPaths.length > 1 ? "s" : ""} à un poste`,
        detail:
          "Des chemins absolus ou à compléter (`C:/…`, `<votre_chemin>`) sont à adapter à la main à chaque arrivée : c'est une source d'erreurs silencieuses.",
        source: (localPaths[0] as { source: GuideSource }).source,
        proposal: "Remplacer par des chemins relatifs ou une variable d'environnement documentée.",
      });
    }
    const manualDocker = steps.filter(
      (s) =>
        s.phase === "services" && s.commands.some((c) => /\bdocker\s+(?:run|build|load)\b/.test(c)),
    );
    const hasCompose = project.files.some((f) =>
      /^(?:docker-)?compose[\w.-]*\.ya?ml$/i.test(baseName(f.path)),
    );
    if (manualDocker.length > 0 && !hasCompose) {
      findings.push({
        id: "manual-services",
        severity: "minor",
        title: "Les services locaux se lancent à la main",
        detail: `${manualDocker.length} bloc${manualDocker.length > 1 ? "s" : ""} de commandes \`docker\` à copier une à une, et aucun fichier compose pour tout démarrer d'un coup.`,
        source: (manualDocker[0] as GuideStep).source,
        proposal:
          "Proposer un fichier compose pour la base de données et la messagerie (Cairn ne l'écrit pas : il le suggère).",
      });
    }
  }

  return {
    readme: readme ? src(readme.path) : null,
    tools,
    steps,
    warnings,
    localPaths,
    urls,
    secretsToObtain,
    findings,
  };
}
