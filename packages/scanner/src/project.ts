import type { JavaTypeFacts, PackageJsonFacts, PomFacts, ScanFileRecord } from "@cairn/shared";

export interface MavenModule {
  /** Directory of the pom, `.` for the root. */
  dir: string;
  pomPath: string;
  artifactId: string;
  pom: PomFacts;
  /** Aggregators (`packaging pom`) hold no code of their own. */
  aggregator: boolean;
}

export interface AngularApp {
  dir: string;
  packagePath: string;
  name: string;
  version: string;
  pkg: PackageJsonFacts;
}

export interface JavaType extends JavaTypeFacts {
  fqn: string;
  path: string;
  unit: string;
}

/** A buildable part of the repository: a Maven module, an Angular app, or a top-level folder. */
export interface Unit {
  /** Stable key: the directory of the unit. `.` for files at the root. */
  key: string;
  name: string;
  kind: "maven" | "angular" | "folder";
  maven?: MavenModule;
  angular?: AngularApp;
}

const dirOf = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : ".");

const insideDir = (path: string, dir: string) => dir === "." || path.startsWith(`${dir}/`);

/**
 * An index over the scanned files: which Maven modules and Angular apps exist, and which unit any
 * path belongs to. Everything the architecture and the code map need to place a file.
 */
export class Project {
  readonly byPath = new Map<string, ScanFileRecord>();
  readonly maven: MavenModule[] = [];
  readonly angular: AngularApp[] = [];
  private readonly mavenDeepestFirst: MavenModule[];
  private readonly angularDeepestFirst: AngularApp[];
  private readonly units = new Map<string, Unit>();

  constructor(readonly files: ScanFileRecord[]) {
    for (const f of files) {
      this.byPath.set(f.path, f);
      if (f.facts?.pom) {
        this.maven.push({
          dir: dirOf(f.path),
          pomPath: f.path,
          artifactId: f.facts.pom.artifactId,
          pom: f.facts.pom,
          aggregator: f.facts.pom.packaging === "pom",
        });
      }
      if (f.facts?.pkg?.angular) {
        const dir = dirOf(f.path);
        this.angular.push({
          dir,
          packagePath: f.path,
          name: f.facts.pkg.name ?? ((dir === "." ? "" : dir.split("/").pop()) || "angular"),
          version: f.facts.pkg.angular,
          pkg: f.facts.pkg,
        });
      }
    }
    const byDepth = <T extends { dir: string }>(a: T[]) =>
      [...a].sort((x, y) => y.dir.length - x.dir.length);
    this.mavenDeepestFirst = byDepth(this.maven.filter((m) => !m.aggregator));
    this.angularDeepestFirst = byDepth(this.angular);
  }

  /** The unit a file belongs to: Maven module first, then Angular app, then its top-level folder. */
  unitOf(path: string): Unit {
    const maven = this.mavenDeepestFirst.find((m) => insideDir(path, m.dir));
    const angular = this.angularDeepestFirst.find((a) => insideDir(path, a.dir));
    let unit: Unit;
    if (maven) {
      const app = this.angularDeepestFirst.find(
        (a) => insideDir(a.dir, maven.dir) && (maven.dir !== "." || a.dir !== "."),
      );
      unit = {
        key: maven.dir,
        name: maven.artifactId,
        kind: "maven",
        maven,
        ...(app ? { angular: app } : {}),
      };
    } else if (angular) {
      unit = { key: angular.dir, name: angular.name, kind: "angular", angular };
    } else {
      const top = path.includes("/") ? (path.split("/")[0] as string) : ".";
      unit = { key: top, name: top === "." ? "racine" : top, kind: "folder" };
    }
    const cached = this.units.get(unit.key);
    if (cached) return cached;
    this.units.set(unit.key, unit);
    return unit;
  }

  /** Every unit seen so far, deterministic order. */
  allUnits(): Unit[] {
    return [...this.units.values()].sort((a, b) => a.key.localeCompare(b.key));
  }

  /** The unit that owns a Maven artifact, by artifactId. */
  unitOfArtifact(artifactId: string): Unit | undefined {
    const m = this.maven.find((x) => x.artifactId === artifactId && !x.aggregator);
    return m ? this.unitOf(`${m.dir}/x`) : undefined;
  }

  /** Internal Maven dependencies of a unit, transitively (A needs B needs C gives B and C). */
  internalClosure(unitKey: string): Set<string> {
    const seen = new Set<string>();
    const queue = [unitKey];
    const artifacts = new Map(this.maven.map((m) => [m.artifactId, m] as const));
    const dirToModule = new Map(this.mavenDeepestFirst.map((m) => [m.dir, m] as const));
    while (queue.length > 0) {
      const current = dirToModule.get(queue.pop() as string);
      if (!current) continue;
      for (const dep of current.pom.dependencies) {
        const target = artifacts.get(dep.id.slice(dep.id.indexOf(":") + 1));
        if (target && !target.aggregator && !seen.has(target.dir) && target.dir !== unitKey) {
          seen.add(target.dir);
          queue.push(target.dir);
        }
      }
    }
    return seen;
  }

  /** The Java types of the repository with their fully qualified name and unit. */
  javaTypes(): JavaType[] {
    const out: JavaType[] = [];
    for (const f of this.files) {
      const java = f.facts?.java;
      if (!java) continue;
      const unit = this.unitOf(f.path).key;
      for (const t of java.types) {
        out.push({ ...t, fqn: java.pkg ? `${java.pkg}.${t.name}` : t.name, path: f.path, unit });
      }
    }
    return out;
  }
}
