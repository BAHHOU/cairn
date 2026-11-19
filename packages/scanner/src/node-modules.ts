import type { ArchLayer, ScanFileRecord } from "@cairn/shared";
import type { Project } from "./project";

/**
 * TypeScript and JavaScript code outside Angular apps, cut into modules a reader recognises: one
 * per package of a workspace, and inside a package one per folder of `src/` (or per top folder when
 * there is no `src/`). Links are the relative imports between modules, counted file by file.
 */

export interface NodeModule {
  key: string;
  label: string;
  /** The package it belongs to, `.` for the repository root. */
  packageDir: string;
  layer: ArchLayer;
  files: ScanFileRecord[];
}

export interface NodeImport {
  from: string;
  to: string;
  /** Number of import statements from one module to the other. */
  count: number;
  /** One file that shows it, for the source link. */
  example: string;
}

export interface NodeArchitecture {
  modules: NodeModule[];
  imports: NodeImport[];
  /** Modules folded into "other modules" because the map would be unreadable with all of them. */
  folded: NodeModule[];
  /** Weaker module-to-module links left out of the map (they stay in the code map). */
  hiddenImports: number;
}

/** Beyond this, the smallest modules are folded into one box. */
export const MAX_NODE_MODULES = 18;
/** A module shows at most its strongest dependencies, each carrying a real share of its imports. */
const MAX_LINKS_PER_MODULE = 3;
const MIN_LINK_IMPORTS = 5;
const MIN_LINK_SHARE = 0.05;

/** Folders that hold examples, fixtures or build scripts, not the product. */
export const NOT_PRODUCT =
  /(^|\/)(node_modules|dist|build|coverage|__tests__|__mocks__|tests?|e2e|fixtures?|examples?|samples?|conformance|scripts)(\/|$)/;

const dirOf = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : ".");
const inside = (path: string, dir: string) => dir === "." || path.startsWith(`${dir}/`);

/** Where a module sits in a layered (hexagonal, clean) codebase, read from its name. */
export function layerOfModule(name: string): ArchLayer {
  const n = name.toLowerCase();
  if (
    /^(domain|domaine|model|models|entities|entity|kernel|core|contracts?|types|shared|common)$/.test(
      n,
    )
  )
    return "domaine";
  if (
    /^(app|application|use-?cases?|services?|composition|ports?|config|configuration|main|lib)$/.test(
      n,
    )
  )
    return "application";
  if (
    /^(cli|server|api|http|web|ui|browser|desktop|pages|routes|views|components|inspector|website|frontend|client|commands?)$/.test(
      n,
    )
  )
    return "experience";
  return "infrastructure";
}

/** `../domain/x.js` imported from `src/adb/a.ts` gives `src/domain/x`. Bare specifiers return null. */
function resolveRelative(fromPath: string, spec: string): string | null {
  if (!spec.startsWith(".")) return null;
  const parts = dirOf(fromPath) === "." ? [] : dirOf(fromPath).split("/");
  for (const seg of spec.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (parts.length === 0) return null;
      parts.pop();
    } else parts.push(seg);
  }
  return parts.join("/");
}

export function buildNodeArchitecture(project: Project): NodeArchitecture {
  const packageDirs = project.files
    .filter((f) => f.path.endsWith("package.json") && f.facts?.pkg && !NOT_PRODUCT.test(f.path))
    .map((f) => dirOf(f.path))
    .sort((a, b) => b.length - a.length);
  const angularDirs = project.angular.map((a) => a.dir);
  const multiPackage = packageDirs.length > 1;
  const nameOf = new Map(
    project.files
      .filter((f) => f.path.endsWith("package.json") && f.facts?.pkg?.name)
      .map((f) => [dirOf(f.path), f.facts?.pkg?.name as string] as const),
  );

  const moduleKeyOf = (path: string): { key: string; label: string; pkg: string } | null => {
    if (NOT_PRODUCT.test(path)) return null;
    const pkg = packageDirs.find((d) => inside(path, d)) ?? ".";
    const rel = pkg === "." ? path : path.slice(pkg.length + 1);
    const segs = rel.split("/");
    const pkgLabel = nameOf.get(pkg) ?? (pkg === "." ? "racine" : (pkg.split("/").pop() as string));
    const prefix = pkg === "." ? "" : `${pkg}/`;
    // In a workspace each package is one box: its folders are detail for the code map.
    if (multiPackage && pkg !== ".") return { key: pkg, label: pkgLabel, pkg };
    if (segs[0] === "src" && segs.length > 2) {
      return { key: `${prefix}src/${segs[1]}`, label: segs[1] as string, pkg };
    }
    if (segs.length > 1 && segs[0] !== "src") {
      return { key: `${prefix}${segs[0]}`, label: segs[0] as string, pkg };
    }
    return { key: pkg === "." ? "src" : pkg, label: pkgLabel, pkg };
  };

  const byKey = new Map<string, NodeModule>();
  const moduleOfFile = new Map<string, string>();
  for (const f of project.files) {
    if (f.kind !== "source" || !f.facts?.ts) continue;
    if (angularDirs.some((d) => inside(f.path, d))) continue;
    const m = moduleKeyOf(f.path);
    if (!m) continue;
    const mod = byKey.get(m.key) ?? {
      key: m.key,
      label: m.label,
      packageDir: m.pkg,
      layer: layerOfModule(m.label),
      files: [],
    };
    mod.files.push(f);
    byKey.set(m.key, mod);
    moduleOfFile.set(f.path.replace(/\.(m|c)?[jt]sx?$/, ""), m.key);
  }

  const ranked = [...byKey.values()].sort(
    (a, b) => b.files.length - a.files.length || a.key.localeCompare(b.key),
  );
  const modules = ranked.slice(0, MAX_NODE_MODULES);
  const folded = ranked.slice(MAX_NODE_MODULES);
  const kept = new Set(modules.map((m) => m.key));

  const pairs = new Map<string, NodeImport>();
  for (const mod of ranked) {
    for (const f of mod.files) {
      for (const spec of f.facts?.ts?.imports ?? []) {
        const target = resolveRelative(f.path, spec);
        if (!target) continue;
        const bare = target.replace(/\.(m|c)?[jt]sx?$/, "");
        const to = moduleOfFile.get(bare) ?? moduleOfFile.get(`${bare}/index`);
        if (!to || to === mod.key) continue;
        // Folded modules all land on one box, so their links are counted there.
        const from = kept.has(mod.key) ? mod.key : OTHER;
        const dest = kept.has(to) ? to : OTHER;
        if (from === dest) continue;
        const id = `${from}>${dest}`;
        const pair = pairs.get(id) ?? { from, to: dest, count: 0, example: f.path };
        pair.count += 1;
        pairs.set(id, pair);
      }
    }
  }
  const all = [...pairs.values()].sort(
    (a, b) => b.count - a.count || `${a.from}${a.to}`.localeCompare(`${b.from}${b.to}`),
  );
  // Every module of a layered codebase imports the domain: drawing every pair gives a hairball.
  // Keep the strong dependencies of each module, the code map has the rest.
  const outgoing = new Map<string, number>();
  for (const i of all) outgoing.set(i.from, (outgoing.get(i.from) ?? 0) + i.count);
  const perSource = new Map<string, number>();
  const imports: NodeImport[] = [];
  for (const i of all) {
    const total = outgoing.get(i.from) ?? 0;
    const kept = perSource.get(i.from) ?? 0;
    if (kept >= MAX_LINKS_PER_MODULE) continue;
    if (i.count < Math.max(MIN_LINK_IMPORTS, total * MIN_LINK_SHARE) && kept > 0) continue;
    perSource.set(i.from, kept + 1);
    imports.push(i);
  }
  return { modules, imports, folded, hiddenImports: all.length - imports.length };
}

/** Key of the box that stands for the folded modules. */
export const OTHER = "~other";
