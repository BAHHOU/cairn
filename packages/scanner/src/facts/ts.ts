import type { PackageJsonFacts, TsFacts } from "@cairn/shared";
import { stripComments } from "./text";

const IMPORT_RE =
  /(?:import|export)\s[^;'"`]*?\sfrom\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|require\(\s*['"]([^'"]+)['"]\s*\)/g;
const DECORATOR_RE =
  /@(Component|Injectable|NgModule|Directive|Pipe)\s*\([\s\S]*?\)\s*export\s+(?:default\s+)?(?:abstract\s+)?class\s+(\w+)/g;

const ANGULAR_KIND = {
  Component: "component",
  Injectable: "service",
  NgModule: "module",
  Directive: "directive",
  Pipe: "pipe",
} as const;

const CAP_IMPORTS = 300;

export function extractTs(source: string): TsFacts {
  const src = stripComments(source, true);
  const imports = new Set<string>();
  for (const m of src.matchAll(IMPORT_RE)) {
    const spec = m[1] ?? m[2] ?? m[3] ?? m[4];
    if (spec) imports.add(spec);
    if (imports.size >= CAP_IMPORTS) break;
  }
  const angular: TsFacts["angular"] = [];
  for (const m of src.matchAll(DECORATOR_RE)) {
    const kind = ANGULAR_KIND[m[1] as keyof typeof ANGULAR_KIND];
    if (kind && m[2]) angular.push({ kind, name: m[2] });
  }
  return { imports: [...imports], angular, usesHttp: /\bHttpClient\b/.test(src) };
}

export function extractPackageJson(text: string): PackageJsonFacts | undefined {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!json || typeof json !== "object") return undefined;
  const obj = json as Record<string, unknown>;
  const names = (v: unknown): string[] =>
    v && typeof v === "object" ? Object.keys(v as Record<string, unknown>) : [];
  const deps = { ...(obj.dependencies as object), ...(obj.devDependencies as object) } as Record<
    string,
    unknown
  >;
  const facts: PackageJsonFacts = {
    dependencies: Object.keys(deps).slice(0, 200),
    scripts: names(obj.scripts).slice(0, 40),
  };
  if (typeof obj.name === "string") facts.name = obj.name;
  const angular = deps["@angular/core"];
  if (typeof angular === "string") facts.angular = angular;
  return facts;
}
