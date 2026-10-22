import type { FileKind } from "@cairn/shared";

export interface Classified {
  kind: FileKind;
  language?: string;
  /** False for files that are never read as text (archives, keystores, images). */
  text: boolean;
}

const LANGUAGES: Record<string, string> = {
  java: "Java",
  kt: "Kotlin",
  scala: "Scala",
  groovy: "Groovy",
  ts: "TypeScript",
  tsx: "TypeScript",
  js: "JavaScript",
  jsx: "JavaScript",
  mjs: "JavaScript",
  cjs: "JavaScript",
  html: "HTML",
  htm: "HTML",
  scss: "Styles",
  sass: "Styles",
  less: "Styles",
  css: "Styles",
  sql: "SQL",
  py: "Python",
  go: "Go",
  cs: "C#",
  rs: "Rust",
  rb: "Ruby",
  php: "PHP",
  sh: "Shell",
  bash: "Shell",
  ps1: "PowerShell",
  xml: "XML",
  json: "JSON",
  yml: "YAML",
  yaml: "YAML",
  properties: "Properties",
  md: "Markdown",
  rst: "Markdown",
  adoc: "Markdown",
  txt: "Texte",
};

const CODE_EXT = new Set([
  "java",
  "kt",
  "scala",
  "groovy",
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "html",
  "htm",
  "scss",
  "sass",
  "less",
  "css",
  "sql",
  "py",
  "go",
  "cs",
  "rs",
  "rb",
  "php",
  "sh",
  "bash",
  "ps1",
]);

const BINARY_EXT = new Set([
  "jks",
  "p12",
  "pfx",
  "pem",
  "crt",
  "cer",
  "der",
  "keystore",
  "zip",
  "jar",
  "war",
  "ear",
  "class",
  "tar",
  "gz",
  "tgz",
  "bz2",
  "xz",
  "7z",
  "rar",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "ico",
  "bmp",
  "webp",
  "svgz",
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "woff",
  "woff2",
  "ttf",
  "eot",
  "otf",
  "mp3",
  "mp4",
  "mov",
  "avi",
  "so",
  "dll",
  "exe",
  "dylib",
  "bin",
  "dat",
  "db",
  "sqlite",
]);

const DATA_EXT = new Set(["csv", "tsv", "ndjson", "log", "parquet"]);
const CONFIG_EXT = new Set(["yml", "yaml", "properties", "conf", "ini", "toml", "cfg", "env"]);
const GENERATED_NAMES = new Set([
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "poetry.lock",
  "cargo.lock",
  "gemfile.lock",
  "composer.lock",
  "go.sum",
]);
const BUILD_NAMES = new Set([
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "settings.gradle",
  "package.json",
  "angular.json",
  "makefile",
  "jenkinsfile",
  "maven_settings.xml",
  "version.sh",
  "kustomization.yaml",
  "kustomization.yml",
  "chart.yaml",
  ".gitlab-ci.yml",
  ".gitlab-ci.yaml",
]);

const GENERATED_DIR =
  /(^|\/)(node_modules|dist|target|\.next|\.angular|coverage|__generated__|generated)\//;
const DATA_DIR = /(^|\/)(samples?|fixtures?|testdata|test-data|mock-data|mocks?)\//;
const TEST_DIR = /(^|\/)(src\/test|tests?|__tests__|e2e)\//;
const TEST_FILE = /(\.(spec|test)\.[jt]sx?$)|((Test|Tests|IT)\.java$)/;

const SIZE_DATA_JSON = 100_000;
const SIZE_DATA_TEXT = 20_000;

const extOf = (path: string): string => {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? "" : name.slice(dot + 1).toLowerCase();
};

/**
 * Decides what a file is from its path and size alone, without reading it.
 * The categories answer one question: would an AI assistant benefit from reading this?
 */
export function classify(path: string, bytes: number): Classified {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const lower = name.toLowerCase();
  const ext = extOf(path);
  const language = LANGUAGES[ext];

  if (BINARY_EXT.has(ext)) return { kind: "binary", language, text: false };
  if (GENERATED_NAMES.has(lower) || lower.endsWith(".min.js") || lower.endsWith(".map")) {
    return { kind: "generated", language, text: true };
  }
  if (GENERATED_DIR.test(path)) return { kind: "generated", language, text: true };
  if (
    BUILD_NAMES.has(lower) ||
    lower.startsWith("dockerfile") ||
    lower.startsWith("docker-compose")
  ) {
    return { kind: "build", language, text: true };
  }
  if (path.startsWith(".github/workflows/")) return { kind: "build", language: "YAML", text: true };
  if (DATA_EXT.has(ext) || DATA_DIR.test(path)) return { kind: "data", language, text: true };
  if (CODE_EXT.has(ext)) {
    const isTest = TEST_DIR.test(path) || TEST_FILE.test(name);
    return { kind: isTest ? "test" : "source", language, text: true };
  }
  if (ext === "md" || ext === "rst" || ext === "adoc") return { kind: "doc", language, text: true };
  if (ext === "txt") {
    return { kind: bytes > SIZE_DATA_TEXT ? "data" : "doc", language, text: true };
  }
  if (ext === "json" || ext === "xml") {
    if (bytes > SIZE_DATA_JSON) return { kind: "data", language, text: true };
    return { kind: TEST_DIR.test(path) ? "test" : "config", language, text: true };
  }
  if (CONFIG_EXT.has(ext) || name.startsWith(".env") || ext === "") {
    return { kind: "config", language, text: true };
  }
  return { kind: bytes > SIZE_DATA_TEXT ? "data" : "config", language, text: true };
}
