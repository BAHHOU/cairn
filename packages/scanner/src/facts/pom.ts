import type { PomDependency, PomFacts } from "@cairn/shared";

const tag = (xml: string, name: string): string | undefined =>
  new RegExp(`<${name}>\\s*([^<]*?)\\s*</${name}>`).exec(xml)?.[1];

const without = (xml: string, name: string): string =>
  xml.replace(new RegExp(`<${name}\\b[^>]*>[\\s\\S]*?</${name}>`, "g"), "");

const CAP_DEPS = 200;

/**
 * Reads a Maven `pom.xml` with a few patterns: coordinates, modules, direct dependencies and plugin
 * names. Dependency management, profiles and build sections are cut out first so that a managed
 * version is never mistaken for a real dependency.
 */
export function extractPom(source: string): PomFacts | undefined {
  const xml = source.replace(/<!--[\s\S]*?-->/g, "");
  if (!/<project\b/.test(xml)) return undefined;

  const parentBlock = /<parent>([\s\S]*?)<\/parent>/.exec(xml)?.[1] ?? "";
  const parent = tag(parentBlock, "artifactId");
  const build = /<build>([\s\S]*?)<\/build>/.exec(xml)?.[1] ?? "";
  const plugins = [
    ...build.matchAll(/<plugin>[\s\S]*?<artifactId>\s*([^<\s]+)\s*<\/artifactId>/g),
  ].map((m) => m[1] as string);

  const props = /<properties>([\s\S]*?)<\/properties>/.exec(xml)?.[1] ?? "";
  const javaVersion =
    tag(props, "java.version") ??
    tag(props, "maven.compiler.release") ??
    tag(props, "maven.compiler.source");

  let own = without(xml, "parent");
  for (const section of ["dependencyManagement", "build", "profiles", "reporting", "properties"]) {
    own = without(own, section);
  }

  const dependencies: PomDependency[] = [];
  for (const m of own.matchAll(/<dependency>([\s\S]*?)<\/dependency>/g)) {
    const block = m[1] as string;
    const artifactId = tag(block, "artifactId");
    if (!artifactId) continue;
    const groupId = tag(block, "groupId") ?? "";
    const dep: PomDependency = { id: `${groupId}:${artifactId}` };
    const scope = tag(block, "scope");
    if (scope) dep.scope = scope;
    dependencies.push(dep);
    if (dependencies.length >= CAP_DEPS) break;
  }

  const head = without(without(own, "dependencies"), "modules");
  const artifactId = tag(head, "artifactId");
  if (!artifactId) return undefined;

  const facts: PomFacts = {
    artifactId,
    modules: [...own.matchAll(/<module>\s*([^<\s]+)\s*<\/module>/g)].map((m) => m[1] as string),
    dependencies,
    plugins: [...new Set(plugins)],
  };
  const groupId = tag(head, "groupId");
  if (groupId) facts.groupId = groupId;
  const packaging = tag(head, "packaging");
  if (packaging) facts.packaging = packaging;
  if (parent) facts.parent = parent;
  if (javaVersion && !javaVersion.includes("${")) facts.javaVersion = javaVersion;
  if (parent === "spring-boot-starter-parent") {
    const version = tag(parentBlock, "version");
    if (version && !version.includes("${")) facts.springBootVersion = version;
  }
  return facts;
}
