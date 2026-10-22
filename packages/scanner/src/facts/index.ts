import type { FileFacts, FileKind } from "@cairn/shared";
import { extractCi, extractDocker } from "./ci";
import { extractConfig, type Finding } from "./config";
import { extractDeploy } from "./deploy";
import { extractDoc } from "./docs";
import { extractJava } from "./java";
import { extractPom } from "./pom";
import { scanSecrets } from "./secrets";
import { countLines } from "./text";
import { extractPackageJson, extractTs } from "./ts";

export { classify } from "../classify";

const baseName = (path: string) => path.slice(path.lastIndexOf("/") + 1);
const extOf = (name: string) => {
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? "" : name.slice(dot + 1).toLowerCase();
};

/** Extensions where a `key: "value"` pair is prose or markup rather than a credential. */
const NO_KEY_VALUE = new Set([
  "html",
  "htm",
  "css",
  "scss",
  "sass",
  "less",
  "md",
  "rst",
  "adoc",
  "txt",
]);
const CAP_FINDINGS = 50;

export interface Extracted {
  lines: number;
  facts?: FileFacts;
}

/** One file in, its facts out. Never throws: a file that cannot be read is declared, not skipped. */
export function extractFile(path: string, kind: FileKind, text: string): Extracted {
  const name = baseName(path);
  const lower = name.toLowerCase();
  const ext = extOf(name);
  const lines = countLines(text);
  const facts: FileFacts = {};
  const findings: Finding[] = [];

  try {
    if (ext === "java") facts.java = extractJava(text);
    else if (ext === "md" && kind !== "generated") facts.doc = extractDoc(text);
    else if ((ext === "ts" || ext === "tsx") && !lower.endsWith(".d.ts"))
      facts.ts = extractTs(text);
    else if (lower === "pom.xml") {
      const pom = extractPom(text);
      if (pom) facts.pom = pom;
    } else if (lower === "package.json" && kind !== "generated") {
      const pkg = extractPackageJson(text);
      if (pkg) facts.pkg = pkg;
    } else if (lower.startsWith("dockerfile")) facts.docker = extractDocker(text);
    else if (
      lower === ".gitlab-ci.yml" ||
      lower === ".gitlab-ci.yaml" ||
      lower === "jenkinsfile" ||
      path.startsWith(".github/workflows/")
    ) {
      const ci = extractCi(path, text);
      if (ci) facts.ci = ci;
    }
  } catch (error) {
    facts.unreadable = `extraction impossible : ${(error as Error).message.slice(0, 120)}`;
  }

  if (
    kind !== "generated" &&
    kind !== "data" &&
    kind !== "binary" &&
    (ext === "yml" || ext === "yaml" || ext === "tf")
  ) {
    try {
      const deploy = extractDeploy(path, text);
      if (deploy) facts.deploy = deploy;
    } catch {
      // A manifest that cannot be read is not a delivery fact; the config pass reports unreadable YAML.
    }
  }

  const structured = ext === "yml" || ext === "yaml" || ext === "properties";
  if (structured && kind !== "generated" && kind !== "data") {
    try {
      const config = extractConfig(text, ext === "properties" ? "properties" : "yaml", {
        reportSecrets: kind !== "test",
      });
      if (config.entries.length > 0) facts.config = config.entries;
      findings.push(...config.findings);
    } catch (error) {
      facts.unreadable = `YAML illisible : ${(error as Error).message.slice(0, 120)}`;
    }
  }

  if (kind !== "generated" && kind !== "data" && kind !== "binary") {
    findings.push(
      ...scanSecrets(text, {
        structuredKeyValues: kind !== "test" && !structured && !NO_KEY_VALUE.has(ext),
      }),
    );
  }
  if (findings.length > 0) facts.findings = findings.slice(0, CAP_FINDINGS);

  return Object.keys(facts).length > 0 ? { lines, facts } : { lines };
}

export {
  extractCi,
  extractConfig,
  extractDeploy,
  extractDocker,
  extractJava,
  extractPom,
  extractTs,
};
