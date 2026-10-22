import type {
  ArchNode,
  DeliveryView,
  DeployFacts,
  DeployObject,
  GuideSource,
  PipelineImageView,
  PipelineJobView,
  ProjectArchitecture,
  TopologyBasis,
  TopologyBrand,
  TopologyEdge,
  TopologyLane,
  TopologyNode,
  TopologyRole,
  TopologyView,
} from "@cairn/shared";
import { PIPELINE_JOB_ROLE_LABEL } from "@cairn/shared";
import { imageRepository } from "./facts/ci";
import type { Project } from "./project";

/**
 * The delivery topology: what talks to what, from the commit to what runs.
 *
 * Every node and every edge says how it is known: written in a file (`found`), deduced (`inferred`),
 * or part of what a delivery chain normally has and this repository does not describe (`missing`).
 * A missing part is drawn, not hidden: "deployment happens elsewhere" is the most useful sentence the
 * picture can say about a repository like that.
 */

export interface TopologyContext {
  architecture: ProjectArchitecture | null;
  repoProvider: "gitlab" | "github" | null;
  repoName: string;
}

type Draft = Omit<DeliveryView, "topology">;

const src = (path: string, line?: number): GuideSource => (line ? { path, line } : { path });
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** Tools in the order they best describe a stage. */
const STEP_BRAND: [string, TopologyBrand][] = [
  ["kaniko", "kaniko"],
  ["helm", "helm"],
  ["argocd", "argocd"],
  ["flux", "flux"],
  ["kubectl", "kubernetes"],
  ["terraform", "terraform"],
  ["ansible", "ansible"],
  ["trivy", "trivy"],
  ["snyk", "snyk"],
  ["sonar", "sonarqube"],
  ["maven", "maven"],
  ["gradle", "gradle"],
  ["npm", "npm"],
  ["compose", "docker"],
  ["docker", "docker"],
  ["ssh", "linux"],
  ["flyway", "flyway"],
];

const IMAGE_BRAND: [RegExp, TopologyBrand][] = [
  [/postgres/i, "postgresql"],
  [/redis/i, "redis"],
  [/kafka/i, "kafka"],
  [/nginx/i, "nginx"],
  [/vault/i, "vault"],
  [/prometheus/i, "prometheus"],
  [/grafana/i, "grafana"],
  [/harbor/i, "harbor"],
  [/sonarqube/i, "sonarqube"],
  [/nexus/i, "nexus"],
];

const brandOfImage = (ref: string): TopologyBrand | undefined =>
  IMAGE_BRAND.find(([re]) => re.test(ref))?.[1];

const brandOfLabel = (label: string): TopologyBrand | undefined => {
  if (/postgres/i.test(label)) return "postgresql";
  if (/kafka/i.test(label)) return "kafka";
  if (/redis/i.test(label)) return "redis";
  return undefined;
};

const WORKLOAD_KINDS = new Set([
  "Deployment",
  "StatefulSet",
  "DaemonSet",
  "Job",
  "CronJob",
  "Rollout",
]);
const DEPLOY_TOOLS = [
  "kubectl",
  "helm",
  "argocd",
  "flux",
  "terraform",
  "ansible",
  "compose",
  "ssh",
];

/** `https://host/group/repo.git` -> `group/repo`, for comparing with the repository being scanned. */
const repoPathOf = (url: string) =>
  url
    .replace(/^[a-z+]+:\/\/[^/]+\//i, "")
    .replace(/^git@[^:]+:/, "")
    .replace(/\.git$/, "")
    .replace(/\/+$/, "");

const pluralize = (n: number, one: string, many = `${one}s`) => `${n} ${n > 1 ? many : one}`;

export function buildTopology(
  project: Project,
  delivery: Draft,
  ctx: TopologyContext,
): TopologyView {
  const nodes: TopologyNode[] = [];
  const edges: TopologyEdge[] = [];
  const gaps: string[] = [];
  const has = (id: string) => nodes.some((n) => n.id === id);
  const node = (n: Omit<TopologyNode, "basis"> & { basis?: TopologyBasis }) => {
    if (has(n.id)) return;
    nodes.push({ basis: "found", ...n });
  };
  const link = (
    from: string,
    to: string,
    label: string | undefined,
    basis: TopologyBasis,
    source?: GuideSource,
  ) => {
    if (!has(from) || !has(to)) return;
    const id = `${from}->${to}`;
    if (edges.some((e) => e.id === id)) return;
    edges.push({ id, from, to, ...(label ? { label } : {}), basis, ...(source ? { source } : {}) });
  };

  const allJobs = delivery.stages.flatMap((s) => s.jobs);
  const stageOfJob = new Map<string, string>();

  /* ---------------------------- code and pipeline ---------------------------- */

  const provider = delivery.provider;
  node({
    id: "repo",
    lane: "source",
    label: "Dépôt Git",
    role: "repository",
    brand: ctx.repoProvider ?? (provider === "github" ? "github" : "git"),
    detail: "Un commit lance la chaîne",
    source: src(delivery.path),
  });
  node({
    id: "ci",
    lane: "pipeline",
    label:
      provider === "gitlab" ? "GitLab CI" : provider === "github" ? "GitHub Actions" : "Jenkins",
    role: "pipeline",
    brand: provider === "gitlab" ? "gitlab" : provider === "github" ? "githubactions" : "jenkins",
    detail: `${pluralize(delivery.counts.jobs, "job")} · ${pluralize(delivery.stages.length, "étape")}`,
    source: src(delivery.path),
  });
  link("repo", "ci", "push", "found", src(delivery.path));

  const STAGE_CAP = 8;
  let previous = "ci";
  delivery.stages.slice(0, STAGE_CAP).forEach((stage, i) => {
    const id = `stage-${i + 1}`;
    const tools = [...new Set(stage.jobs.flatMap((j) => j.tools))];
    const brand = STEP_BRAND.find(([tool]) => tools.includes(tool))?.[1];
    const roles = [...new Set(stage.jobs.map((j) => PIPELINE_JOB_ROLE_LABEL[j.role]))];
    const alerts = stage.jobs.reduce((n, j) => n + j.flags.length + (j.blocking ? 0 : 1), 0);
    for (const job of stage.jobs) stageOfJob.set(job.name, id);
    node({
      id,
      lane: "pipeline",
      label: stage.name,
      role: "step",
      ...(brand ? { brand } : {}),
      detail: roles.join(" · "),
      chips: stage.jobs.slice(0, 3).map((j) => j.name),
      jobs: stage.jobs.map((j) => j.name),
      ...(alerts > 0 ? { alerts } : {}),
      source: src(delivery.path, stage.jobs[0]?.line),
    });
    link(previous, id, undefined, "found");
    previous = id;
  });
  if (delivery.stages.length > STAGE_CAP) {
    gaps.push(`Seules les ${STAGE_CAP} premières étapes du pipeline sont dessinées.`);
  }
  const stageOf = (job: PipelineJobView) => stageOfJob.get(job.name);
  const lastStage = previous;

  /* --------------------------- repositories and services --------------------------- */

  const quality = allJobs.find((j) => j.role === "quality" || j.tools.includes("sonar"));
  if (quality) {
    node({
      id: "svc-quality",
      lane: "services",
      label: "SonarQube",
      role: "quality",
      brand: "sonarqube",
      detail: quality.blocking
        ? "Analyse de qualité, bloquante"
        : "Analyse de qualité, non bloquante",
      source: src(delivery.path, quality.line),
      jobs: [quality.name],
      ...(quality.blocking ? {} : { alerts: 1 }),
    });
    const from = stageOf(quality);
    if (from)
      link(from, "svc-quality", "envoie l'analyse", "found", src(delivery.path, quality.line));
  }

  const pushes = allJobs.flatMap((j) => j.pushes.map((p) => ({ job: j, push: p })));
  if (pushes.length > 0) {
    const registry = pushes.find((p) => p.push.registry)?.push.registry;
    const brand: TopologyBrand = /harbor/i.test(registry ?? "")
      ? "harbor"
      : /artifactory|jfrog/i.test(registry ?? "")
        ? "jfrog"
        : /^\$CI_REGISTRY|gitlab/i.test(registry ?? "")
          ? "gitlab"
          : "docker";
    node({
      id: "svc-registry",
      lane: "services",
      label: "Registre d'images",
      role: "registry",
      brand,
      detail: pluralize(delivery.images.length || pushes.length, "image"),
      chips: registry ? [registry] : [],
      source: src(delivery.path, pushes[0]?.job.line),
    });
    for (const { job } of pushes) {
      const from = stageOf(job);
      if (from) link(from, "svc-registry", "publie l'image", "found", src(delivery.path, job.line));
    }
  }

  const publisher = allJobs.find((j) => j.role === "publish" && !j.pushes.length);
  if (publisher) {
    const hint = `${publisher.name} ${publisher.stage} ${publisher.variables.join(" ")}`;
    const nexus = /nexus/i.test(hint);
    const jfrog = /artifactory|jfrog/i.test(hint);
    node({
      id: "svc-artifacts",
      lane: "services",
      label: nexus ? "Nexus" : jfrog ? "Artifactory" : "Dépôt d'artefacts",
      role: "artifacts",
      ...(nexus ? { brand: "nexus" as const } : jfrog ? { brand: "jfrog" as const } : {}),
      detail: "Jars et paquets publiés",
      source: src(delivery.path, publisher.line),
      jobs: [publisher.name],
      ...(publisher.flags.length > 0 ? { alerts: publisher.flags.length } : {}),
    });
    const from = stageOf(publisher);
    if (from) {
      link(
        from,
        "svc-artifacts",
        "publie les artefacts",
        "found",
        src(delivery.path, publisher.line),
      );
    }
  }

  /* ------------------------------- deployment ------------------------------- */

  interface Located<T> {
    path: string;
    value: T;
  }
  const objects: Located<DeployObject>[] = [];
  const charts: Located<NonNullable<DeployFacts["chart"]>>[] = [];
  let kustomizeFiles = 0;
  const composeServices: {
    path: string;
    name: string;
    image?: string;
    ports: string[];
    line: number;
  }[] = [];
  const terraform = { files: 0, providers: new Set<string>(), first: "" };
  let ansibleFiles = 0;
  let ansibleFirst = "";
  for (const f of project.files) {
    if (/(^|\/)(?:ansible\.cfg|playbooks?\/[^/]+\.ya?ml|site\.ya?ml)$/i.test(f.path)) {
      ansibleFiles += 1;
      ansibleFirst ||= f.path;
    }
    const d = f.facts?.deploy;
    if (!d) continue;
    for (const o of d.objects) objects.push({ path: f.path, value: o });
    if (d.chart) charts.push({ path: f.path, value: d.chart });
    if (d.kustomize) kustomizeFiles += 1;
    for (const s of d.compose ?? []) composeServices.push({ path: f.path, ...s, ports: s.ports });
    if (d.terraform) {
      terraform.files += 1;
      terraform.first ||= f.path;
      for (const p of d.terraform.providers) terraform.providers.add(p);
    }
  }

  const argoApps = objects.filter(
    (o) => o.value.apiVersion.includes("argoproj.io") && /^Application(Set)?$/.test(o.value.kind),
  );
  const fluxObjects = objects.filter((o) => o.value.apiVersion.includes("fluxcd.io"));
  const k8s = objects.filter(
    (o) => !o.value.apiVersion.includes("argoproj.io") && !o.value.apiVersion.includes("fluxcd.io"),
  );
  const k8sWorkloads = k8s.filter((o) => WORKLOAD_KINDS.has(o.value.kind));
  const ciDeployJobs = allJobs.filter(
    (j) => j.role === "deploy" || j.tools.some((t) => DEPLOY_TOOLS.includes(t)),
  );
  const ciTools = new Set(allJobs.flatMap((j) => j.tools));
  const deployStage = (tool: string) => {
    const job = allJobs.find((j) => j.tools.includes(tool)) ?? ciDeployJobs[0];
    return job ? stageOf(job) : undefined;
  };
  const feeder = has("svc-registry") ? "svc-registry" : lastStage;
  const clusterNamespaces = new Set<string>();
  for (const o of [...argoApps, ...k8s]) {
    const ns = o.value.sync?.destNamespace ?? o.value.namespace;
    if (ns && !ns.includes("{{")) clusterNamespaces.add(ns);
  }
  const deliverNodes: string[] = [];

  // Argo CD: watches a Git repository and synchronises it to a cluster.
  if (argoApps.length > 0 || ciTools.has("argocd")) {
    const first = argoApps[0];
    const automated = argoApps.filter((a) => a.value.sync?.automated).length;
    node({
      id: "argocd",
      lane: "deliver",
      label: "Argo CD",
      role: "gitops",
      brand: "argocd",
      detail:
        argoApps.length > 0
          ? `${pluralize(argoApps.length, "application")}${automated ? `, ${automated} en synchronisation automatique` : ""}`
          : "Appelé par la chaîne",
      chips: argoApps.map((a) => a.value.name ?? a.value.kind).slice(0, 4),
      ...(first ? { source: src(first.path, first.value.line) } : {}),
    });
    deliverNodes.push("argocd");
    const repos = [
      ...new Set(argoApps.map((a) => a.value.sync?.repoUrl).filter(Boolean)),
    ] as string[];
    for (const repoUrl of repos.slice(0, 3)) {
      const same = ctx.repoName !== "" && repoPathOf(repoUrl).endsWith(ctx.repoName);
      if (same) {
        link(
          "repo",
          "argocd",
          "surveillé par Argo CD",
          "found",
          first && src(first.path, first.value.line),
        );
      } else {
        const id = `gitops-${slug(repoPathOf(repoUrl))}`;
        node({
          id,
          lane: "source",
          label: "Dépôt GitOps",
          role: "repository",
          brand: "git",
          detail: repoPathOf(repoUrl),
          ...(first ? { source: src(first.path, first.value.line) } : {}),
        });
        link(id, "argocd", "surveille", "found");
      }
    }
    if (ciTools.has("argocd")) {
      const from = deployStage("argocd");
      if (from) link(from, "argocd", "déclenche la synchronisation", "found");
    }
  }

  // Flux does the same with a different vocabulary.
  if (fluxObjects.length > 0 || ciTools.has("flux")) {
    const first = fluxObjects[0];
    node({
      id: "flux",
      lane: "deliver",
      label: "Flux",
      role: "gitops",
      brand: "flux",
      detail: first ? pluralize(fluxObjects.length, "objet") : "Appelé par la chaîne",
      ...(first ? { source: src(first.path, first.value.line) } : {}),
    });
    deliverNodes.push("flux");
    link("repo", "flux", "surveillé par Flux", "found");
  }

  if (charts.length > 0 || ciTools.has("helm")) {
    const chart = charts[0];
    node({
      id: "helm",
      lane: "deliver",
      label: "Helm",
      role: "deploy",
      brand: "helm",
      detail: chart
        ? `Chart ${chart.value.name}${chart.value.version ? ` ${chart.value.version}` : ""}`
        : "Appelé par la chaîne",
      chips: chart?.value.dependencies.slice(0, 3) ?? [],
      ...(chart ? { source: src(chart.path) } : {}),
    });
    deliverNodes.push("helm");
    const from = deployStage("helm");
    if (from) link(from, "helm", "installe la release", "found");
    else if (!has("argocd")) link(feeder, "helm", "chart à installer", "inferred");
  }

  if (kustomizeFiles > 0) {
    node({
      id: "kustomize",
      lane: "deliver",
      label: "Kustomize",
      role: "deploy",
      detail: `${pluralize(kustomizeFiles, "recouvrement", "recouvrements")}`,
    });
    deliverNodes.push("kustomize");
  }

  if (terraform.files > 0 || ciTools.has("terraform")) {
    node({
      id: "terraform",
      lane: "deliver",
      label: "Terraform",
      role: "infrastructure",
      brand: "terraform",
      detail: terraform.files ? pluralize(terraform.files, "fichier") : "Appelé par la chaîne",
      chips: [...terraform.providers].slice(0, 3),
      ...(terraform.first ? { source: src(terraform.first) } : {}),
    });
    deliverNodes.push("terraform");
    const from = deployStage("terraform");
    if (from) link(from, "terraform", "applique l'infrastructure", "found");
  }

  if (ansibleFiles > 0 || ciTools.has("ansible")) {
    node({
      id: "ansible",
      lane: "deliver",
      label: "Ansible",
      role: "deploy",
      brand: "ansible",
      detail: ansibleFiles ? pluralize(ansibleFiles, "fichier") : "Appelé par la chaîne",
      ...(ansibleFirst ? { source: src(ansibleFirst) } : {}),
    });
    deliverNodes.push("ansible");
    const from = deployStage("ansible");
    if (from) link(from, "ansible", "exécute le playbook", "found");
  }

  const ciOnly = ciDeployJobs.filter(
    (j) =>
      j.tools.some((t) => ["kubectl", "compose", "ssh"].includes(t)) ||
      (j.role === "deploy" &&
        !j.tools.some((t) => ["helm", "argocd", "flux", "terraform", "ansible"].includes(t))),
  );
  if (ciOnly.length > 0) {
    const kubectl = ciOnly.some((j) => j.tools.includes("kubectl"));
    const ssh = ciOnly.some((j) => j.tools.includes("ssh"));
    node({
      id: "ci-deploy",
      lane: "deliver",
      label: "Déploiement par la chaîne",
      role: "deploy",
      brand: kubectl ? "kubernetes" : ssh ? "linux" : "docker",
      detail: kubectl ? "kubectl" : ssh ? "Accès distant (ssh, scp)" : "Job de déploiement",
      chips: ciOnly.slice(0, 3).map((j) => j.name),
      jobs: ciOnly.map((j) => j.name),
      source: src(delivery.path, ciOnly[0]?.line),
    });
    deliverNodes.push("ci-deploy");
    for (const job of ciOnly) {
      const from = stageOf(job);
      if (from) link(from, "ci-deploy", "exécute", "found", src(delivery.path, job.line));
    }
  }

  // Manifests with nothing in the repository that applies them: say so instead of inventing a tool.
  if (k8s.length > 0 && deliverNodes.length === 0) {
    const first = k8s[0];
    node({
      id: "manifests",
      lane: "deliver",
      label: "Manifestes Kubernetes",
      role: "deploy",
      brand: "kubernetes",
      detail: `${pluralize(k8s.length, "objet")} · qui les applique n'est pas décrit`,
      ...(first ? { source: src(first.path, first.value.line) } : {}),
    });
    deliverNodes.push("manifests");
  }

  const deployMissing = deliverNodes.length === 0 && composeServices.length === 0;
  if (deployMissing) {
    node({
      id: "deploy-missing",
      lane: "deliver",
      label: "Déploiement",
      role: "deploy",
      basis: "missing",
      detail: "Non décrit dans ce dépôt",
      chips: ["Argo CD ?", "Helm ?", "kubectl ?"],
    });
    deliverNodes.push("deploy-missing");
    link(feeder, "deploy-missing", "mise en ligne ?", "missing");
    gaps.push(
      "Aucun outil de déploiement (Argo CD, Flux, Helm, kubectl, Terraform, Ansible, compose) n'est décrit dans ce dépôt : la mise en ligne se fait ailleurs.",
    );
  } else if (has("svc-registry")) {
    for (const id of ["helm", "kustomize", "ci-deploy", "manifests"]) {
      if (has(id) && !edges.some((e) => e.to === id)) {
        link("svc-registry", id, "images à déployer", "inferred");
      }
    }
  }

  /* --------------------------------- run --------------------------------- */

  const k8sImages = new Set(k8s.flatMap((o) => o.value.images.map((i) => imageRepository(i))));
  const matchesK8s = (image: PipelineImageView) => {
    const tail = image.repository.slice(image.repository.lastIndexOf("/") + 1);
    return [...k8sImages].some((i) => i === image.repository || i.endsWith(`/${tail}`));
  };

  if (k8s.length > 0 || argoApps.length > 0) {
    const kinds = new Map<string, number>();
    for (const o of k8s) kinds.set(o.value.kind, (kinds.get(o.value.kind) ?? 0) + 1);
    const first = k8s[0] ?? argoApps[0];
    node({
      id: "cluster",
      lane: "run",
      label: "Cluster Kubernetes",
      role: "cluster",
      brand: "kubernetes",
      detail:
        k8s.length > 0
          ? [...kinds.entries()]
              .slice(0, 4)
              .map(([k, n]) => `${k}${n > 1 ? ` ×${n}` : ""}`)
              .join(" · ")
          : "Destination des applications Argo CD",
      chips: [...clusterNamespaces].slice(0, 4),
      ...(first ? { source: src(first.path, first.value.line) } : {}),
    });
    for (const id of ["argocd", "flux", "helm", "kustomize", "ci-deploy", "manifests"]) {
      if (has(id)) {
        link(id, "cluster", id === "argocd" || id === "flux" ? "synchronise" : "applique", "found");
      }
    }
  }

  if (delivery.environments.length > 0) {
    const first = delivery.environments[0];
    node({
      id: "envs",
      lane: "run",
      label: "Environnements",
      role: "environment",
      detail: `${pluralize(delivery.environments.length, "dossier")} de configuration`,
      chips: delivery.environments.map((e) => e.name).slice(0, 6),
      ...(first?.example ? { source: src(first.example) } : {}),
    });
    const feederDeploy = deliverNodes[0];
    if (feederDeploy) {
      link(
        feederDeploy,
        "envs",
        feederDeploy === "deploy-missing" ? "configurations ?" : "configure",
        feederDeploy === "deploy-missing" ? "missing" : "inferred",
      );
    }
  }

  // Docker Compose services: what runs next to the application on a machine.
  if (composeServices.length > 0) {
    const first = composeServices[0];
    node({
      id: "compose",
      lane: "deliver",
      label: "Docker Compose",
      role: "deploy",
      brand: "docker",
      detail: pluralize(composeServices.length, "service"),
      chips: composeServices.slice(0, 4).map((s) => s.name),
      ...(first ? { source: src(first.path, first.line) } : {}),
    });
    link(has("svc-registry") ? "svc-registry" : lastStage, "compose", "images tirées", "inferred");
    for (const s of composeServices.filter((c) => c.image).slice(0, 6)) {
      const brand = brandOfImage(s.image as string);
      node({
        id: `svc-${slug(s.name)}`,
        lane: brand === "postgresql" || brand === "redis" ? "data" : "run",
        label: s.name,
        role: brand === "postgresql" || brand === "redis" ? "datastore" : "workload",
        ...(brand ? { brand } : {}),
        detail: [imageRepository(s.image as string), ...s.ports.slice(0, 2)].join(" · "),
        source: src(s.path, s.line),
      });
      link("compose", `svc-${slug(s.name)}`, "lance", "found", src(s.path, s.line));
    }
  }

  // Workloads: the images the pipeline builds, and what each one depends on at run time.
  const arch = ctx.architecture;
  const archById = new Map((arch?.nodes ?? []).map((n) => [n.id, n] as const));
  const WORKLOAD_CAP = 4;
  delivery.images.slice(0, WORKLOAD_CAP).forEach((image) => {
    const id = `wl-${slug(image.repository)}`;
    node({
      id,
      lane: "run",
      label: image.repository,
      role: "workload",
      brand: "docker",
      detail: [image.exposes.length ? `:${image.exposes.join(", :")}` : "", image.jar ?? ""]
        .filter(Boolean)
        .join(" · "),
      ...(image.nodeId && archById.has(image.nodeId) ? { archNodeId: image.nodeId } : {}),
      ...(image.source ? { source: image.source } : {}),
    });
    const onCluster = has("cluster") && matchesK8s(image);
    if (onCluster) link("cluster", id, "exécute", "found");
    else if (deployMissing) link("deploy-missing", id, "démarre ?", "missing");
    else if (has("compose")) link("compose", id, "lance", "inferred");
    else if (has("svc-registry") && deliverNodes.length === 0) {
      link("svc-registry", id, "image à exécuter", "inferred");
    } else {
      const via = deliverNodes.find((d) => d !== "terraform" && d !== "ansible") ?? deliverNodes[0];
      if (via) link(via, id, "démarre", "inferred");
    }

    if (arch && image.nodeId) addRuntimeDependencies(arch, image.nodeId, id);
  });
  if (delivery.images.length > WORKLOAD_CAP) {
    gaps.push(`Seules ${WORKLOAD_CAP} images sur ${delivery.images.length} sont dessinées.`);
  }

  for (const o of k8sWorkloads.slice(0, WORKLOAD_CAP)) {
    const repos = o.value.images.map((i) => imageRepository(i));
    const known = delivery.images.some((im) =>
      repos.some(
        (r) =>
          r === im.repository ||
          r.endsWith(`/${im.repository.slice(im.repository.lastIndexOf("/") + 1)}`),
      ),
    );
    if (known) continue;
    const id = `k8s-${slug(`${o.value.kind}-${o.value.name ?? o.path}`)}`;
    node({
      id,
      lane: "run",
      label: o.value.name ?? o.value.kind,
      role: "workload",
      brand: brandOfImage(o.value.images[0] ?? "") ?? "kubernetes",
      detail: `${o.value.kind}${o.value.images[0] ? ` · ${imageRepository(o.value.images[0])}` : ""}`,
      source: src(o.path, o.value.line),
    });
    link("cluster", id, "exécute", "found", src(o.path, o.value.line));
  }

  function addRuntimeDependencies(a: ProjectArchitecture, imageId: string, workloadId: string) {
    const children = new Map<string, ArchNode[]>();
    for (const n of a.nodes) {
      if (!n.parentId) continue;
      children.set(n.parentId, [...(children.get(n.parentId) ?? []), n]);
    }
    const inside = new Set<string>();
    const queue = a.edges
      .filter((e) => e.source === imageId && e.kind === "deploy")
      .map((e) => e.target);
    while (queue.length > 0) {
      const id = queue.shift() as string;
      if (inside.has(id)) continue;
      inside.add(id);
      for (const child of children.get(id) ?? []) queue.push(child.id);
    }
    if (inside.size === 0) return;
    let added = 0;
    for (const edge of a.edges) {
      if (added >= 6) break;
      if (!inside.has(edge.source) || inside.has(edge.target)) continue;
      const target = archById.get(edge.target);
      if (!target || !["datastore", "queue", "external"].includes(target.kind)) continue;
      const depId = `dep-${slug(target.id)}`;
      const role: TopologyRole =
        target.kind === "datastore" ? "datastore" : target.kind === "queue" ? "queue" : "external";
      const brand = brandOfLabel(`${target.label} ${target.tech.join(" ")}`);
      if (!has(depId)) added += 1;
      node({
        id: depId,
        lane: "data",
        label: target.label,
        role,
        ...(brand ? { brand } : {}),
        ...(target.tech.length > 0 ? { detail: target.tech.slice(0, 2).join(" · ") } : {}),
        basis: target.provenance === "inferred" ? "inferred" : "found",
        archNodeId: target.id,
        ...(target.sources[0]
          ? { source: src(target.sources[0].path, target.sources[0].line) }
          : {}),
      });
      link(workloadId, depId, edge.label, edge.provenance === "inferred" ? "inferred" : "found");
    }
  }

  if (delivery.includes.length > 0) {
    gaps.push(
      "Le pipeline inclut d'autres fichiers qui n'ont pas été lus : des étapes peuvent manquer sur ce schéma.",
    );
  }
  if (!has("cluster") && !deployMissing && argoApps.length === 0 && composeServices.length === 0) {
    gaps.push(
      "Aucune destination d'exécution (cluster, machine) n'est décrite : le schéma s'arrête au déploiement.",
    );
  }

  const lanes: TopologyLane[] = ["source", "pipeline", "services", "deliver", "run", "data"];
  nodes.sort((a, b) => lanes.indexOf(a.lane) - lanes.indexOf(b.lane));
  return { nodes, edges, gaps };
}
