import type { CodeEdge, CodeGraph, CodeNode, JavaRole, ScanFileRecord } from "@cairn/shared";
import { componentNodeId, containerNodeId } from "./architecture";
import type { JavaType, Project, Unit } from "./project";

export interface CodeGraphInput {
  project: Project;
  repositoryId: string;
  commit: string;
  generatedAt: string;
}

/** The canvas lays nodes on rings and copes with a few hundred. Past that, packages are merged. */
const JAVA_MODULE_BUDGET = 220;
const TS_MODULE_BUDGET = 100;
const MAX_EXTERNALS = 25;
const ENTRY_ROLES: JavaRole[] = ["controller", "listener", "scheduler", "application"];

const dirOf = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");

const slug = (value: string) => value.replace(/[^A-Za-z0-9._/-]+/g, "-");

/**
 * The leading segments nearly everything shares (`com.acme.shop`). One stray package must not
 * break it, so a segment counts as shared when at least 80% of the files agree on it.
 */
function dominantPrefix(lists: string[][]): string[] {
  const prefix: string[] = [];
  let pool = lists;
  while (pool.length > 0) {
    const counts = new Map<string, number>();
    for (const l of pool) {
      const seg = l[prefix.length];
      if (seg !== undefined) counts.set(seg, (counts.get(seg) ?? 0) + 1);
    }
    const top = [...counts].sort((a, b) => b[1] - a[1])[0];
    if (!top || top[1] < lists.length * 0.8) break;
    prefix.push(top[0]);
    pool = pool.filter((l) => l[prefix.length - 1] === top[0]);
  }
  return prefix;
}

const relativeTo = (segs: string[], prefix: string[]) =>
  prefix.every((p, i) => segs[i] === p) ? segs.slice(prefix.length) : segs;

/** The deepest cut that still leaves at most `budget` groups. */
function adaptiveDepth(lists: string[][], budget: number): number {
  const maxDepth = lists.reduce((m, l) => Math.max(m, l.length), 0);
  let best = 0;
  for (let depth = 1; depth <= maxDepth; depth += 1) {
    const count = new Set(lists.map((l) => l.slice(0, depth).join("/"))).size;
    if (count > budget) break;
    best = depth;
  }
  return best;
}

const snake = (name: string) =>
  name
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .toLowerCase();

/** `org.springframework.jms.core` -> `org.springframework.jms`; keeps the vendor, drops the depth. */
function javaExternalGroup(imp: string): string {
  const parts = imp.replace(/\.\*$/, "").split(".");
  const vendorFirst = ["org", "com", "io", "net", "javax", "jakarta"].includes(parts[0] ?? "");
  const depth = !vendorFirst ? 1 : parts[1] === "springframework" ? 3 : 2;
  return parts.slice(0, depth).join(".");
}

function tsExternalGroup(imp: string): string {
  const parts = imp.split("/");
  return imp.startsWith("@") ? parts.slice(0, 2).join("/") : (parts[0] ?? imp);
}

interface Module {
  id: string;
  label: string;
  path: string;
  language: "java" | "typescript";
  unit: Unit;
  files: number;
}

export function buildCodeGraph(input: CodeGraphInput): CodeGraph {
  const { project, repositoryId } = input;
  const nodes: CodeNode[] = [];
  const edges: CodeEdge[] = [];
  const edgeIds = new Set<string>();
  const skipped: { path: string; reason: string }[] = [];

  const addEdge = (e: Omit<CodeEdge, "id">) => {
    if (e.source === e.target) return;
    const id = `${e.source}>${e.target}:${e.kind}`;
    if (edgeIds.has(id)) return;
    edgeIds.add(id);
    edges.push({ ...e, id });
  };

  /* ------------------------------------------------------------ *
   * Java: packages grouped into modules, depth chosen per unit.
   * ------------------------------------------------------------ */
  const javaByUnit = new Map<string, ScanFileRecord[]>();
  const tsByUnit = new Map<string, ScanFileRecord[]>();
  const units = new Map<string, Unit>();
  for (const f of project.files) {
    if (f.facts?.unreadable) skipped.push({ path: f.path, reason: f.facts.unreadable });
    if (f.kind !== "source") continue;
    const unit = project.unitOf(f.path);
    units.set(unit.key, unit);
    const bucket = f.facts?.java ? javaByUnit : f.facts?.ts ? tsByUnit : undefined;
    if (!bucket) continue;
    const list = bucket.get(unit.key) ?? [];
    list.push(f);
    bucket.set(unit.key, list);
  }

  const modules = new Map<string, Module>();
  const packageModule = new Map<string, string>();
  const fileModule = new Map<string, string>();
  const multiJava = javaByUnit.size > 1;
  const javaTotal = [...javaByUnit.values()].reduce((n, l) => n + l.length, 0);

  for (const [key, files] of [...javaByUnit].sort((a, b) => a[0].localeCompare(b[0]))) {
    const unit = units.get(key);
    if (!unit) continue;
    const pkgs = files.map((f) => (f.facts?.java?.pkg ?? "").split(".").filter(Boolean));
    const prefix = dominantPrefix(pkgs);
    const budget = Math.max(12, Math.round((JAVA_MODULE_BUDGET * files.length) / javaTotal));
    const depth = adaptiveDepth(
      pkgs.map((p) => relativeTo(p, prefix)),
      budget,
    );
    for (const [index, file] of files.entries()) {
      const segs = pkgs[index] ?? [];
      const rel = relativeTo(segs, prefix).slice(0, depth);
      const id = `j:${key}:${rel.join(".")}`;
      const base = rel.length > 0 ? rel.join(".") : segs.slice(-2).join(".") || "(défaut)";
      let module = modules.get(id);
      if (!module) {
        module = {
          id,
          label: multiJava ? `${unit.name} · ${base}` : base,
          path: dirOf(file.path),
          language: "java",
          unit,
          files: 0,
        };
        modules.set(id, module);
      }
      module.files += 1;
      if (dirOf(file.path).length < module.path.length) module.path = dirOf(file.path);
      packageModule.set(segs.join("."), id);
      fileModule.set(file.path, id);
    }
  }

  /* ------------------------------------------------------------ *
   * TypeScript: directories grouped the same way.
   * ------------------------------------------------------------ */
  const dirModule = new Map<string, string>();
  const tsTotal = [...tsByUnit.values()].reduce((n, l) => n + l.length, 0);
  const multiTs = tsByUnit.size > 1;
  for (const [key, files] of [...tsByUnit].sort((a, b) => a[0].localeCompare(b[0]))) {
    const unit = units.get(key);
    if (!unit) continue;
    const dirs = files.map((f) => dirOf(f.path).split("/").filter(Boolean));
    const prefix = dominantPrefix(dirs);
    const budget = Math.max(8, Math.round((TS_MODULE_BUDGET * files.length) / tsTotal));
    const depth = adaptiveDepth(
      dirs.map((d) => relativeTo(d, prefix)),
      budget,
    );
    for (const [index, file] of files.entries()) {
      const segs = dirs[index] ?? [];
      const rel = relativeTo(segs, prefix).slice(0, depth);
      const id = `t:${key}:${rel.join("/")}`;
      const base = rel.length > 0 ? rel.join("/") : (segs.slice(-1)[0] ?? "(racine)");
      let module = modules.get(id);
      if (!module) {
        module = {
          id,
          label: multiTs ? `${unit.name} · ${base}` : base,
          path: segs.slice(0, segs.length - relativeTo(segs, prefix).length + rel.length).join("/"),
          language: "typescript",
          unit,
          files: 0,
        };
        modules.set(id, module);
      }
      module.files += 1;
      dirModule.set(segs.join("/"), id);
      fileModule.set(file.path, id);
    }
  }

  const moduleOfPackage = (imp: string): string | undefined => {
    let pkg = imp.replace(/\.\*$/, "");
    // `a.b.C`, `a.b.C.Inner` and static members all end up on the package `a.b`.
    for (let strips = 0; strips < 4 && pkg.includes("."); strips += 1) {
      const hit = packageModule.get(pkg);
      if (hit) return hit;
      pkg = pkg.slice(0, pkg.lastIndexOf("."));
    }
    return packageModule.get(pkg);
  };

  const moduleOfDir = (dir: string): string | undefined => {
    let current = dir;
    while (true) {
      const hit = dirModule.get(current);
      if (hit) return hit;
      if (!current.includes("/")) return undefined;
      current = current.slice(0, current.lastIndexOf("/"));
    }
  };

  const resolveRelative = (from: string, spec: string): string => {
    const stack = dirOf(from).split("/").filter(Boolean);
    for (const part of spec.split("/")) {
      if (part === "." || part === "") continue;
      if (part === "..") stack.pop();
      else stack.push(part);
    }
    return stack.join("/");
  };

  /* ------------------------------------------------------------ *
   * Imports, counted per pair of modules.
   * ------------------------------------------------------------ */
  const internal = new Map<string, number>();
  const externalUsers = new Map<string, Set<string>>();
  const externalCounts = new Map<string, Map<string, number>>();
  const bump = (map: Map<string, number>, key: string) => map.set(key, (map.get(key) ?? 0) + 1);
  const noteExternal = (group: string, moduleId: string) => {
    const users = externalUsers.get(group) ?? new Set<string>();
    users.add(moduleId);
    externalUsers.set(group, users);
    const counts = externalCounts.get(group) ?? new Map<string, number>();
    bump(counts, moduleId);
    externalCounts.set(group, counts);
  };

  for (const f of project.files) {
    const from = fileModule.get(f.path);
    if (!from) continue;
    const java = f.facts?.java;
    if (java) {
      for (const imp of java.imports) {
        const to = moduleOfPackage(imp);
        if (to) {
          if (to !== from) bump(internal, `${from}>${to}`);
        } else noteExternal(javaExternalGroup(imp), from);
      }
    }
    const ts = f.facts?.ts;
    if (ts) {
      for (const imp of ts.imports) {
        if (imp.startsWith(".")) {
          const to = moduleOfDir(dirOf(resolveRelative(f.path, imp)));
          if (to && to !== from) bump(internal, `${from}>${to}`);
          continue;
        }
        const unitRoot = project.unitOf(f.path).angular?.dir;
        const rooted =
          unitRoot && (imp.startsWith("src/") || imp.startsWith("app/"))
            ? moduleOfDir(dirOf(`${unitRoot === "." ? "" : `${unitRoot}/`}${imp}`))
            : undefined;
        if (rooted) {
          if (rooted !== from) bump(internal, `${from}>${rooted}`);
        } else noteExternal(tsExternalGroup(imp), from);
      }
    }
  }

  /* ------------------------------------------------------------ *
   * Nodes: modules, entry-point classes, tables, the main externals.
   * ------------------------------------------------------------ */
  for (const m of [...modules.values()].sort((a, b) => a.id.localeCompare(b.id))) {
    nodes.push({
      id: m.id,
      label: m.label,
      kind: "module",
      path: m.path || undefined,
      language: m.language,
      ...(m.language === "java" || m.unit.angular ? { archNodeId: containerNodeId(m.unit) } : {}),
    });
  }
  for (const [pair, count] of [...internal].sort((a, b) => a[0].localeCompare(b[0]))) {
    const [source, target] = pair.split(">") as [string, string];
    addEdge({
      source,
      target,
      kind: "imports",
      confidence: "extracted",
      note: `${count} import${count > 1 ? "s" : ""}`,
    });
  }

  // A library used by a quarter of all modules (lombok, the Spring stereotypes, @angular/core) says
  // nothing about any of them, and as a hub it would glue every community into one blob.
  const ubiquitous = Math.max(6, Math.floor(modules.size * 0.25));
  const ranked = [...externalUsers]
    .filter(([, users]) => users.size <= ubiquitous)
    .sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]))
    .slice(0, MAX_EXTERNALS);
  for (const [group, users] of ranked) {
    const id = `x:${slug(group)}`;
    nodes.push({ id, label: group, kind: "external" });
    for (const moduleId of [...users].sort()) {
      const count = externalCounts.get(group)?.get(moduleId) ?? 1;
      addEdge({
        source: moduleId,
        target: id,
        kind: "imports",
        confidence: "extracted",
        note: `${count} import${count > 1 ? "s" : ""}`,
      });
    }
  }

  /* entry-point classes and their direct imports */
  const types: JavaType[] = project.javaTypes();
  const typesByFile = new Map<string, JavaType[]>();
  for (const t of types) {
    const list = typesByFile.get(t.path) ?? [];
    list.push(t);
    typesByFile.set(t.path, list);
  }
  for (const t of types) {
    const record = project.byPath.get(t.path);
    if (record?.kind !== "source") continue;
    const role = ENTRY_ROLES.find((r) => t.roles.includes(r));
    if (!role) continue;
    const id = `c:${t.fqn}`;
    const unit = project.unitOf(t.path);
    nodes.push({
      id,
      label: t.name,
      kind: t.kind === "interface" ? "interface" : "class",
      path: t.path,
      line: t.line,
      language: "java",
      archNodeId: componentNodeId(unit, role === "application" ? "configuration" : role),
    });
    const own = fileModule.get(t.path);
    if (own) {
      addEdge({
        source: id,
        target: own,
        kind: "imports",
        confidence: "extracted",
        note: "classe d'entrée de ce module",
      });
    }
    const imports = record.facts?.java?.imports ?? [];
    const targets = new Set<string>();
    for (const imp of imports) {
      const to = moduleOfPackage(imp);
      if (to && to !== own) targets.add(to);
    }
    for (const to of [...targets].sort()) {
      addEdge({ source: id, target: to, kind: "imports", confidence: "extracted" });
    }
  }

  /* tables: written name when there is one, else derived, and said so */
  const reposByEntity = new Map<string, JavaType[]>();
  for (const t of types) {
    if (t.entityOf && t.roles.includes("repository")) {
      const list = reposByEntity.get(t.entityOf) ?? [];
      list.push(t);
      reposByEntity.set(t.entityOf, list);
    }
  }
  for (const t of types) {
    if (!t.roles.includes("entity")) continue;
    const record = project.byPath.get(t.path);
    if (record?.kind !== "source") continue;
    const written = t.table;
    const name = written ?? snake(t.name);
    const id = `tbl:${name}`;
    if (!nodes.some((n) => n.id === id)) {
      nodes.push({
        id,
        label: name,
        kind: "table",
        path: t.path,
        line: t.line,
        archNodeId: undefined,
      });
    }
    const entityModule = fileModule.get(t.path);
    const note = written ? `@Table(name = "${written}")` : `nom déduit de la classe ${t.name}`;
    const confidence = written ? "extracted" : "inferred";
    if (entityModule) {
      addEdge({ source: entityModule, target: id, kind: "configures", confidence, note });
    }
    for (const repo of reposByEntity.get(t.name) ?? []) {
      const repoModule = fileModule.get(repo.path);
      if (repoModule) {
        addEdge({
          source: repoModule,
          target: id,
          kind: "reads",
          confidence: "inferred",
          note: `${repo.name} gère l'entité ${t.name}`,
        });
      }
    }
  }

  return {
    projectId: repositoryId,
    repoId: repositoryId,
    commit: input.commit.slice(0, 7),
    generatedAt: input.generatedAt,
    nodes: nodes.map((n) => {
      const { archNodeId, ...rest } = n;
      return archNodeId ? n : rest;
    }),
    edges,
    skipped,
  };
}
