import type { DeployFacts, DeployObject } from "@cairn/shared";
import { parse } from "yaml";
import { redact, stripUrlQuery } from "./redact";

/**
 * Where a repository says it runs: Kubernetes, Argo CD and Flux objects, compose services, Helm
 * charts, Kustomize overlays, Terraform. Read with patterns and never executed, so a Helm template
 * full of `{{ }}` is still understood. A secret is never read: `Secret` objects are skipped and a URL
 * loses its credentials and its query.
 */

const CAP_OBJECTS = 60;
const CAP_IMAGES = 8;
const CAP_COMPOSE = 30;

/** Kinds that say something about delivery. `ConfigMap` and `Secret` do not, and the latter is never read. */
const KINDS = new Set([
  "Deployment",
  "StatefulSet",
  "DaemonSet",
  "Job",
  "CronJob",
  "Service",
  "Ingress",
  "IngressRoute",
  "Route",
  "DeploymentConfig",
  "HorizontalPodAutoscaler",
  "Namespace",
  "PersistentVolumeClaim",
  "NetworkPolicy",
  "Rollout",
  "Application",
  "ApplicationSet",
  "AppProject",
  "Kustomization",
  "HelmRelease",
  "GitRepository",
  "HelmRepository",
]);

const unquote = (v: string) => v.replace(/^["']|["']$/g, "").trim();

/** `https://user:token@host/group/repo.git?x=1` -> `https://host/group/repo.git` */
const cleanUrl = (raw: string) =>
  redact(stripUrlQuery(unquote(raw)).replace(/^(\w+:\/\/)[^/@\s]*@/, "$1")).slice(0, 200);

const value = (line: string, key: string): string | undefined => {
  const m = new RegExp(`^\\s*-?\\s*${key}:\\s*(\\S.*?)\\s*(?:#.*)?$`).exec(line);
  const v = m?.[1] ? unquote(m[1]) : undefined;
  return v && v !== "|" && v !== ">" ? v : undefined;
};

const indentOf = (line: string) => line.length - line.trimStart().length;

function readObject(lines: string[], startLine: number): DeployObject | null {
  let apiVersion: string | undefined;
  let kind: string | undefined;
  for (const l of lines) {
    if (!apiVersion && /^apiVersion:/.test(l)) apiVersion = value(l, "apiVersion");
    else if (!kind && /^kind:/.test(l)) kind = value(l, "kind");
    if (apiVersion && kind) break;
  }
  if (!apiVersion || !kind || !KINDS.has(kind)) return null;
  // Kustomize's own file is described by `kustomize`, not as an object.
  if (apiVersion.startsWith("kustomize.config.")) return null;

  const object: DeployObject = { kind, apiVersion, line: startLine, images: [] };
  let inMetadata = false;
  for (const l of lines) {
    if (/^metadata:/.test(l)) {
      inMetadata = true;
      continue;
    }
    if (inMetadata && l.trim() && indentOf(l) === 0) inMetadata = false;
    if (inMetadata && indentOf(l) === 2) {
      if (!object.name) object.name = value(l, "name");
      if (!object.namespace) object.namespace = value(l, "namespace");
    }
    const image = /^\s*-?\s*image:\s*["']?([^\s"'#]+)/.exec(l)?.[1];
    if (image && object.images.length < CAP_IMAGES && !object.images.includes(image)) {
      object.images.push(image);
    }
  }

  if (
    ["Application", "ApplicationSet", "HelmRelease", "Kustomization", "GitRepository"].includes(
      kind,
    )
  ) {
    const sync: NonNullable<DeployObject["sync"]> = {};
    let destIndent = -1;
    for (const l of lines) {
      if (!l.trim()) continue;
      const indent = indentOf(l);
      if (destIndent >= 0 && indent <= destIndent) destIndent = -1;
      if (/^\s*destination:/.test(l)) {
        destIndent = indent;
        continue;
      }
      if (destIndent >= 0) {
        sync.destNamespace ??= value(l, "namespace");
        sync.destCluster ??= value(l, "server") ?? value(l, "name");
        continue;
      }
      const repo = value(l, "repoURL") ?? value(l, "url");
      if (repo && !sync.repoUrl && /^(https?|ssh|git|oci):\/\/|^git@/.test(repo)) {
        sync.repoUrl = cleanUrl(repo);
      }
      sync.path ??= value(l, "path");
      sync.chart ??= value(l, "chart");
      sync.revision ??= value(l, "targetRevision") ?? value(l, "branch");
      if (/^\s*automated:/.test(l)) sync.automated = true;
    }
    if (Object.keys(sync).length > 0) object.sync = sync;
  }
  return object;
}

function readManifests(text: string): DeployObject[] {
  if (!/^apiVersion:/m.test(text) || !/^kind:/m.test(text)) return [];
  const objects: DeployObject[] = [];
  const lines = text.split(/\r?\n/);
  let docStart = 0;
  const flush = (end: number) => {
    const object = readObject(lines.slice(docStart, end), docStart + 1);
    if (object && objects.length < CAP_OBJECTS) objects.push(object);
  };
  for (let i = 0; i < lines.length; i++) {
    if (/^---\s*$/.test(lines[i] as string)) {
      flush(i);
      docStart = i + 1;
    }
  }
  flush(lines.length);
  return objects;
}

const COMPOSE_NAME = /^(?:docker-)?compose(?:[.-][\w.-]+)?\.ya?ml$/i;

function readCompose(text: string): DeployFacts["compose"] {
  const doc = parse(text) as { services?: Record<string, unknown> } | null;
  if (!doc || typeof doc !== "object" || !doc.services || typeof doc.services !== "object") {
    return undefined;
  }
  const lines = text.split(/\r?\n/);
  return Object.entries(doc.services)
    .slice(0, CAP_COMPOSE)
    .map(([name, raw]) => {
      const svc = (raw ?? {}) as Record<string, unknown>;
      const ports = Array.isArray(svc.ports) ? svc.ports.map((p) => String(p)).slice(0, 6) : [];
      const at = lines.findIndex((l) =>
        new RegExp(`^\\s{1,4}${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:\\s*$`).test(l),
      );
      return {
        name,
        ...(typeof svc.image === "string" ? { image: svc.image } : {}),
        built: svc.build !== undefined,
        ports,
        line: at === -1 ? 1 : at + 1,
      };
    });
}

function readChart(text: string): DeployFacts["chart"] {
  const name = /^name:\s*(\S+)/m.exec(text)?.[1];
  if (!name || !/^apiVersion:\s*v\d/m.test(text)) return undefined;
  const version = /^version:\s*(\S+)/m.exec(text)?.[1];
  const dependencies: string[] = [];
  let inDependencies = false;
  for (const l of text.split(/\r?\n/)) {
    if (/^dependencies:/.test(l)) {
      inDependencies = true;
      continue;
    }
    if (inDependencies && l.trim() && indentOf(l) === 0) inDependencies = false;
    const dep = inDependencies ? value(l, "name") : undefined;
    if (dep) dependencies.push(dep);
  }
  return { name: unquote(name), ...(version ? { version: unquote(version) } : {}), dependencies };
}

function readKustomize(text: string): DeployFacts["kustomize"] {
  const resources = (/^resources:\s*\n((?:\s+-.*\n?)+)/m.exec(text)?.[1] ?? "")
    .split("\n")
    .filter((l) => l.trim().startsWith("-")).length;
  const images = [...text.matchAll(/^\s*-\s*name:\s*(\S+)/gm)].map((m) => unquote(m[1] as string));
  return { resources, images: images.slice(0, CAP_IMAGES) };
}

function readTerraform(text: string): DeployFacts["terraform"] {
  const providers = new Set<string>();
  for (const m of text.matchAll(/^\s*provider\s+"([^"]+)"/gm)) providers.add(m[1] as string);
  for (const m of text.matchAll(/source\s*=\s*"(?:[\w.-]+\/)?[\w.-]+\/([\w-]+)"/g)) {
    providers.add(m[1] as string);
  }
  const resources = [...text.matchAll(/^\s*resource\s+"/gm)].length;
  if (providers.size === 0 && resources === 0) return undefined;
  return { providers: [...providers].slice(0, 6), resources };
}

/** Facts about where the file says something runs. Undefined for a file that says nothing about it. */
export function extractDeploy(path: string, text: string): DeployFacts | undefined {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const lower = name.toLowerCase();
  const facts: DeployFacts = { objects: [] };

  if (lower.endsWith(".tf")) {
    const terraform = readTerraform(text);
    if (!terraform) return undefined;
    facts.terraform = terraform;
    return facts;
  }
  if (!/\.ya?ml$/.test(lower)) return undefined;

  if (COMPOSE_NAME.test(name)) {
    const compose = readCompose(text);
    if (compose && compose.length > 0) facts.compose = compose;
  } else if (lower === "chart.yaml") {
    const chart = readChart(text);
    if (chart) facts.chart = chart;
  } else if (lower === "kustomization.yaml" || lower === "kustomization.yml") {
    facts.kustomize = readKustomize(text);
  } else {
    facts.objects = readManifests(text);
  }

  const empty = facts.objects.length === 0 && !facts.compose && !facts.chart && !facts.kustomize;
  return empty ? undefined : facts;
}
