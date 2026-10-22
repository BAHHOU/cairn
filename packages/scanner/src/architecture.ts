import type {
  ArchEdge,
  ArchLayer,
  ArchNode,
  ArchProvenance,
  ArchSource,
  ArchViolation,
  CiFacts,
  ConfigEntry,
  JavaRole,
  ProjectArchitecture,
  ScanFileRecord,
} from "@cairn/shared";
import { imageRepository } from "./facts/ci";
import type { JavaType, Project, Unit } from "./project";

export interface ArchitectureInput {
  project: Project;
  repositoryId: string;
  repoName: string;
  provider: string;
  commit: string;
  generatedAt: string;
}

const EXTERNAL = "externe";
const MAX_QUEUES = 30;
const MAX_EXTERNALS = 12;

const slug = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "x";

/** Stable ids shared with the code map so a symbol can point at the architecture box it lives in. */
export const containerNodeId = (unit: Unit): string =>
  `ctr-${slug(unit.key === "." ? unit.name : unit.key)}`;
export const componentNodeId = (unit: Unit, role: JavaRole): string =>
  `cmp-${slug(unit.key === "." ? unit.name : unit.key)}-${role}`;
/** Id of the node drawn for a container image, shared with the delivery view. */
export const imageNodeId = (image: string): string => `img-${slug(imageRepository(image))}`;

const providerLabel = (provider: string) =>
  provider === "github" ? "GitHub" : provider === "gitlab" ? "GitLab" : provider;

/* ------------------------------------------------------------------ *
 * What each Spring role stands for in the diagram.
 * ------------------------------------------------------------------ */

const ROLE_ORDER: JavaRole[] = [
  "controller",
  "listener",
  "scheduler",
  "repository",
  "service",
  "entity",
  "configuration",
];

const ROLE_LABEL: Record<JavaRole, string> = {
  application: "Point d'entrée",
  controller: "Contrôleurs REST",
  listener: "Listeners de messages",
  scheduler: "Planificateurs",
  repository: "Repositories",
  service: "Services",
  entity: "Entités JPA",
  configuration: "Configuration",
};

const ROLE_LAYER: Record<JavaRole, ArchLayer> = {
  application: "application",
  controller: "experience",
  listener: "application",
  scheduler: "application",
  repository: "infrastructure",
  service: "domaine",
  entity: "domaine",
  configuration: "infrastructure",
};

const primaryRole = (roles: JavaRole[]): JavaRole | undefined =>
  ROLE_ORDER.find((r) => roles.includes(r));

/* ------------------------------------------------------------------ *
 * Technologies recognised from Maven dependencies.
 * ------------------------------------------------------------------ */

const STORES = [
  { id: "postgres", test: /^org\.postgresql:postgresql$/, label: "PostgreSQL", sql: true },
  { id: "oracle", test: /^com\.oracle[\w.]*:ojdbc/, label: "Oracle", sql: true },
  { id: "mysql", test: /^(mysql|com\.mysql):mysql-connector/, label: "MySQL", sql: true },
  { id: "mariadb", test: /^org\.mariadb[\w.]*:mariadb-java-client$/, label: "MariaDB", sql: true },
  { id: "mssql", test: /^com\.microsoft\.sqlserver:mssql-jdbc$/, label: "SQL Server", sql: true },
  {
    id: "mongodb",
    test: /:spring-boot-starter-data-mongodb$|^org\.mongodb:/,
    label: "MongoDB",
    sql: false,
  },
  {
    id: "redis",
    test: /:spring-boot-starter-data-redis$|^redis\.clients:jedis$|^io\.lettuce:/,
    label: "Redis",
    sql: false,
  },
] as const;

const BROKERS = [
  { id: "ibmmq", test: /^com\.ibm\.mq:|:mq-jms-spring-boot-starter$/, label: "IBM MQ" },
  {
    id: "activemq",
    test: /:spring-boot-starter-(activemq|artemis)$|^org\.apache\.activemq:/,
    label: "ActiveMQ",
  },
  { id: "rabbit", test: /:spring-boot-starter-amqp$|^com\.rabbitmq:/, label: "RabbitMQ" },
] as const;

const KAFKA = /^org\.apache\.kafka:kafka-clients$|:spring-kafka$/;
const MAIL = /:spring-boot-starter-mail$|^(jakarta|javax)\.mail:/;
const OAUTH = /oauth2|spring-security-oauth|nimbus-jose/;
const JPA = /:spring-boot-starter-data-jpa$|:spring-boot-starter-jdbc$|^org\.hibernate/;

/* ------------------------------------------------------------------ *
 * Helpers over configuration files.
 * ------------------------------------------------------------------ */

const ENV_ORDER = ["dev", "local", "int", "preprod", "prod", "mock"];
const ENV_TOKENS = new Set([...ENV_ORDER, "test", "uat", "qa", "staging"]);
const GENERIC_TOKENS = new Set([
  "build",
  "config",
  "application",
  "main",
  "src",
  "resources",
  "dev",
  "int",
  "prod",
  "preprod",
  "mock",
  "yml",
  "yaml",
  "properties",
  "local",
]);

const tokens = (value: string): string[] =>
  value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3);

const tokensMatch = (a: string, b: string) => a === b || a.startsWith(b) || b.startsWith(a);

interface ConfigFile {
  record: ScanFileRecord;
  entries: ConfigEntry[];
}

/**
 * The same service is usually configured once per environment. Reading all of them would show
 * four copies of every queue, so the architecture is drawn from the first environment found, in
 * the order dev, local, int, preprod, prod, mock. The choice is written in the node it produces.
 */
function referenceConfigs(files: ScanFileRecord[]): { files: ConfigFile[]; env?: string } {
  const all: ConfigFile[] = files
    .filter((f) => f.kind !== "test" && f.facts?.config?.length)
    .map((f) => ({ record: f, entries: f.facts?.config ?? [] }));
  const envOf = (path: string) => tokens(path).find((t) => ENV_TOKENS.has(t));
  const present = new Set(all.map((c) => envOf(c.record.path)).filter((e): e is string => !!e));
  const chosen = ENV_ORDER.find((e) => present.has(e));
  if (!chosen) return { files: all };
  return {
    files: all.filter((c) => {
      const env = envOf(c.record.path);
      return !env || env === chosen;
    }),
    env: chosen,
  };
}

const keyRoot = (key: string) =>
  key
    .replace(/\[\]$/, "")
    .replace(/\.(hosts?|urls?|uris?|endpoints?|address(es)?)$/i, "")
    .replace(/[-_.](hosts?|urls?|uris?|endpoints?)$/i, "");

const isLocalHost = (host: string) =>
  /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1])(:\d+)?$/.test(host) || host.includes("${");

const hostOf = (value: string): string | undefined => {
  const m = /:\/\/([^/\s]+)/.exec(value);
  return m ? m[1] : /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(:\d+)?$/i.test(value) ? value : undefined;
};

/* ------------------------------------------------------------------ *
 * The builder.
 * ------------------------------------------------------------------ */

interface ComponentRef {
  id: string;
  role: JavaRole;
  unit: string;
}

export function buildArchitecture(input: ArchitectureInput): ProjectArchitecture {
  const { project, repositoryId, repoName, provider, commit } = input;
  const repo = repositoryId;
  const nodes: ArchNode[] = [];
  const edges: ArchEdge[] = [];
  const nodeIds = new Set<string>();

  const src = (path: string, line?: number, note?: string, repoId: string = repo): ArchSource => ({
    repoId,
    path,
    ...(line ? { line } : {}),
    ...(note ? { note } : {}),
  });

  const addNode = (n: Omit<ArchNode, "repoId" | "sources" | "tech"> & Partial<ArchNode>) => {
    if (nodeIds.has(n.id)) return;
    nodeIds.add(n.id);
    nodes.push({ repoId: repo, tech: [], sources: [], ...n });
  };

  const addEdge = (
    e: Omit<ArchEdge, "crossRepo" | "provenance" | "sources" | "id"> & {
      provenance?: ArchProvenance;
      sources?: ArchSource[];
    },
  ) => {
    if (!nodeIds.has(e.source) || !nodeIds.has(e.target) || e.source === e.target) return;
    const id = `e-${e.source}>${e.target}:${e.kind}`;
    if (edges.some((x) => x.id === id)) return;
    const target = nodes.find((n) => n.id === e.target);
    const origin = nodes.find((n) => n.id === e.source);
    edges.push({
      ...e,
      id,
      crossRepo: (target?.repoId ?? repo) !== (origin?.repoId ?? repo),
      provenance: e.provenance ?? "extracted",
      sources: e.sources ?? [],
    });
  };

  const sysId = "sys";
  const types = project.javaTypes();

  /* ---- units that become containers ---- */
  const javaFilesByUnit = new Map<string, ScanFileRecord[]>();
  const tsFilesByUnit = new Map<string, ScanFileRecord[]>();
  for (const f of project.files) {
    if (f.kind === "test") continue;
    const unit = project.unitOf(f.path);
    if (f.facts?.java) {
      const list = javaFilesByUnit.get(unit.key) ?? [];
      list.push(f);
      javaFilesByUnit.set(unit.key, list);
    }
    if (f.facts?.ts) {
      const list = tsFilesByUnit.get(unit.key) ?? [];
      list.push(f);
      tsFilesByUnit.set(unit.key, list);
    }
  }

  const prodTypes = types.filter((t) => !isTestPath(t.path, project));
  const typesByUnit = new Map<string, JavaType[]>();
  for (const t of prodTypes) {
    const list = typesByUnit.get(t.unit) ?? [];
    list.push(t);
    typesByUnit.set(t.unit, list);
  }

  const unitsByKey = new Map<string, Unit>(project.allUnits().map((u) => [u.key, u] as const));
  const services: Unit[] = [];
  const uis: Unit[] = [];
  const libs: Unit[] = [];
  for (const [key, list] of typesByUnit) {
    const unit = unitsByKey.get(key);
    if (!unit) continue;
    if (list.some((t) => t.roles.includes("application"))) services.push(unit);
    else libs.push(unit);
  }
  for (const unit of project.allUnits()) {
    if (unit.angular && !services.some((s) => s.key === unit.key)) uis.push(unit);
  }
  const containers = [...services, ...uis, ...libs].sort((a, b) => a.key.localeCompare(b.key));
  const containerId = containerNodeId;

  /* ---- dependencies per unit (own + internal closure) ---- */
  const depsOf = (unit: Unit): Set<string> => {
    const keys = [unit.key, ...project.internalClosure(unit.key)];
    const ids = new Set<string>();
    for (const k of keys) {
      const m = project.maven.find((x) => x.dir === k && !x.aggregator);
      for (const d of m?.pom.dependencies ?? []) if (d.scope !== "test") ids.add(d.id);
    }
    return ids;
  };
  const unitDeps = new Map(containers.map((u) => [u.key, depsOf(u)] as const));
  const hasDep = (unit: Unit, test: RegExp) =>
    [...(unitDeps.get(unit.key) ?? [])].some((d) => test.test(d));

  /* ---- system ---- */
  const sysTech = new Set<string>();
  const javaVersion = project.maven.map((m) => m.pom.javaVersion).find(Boolean);
  const bootVersion = project.maven.map((m) => m.pom.springBootVersion).find(Boolean);
  if (prodTypes.length > 0) sysTech.add(javaVersion ? `Java ${javaVersion}` : "Java");
  if (bootVersion) sysTech.add(`Spring Boot ${bootVersion}`);
  else if ([...unitDeps.values()].some((s) => [...s].some((d) => /spring-boot-starter/.test(d)))) {
    sysTech.add("Spring Boot");
  }
  for (const ui of uis)
    if (ui.angular) sysTech.add(`Angular ${ui.angular.version.replace(/^[^\d]*/, "")}`);

  /* ---- containers ---- */
  const ownedTypes = (unit: Unit) => typesByUnit.get(unit.key) ?? [];
  const countRole = (list: JavaType[], role: JavaRole) =>
    list.filter((t) => primaryRole(t.roles) === role).length;

  for (const unit of containers) {
    const list = ownedTypes(unit);
    const isService = services.some((s) => s.key === unit.key);
    const isUi = uis.some((s) => s.key === unit.key);
    const id = containerId(unit);
    const pom = unit.maven?.pomPath;
    const entry = list.find((t) => t.roles.includes("application"));

    if (isUi && unit.angular) {
      const files = tsFilesByUnit.get(unit.key) ?? [];
      const angular = files.flatMap((f) => f.facts?.ts?.angular ?? []);
      const count = (kind: string) => angular.filter((a) => a.kind === kind).length;
      addNode({
        id,
        label: unit.angular.name,
        kind: "service",
        layer: "experience",
        parentId: sysId,
        description: `Application Angular : ${count("component")} composants, ${count("service")} services, ${count("module")} modules.`,
        tech: [`Angular ${unit.angular.version.replace(/^[^\d]*/, "")}`, "TypeScript"],
        provenance: "extracted",
        sources: [src(unit.angular.packagePath, undefined, "dépendance @angular/core")],
      });
      continue;
    }

    const parts: string[] = [];
    const controllers = countRole(list, "controller");
    const endpoints = (javaFilesByUnit.get(unit.key) ?? []).reduce(
      (n, f) => n + (f.facts?.java?.endpoints ?? 0),
      0,
    );
    if (controllers) parts.push(`${controllers} contrôleurs REST (${endpoints} points d'entrée)`);
    for (const role of ["service", "repository", "entity", "scheduler", "listener"] as const) {
      const n = countRole(list, role);
      if (n) parts.push(`${n} ${ROLE_LABEL[role].toLowerCase()}`);
    }

    const tech: string[] = [];
    const m = unit.maven?.pom;
    if (m?.javaVersion) tech.push(`Java ${m.javaVersion}`);
    if (hasDep(unit, JPA)) tech.push("JPA / Hibernate");
    for (const b of BROKERS) if (hasDep(unit, b.test)) tech.push(b.label);
    if (hasDep(unit, KAFKA)) tech.push("Kafka");
    if (unit.angular) tech.push("Angular");

    addNode({
      id,
      label: unit.name,
      kind: isService ? "service" : "component",
      layer: isService ? "application" : "domaine",
      parentId: sysId,
      description: `${isService ? "Application Spring Boot" : "Bibliothèque partagée"} : ${
        parts.length ? parts.join(", ") : `${list.length} types Java`
      }.`,
      tech,
      provenance: "extracted",
      sources: [
        ...(entry ? [src(entry.path, entry.line, "classe @SpringBootApplication")] : []),
        ...(pom ? [src(pom, undefined, "descripteur Maven")] : []),
      ],
    });
  }

  addNode({
    id: sysId,
    label: repoName.split("/").slice(-2).join("/"),
    kind: "system",
    layer: "application",
    description: `Système importé depuis ${providerLabel(provider)} : ${containers.length} unités de code (${services.length} applications, ${libs.length} bibliothèques, ${uis.length} interfaces).`,
    tech: [...sysTech],
    provenance: "inferred",
    sources: [
      src(
        project.maven.find((m) => m.dir === ".")?.pomPath ?? "pom.xml",
        undefined,
        "périmètre = le dépôt",
      ),
    ],
  });

  /* ---- Maven dependencies between units ---- */
  for (const unit of containers) {
    const m = unit.maven;
    if (!m) continue;
    for (const dep of m.pom.dependencies) {
      if (dep.scope === "test") continue;
      const target = project.unitOfArtifact(dep.id.slice(dep.id.indexOf(":") + 1));
      const targetContainer = target && containers.find((c) => c.key === target.key);
      if (!targetContainer || targetContainer.key === unit.key) continue;
      addEdge({
        source: containerId(unit),
        target: containerId(targetContainer),
        kind: "build",
        label: "dépend de (Maven)",
        sources: [src(m.pomPath, undefined, dep.id)],
      });
    }
  }

  /* ---- components inside each Spring container ---- */
  const componentByFqn = new Map<string, ComponentRef>();
  const componentSources = new Map<string, ArchSource[]>();
  for (const unit of [...services, ...libs]) {
    const list = ownedTypes(unit);
    const parent = containerId(unit);
    for (const role of ROLE_ORDER) {
      const members = list.filter((t) => primaryRole(t.roles) === role);
      if (members.length === 0) continue;
      const id = componentNodeId(unit, role);
      const sample = members
        .slice(0, 4)
        .map((t) => t.name)
        .join(", ");
      const sources = members.slice(0, 3).map((t) => src(t.path, t.line, t.name));
      addNode({
        id,
        label: `${ROLE_LABEL[role]} (${members.length})`,
        kind: "component",
        layer: ROLE_LAYER[role],
        parentId: parent,
        description: `${members.length} classes, par exemple ${sample}${members.length > 4 ? "…" : ""}.`,
        tech: ["Spring"],
        provenance: "extracted",
        sources,
      });
      componentSources.set(id, sources);
      for (const t of members) componentByFqn.set(t.fqn, { id, role, unit: unit.key });
    }
  }

  /* ---- component-to-component edges, read from imports ---- */
  const pairFiles = new Map<
    string,
    { src: ComponentRef; dst: ComponentRef; files: Map<string, string> }
  >();
  for (const f of project.files) {
    const java = f.facts?.java;
    if (!java || f.kind === "test") continue;
    for (const t of java.types) {
      const from = componentByFqn.get(java.pkg ? `${java.pkg}.${t.name}` : t.name);
      if (!from) continue;
      for (const imp of java.imports) {
        let key = imp;
        let to = componentByFqn.get(key);
        // `a.b.C.Inner` and static members point at the class `a.b.C`.
        for (let strips = 0; !to && strips < 2 && key.includes("."); strips += 1) {
          key = key.slice(0, key.lastIndexOf("."));
          to = componentByFqn.get(key);
        }
        // Configuration classes are imported by everything: drawing them would bury the picture.
        if (!to || to.id === from.id || to.role === "configuration") continue;
        const id = `${from.id}>${to.id}`;
        const pair = pairFiles.get(id) ?? { src: from, dst: to, files: new Map() };
        pair.files.set(t.name, f.path);
        pairFiles.set(id, pair);
      }
    }
  }

  const violations: ArchViolation[] = [];
  for (const { src: from, dst: to, files } of [...pairFiles.values()].sort((a, b) =>
    `${a.src.id}${a.dst.id}`.localeCompare(`${b.src.id}${b.dst.id}`),
  )) {
    const names = [...files.keys()].sort();
    const label = LABEL_BY_ROLES[`${from.role}>${to.role}`] ?? "utilise";
    addEdge({
      source: from.id,
      target: to.id,
      kind: "sync",
      label,
      sources: [...files.values()].slice(0, 3).map((p) => src(p)),
    });
    const rule = violationRule(from.role, to.role);
    if (rule && violations.length < 30) {
      const edgeId = `e-${from.id}>${to.id}:sync`;
      violations.push({
        id: `v-${violations.length + 1}`,
        rule: rule.label,
        severity: "major",
        sourceId: from.id,
        targetId: to.id,
        edgeId,
        explanation: `${names.slice(0, 4).join(", ")}${names.length > 4 ? ` et ${names.length - 4} autres` : ""} ${
          names.length > 1 ? "importent" : "importe"
        } directement ${ROLE_LABEL[to.role].toLowerCase()}. ${rule.reason}`,
        proposedFix: rule.fix,
      });
    }
  }

  /* ---- datastores ---- */
  const migrationCount = project.files.filter((f) =>
    /(^|\/)db\/migration\/.*\.sql$/i.test(f.path),
  ).length;
  const entityCount = prodTypes.filter((t) => t.roles.includes("entity")).length;
  for (const store of STORES) {
    const users = containers.filter((c) => hasDep(c, store.test));
    if (users.length === 0) continue;
    const id = `db-${store.id}`;
    const driver = project.maven.find((m) => m.pom.dependencies.some((d) => store.test.test(d.id)));
    addNode({
      id,
      label: store.label,
      kind: "datastore",
      layer: "infrastructure",
      parentId: sysId,
      description: `Base ${store.label} utilisée par ${users.map((u) => u.name).join(", ")}${
        entityCount ? `. ${entityCount} entités JPA` : ""
      }${migrationCount ? `, ${migrationCount} scripts de migration` : ""}.`,
      tech: [store.label],
      provenance: "extracted",
      sources: driver ? [src(driver.pomPath, undefined, "pilote déclaré")] : [],
    });
    for (const user of users.filter((u) => services.some((s) => s.key === u.key))) {
      addEdge({
        source: containerId(user),
        target: id,
        kind: "data",
        label: store.sql ? "SQL (JPA)" : "accès aux données",
        ...(store.sql ? { payload: "sql" as const } : {}),
        sources: driver ? [src(driver.pomPath)] : [],
      });
    }
  }

  /* ---- configuration-driven nodes ---- */
  const configs = referenceConfigs(project.files);
  const envNote = configs.env ? ` (configuration ${configs.env})` : "";

  /** Which services read a configuration key: found in the code first, guessed from the folder second. */
  const ownersOfKey = (key: string, configPath: string): { owners: Unit[]; found: boolean } => {
    const clean = key.replace(/\[\]/g, "");
    const readers = new Set<string>();
    for (const [unitKey, files] of javaFilesByUnit) {
      for (const f of files) {
        const java = f.facts?.java;
        if (!java) continue;
        const direct = java.placeholders.some(
          (p) => p === clean || p.replace(/\[\]/g, "") === clean,
        );
        const bound = java.prefixes.some((p) => clean === p || clean.startsWith(`${p}.`));
        if (direct || bound) readers.add(unitKey);
      }
    }
    const owners = services.filter(
      (s) => readers.has(s.key) || [...readers].some((r) => project.internalClosure(s.key).has(r)),
    );
    if (owners.length > 0) return { owners, found: true };
    const pathTokens = tokens(configPath).filter((t) => !GENERIC_TOKENS.has(t));
    const guessed = services.filter((s) =>
      tokens(s.name).some((tn) => pathTokens.some((tp) => tokensMatch(tn, tp))),
    );
    return { owners: guessed.length > 0 ? guessed : services, found: false };
  };

  /* queues */
  const brokerUsers = containers.filter((c) => BROKERS.some((b) => hasDep(c, b.test)));
  if (brokerUsers.length > 0) {
    const brokerLabel =
      BROKERS.find((b) => brokerUsers.some((u) => hasDep(u, b.test)))?.label ?? "MQ";
    const listened = new Set<string>();
    for (const f of project.files) for (const l of f.facts?.java?.listens ?? []) listened.add(l);

    const queues = new Map<
      string,
      { key: string; path: string; line: number; consumes: boolean }[]
    >();
    for (const c of configs.files) {
      for (const e of c.entries) {
        const leaf = e.key.slice(e.key.lastIndexOf(".") + 1);
        if (
          !/queue/i.test(leaf) ||
          /(manager|capacity|size|count|depth|timeout|attempt|delay|pool)/i.test(leaf)
        ) {
          continue;
        }
        if (!/^[A-Za-z][A-Za-z0-9._/-]*$/.test(e.value) || /^(true|false|null)$/i.test(e.value))
          continue;
        const list = queues.get(e.value) ?? [];
        const byPlaceholder = [...listened].some((l) => l.includes(`\${${e.key}}`));
        const byName = /(^|[-._])(in|inbound|input|incoming|request|requests)($|[-._])/i.test(leaf);
        list.push({
          key: e.key,
          path: c.record.path,
          line: e.line,
          consumes: byPlaceholder || byName,
        });
        queues.set(e.value, list);
      }
    }
    for (const [name, uses] of [...queues]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(0, MAX_QUEUES)) {
      const id = `q-${slug(name)}`;
      const first = uses[0];
      if (!first) continue;
      addNode({
        id,
        label: name,
        kind: "queue",
        layer: "infrastructure",
        parentId: sysId,
        description: `File ${brokerLabel} nommée dans la configuration${envNote}, clé ${first.key}.`,
        tech: [brokerLabel],
        provenance: "extracted",
        sources: [src(first.path, first.line, first.key)],
      });
      for (const use of uses) {
        const { owners, found } = ownersOfKey(use.key, use.path);
        for (const owner of owners) {
          const listenerRead = [...listened].some((l) => l.includes(`\${${use.key}}`));
          const certain = found && listenerRead;
          addEdge({
            source: use.consumes ? id : containerId(owner),
            target: use.consumes ? containerId(owner) : id,
            kind: "async",
            label: use.consumes ? "consomme" : "publie",
            payload: "event",
            provenance: certain ? "extracted" : "inferred",
            sources: [
              src(use.path, use.line, certain ? use.key : `${use.key} : sens déduit du nom`),
            ],
          });
        }
      }
    }
  }

  /* Kafka */
  const kafkaUsers = services.filter((s) => hasDep(s, KAFKA));
  if (kafkaUsers.length > 0) {
    addNode({
      id: "bus-kafka",
      label: "Kafka",
      kind: "queue",
      layer: "infrastructure",
      parentId: sysId,
      description: "Bus Kafka déclaré dans les dépendances Maven.",
      tech: ["Kafka"],
      provenance: "extracted",
    });
    for (const s of kafkaUsers) {
      addEdge({
        source: containerId(s),
        target: "bus-kafka",
        kind: "async",
        label: "publie / consomme",
        payload: "event",
      });
    }
  }

  /* external systems named in configuration */
  const groups = new Map<
    string,
    {
      hosts: Set<string>;
      first: { path: string; line: number; key: string };
      mail: boolean;
      oauth: boolean;
    }
  >();
  for (const c of configs.files) {
    for (const e of c.entries) {
      if (/datasource|jdbc|broker|bootstrap|queue|mq\./i.test(e.key) || /^jdbc/.test(e.value))
        continue;
      if (!/(host|hosts|url|uri|endpoint)/i.test(e.key)) continue;
      const host = hostOf(e.value);
      if (!host || isLocalHost(host)) continue;
      const mail = /smtp|mail/i.test(e.key);
      const oauth = /oauth|issuer|token-info|access-token|jwt/i.test(e.key);
      const root = mail ? "mail" : oauth ? "oauth" : keyRoot(e.key);
      const group = groups.get(root) ?? {
        hosts: new Set<string>(),
        first: { path: c.record.path, line: e.line, key: e.key },
        mail,
        oauth,
      };
      group.hosts.add(host.replace(/^[a-z]+:\/\//i, ""));
      groups.set(root, group);
    }
  }
  const mailDep = containers.filter((c) => hasDep(c, MAIL));
  if (mailDep.length > 0 && !groups.has("mail")) {
    groups.set("mail", {
      hosts: new Set(),
      first: {
        path: mailDep[0]?.maven?.pomPath ?? "pom.xml",
        line: 0,
        key: "spring-boot-starter-mail",
      },
      mail: true,
      oauth: false,
    });
  }

  for (const [root, group] of [...groups]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(0, MAX_EXTERNALS)) {
    const label = group.mail
      ? "Serveur SMTP"
      : group.oauth
        ? "Fournisseur OAuth"
        : `Système externe : ${root}`;
    const id = `ext-${slug(root)}`;
    const hosts = [...group.hosts].sort();
    addNode({
      id,
      label,
      kind: "external",
      layer: "externe",
      repoId: EXTERNAL,
      description: hosts.length
        ? `${hosts.length} hôte${hosts.length > 1 ? "s" : ""} dans la configuration${envNote} : ${hosts.slice(0, 3).join(", ")}${hosts.length > 3 ? "…" : ""}.`
        : "Déclaré par les dépendances du projet.",
      tech: [],
      provenance: "extracted",
      sources: [src(group.first.path, group.first.line || undefined, group.first.key)],
    });
    const { owners, found } = ownersOfKey(group.first.key, group.first.path);
    const targets = group.mail && mailDep.length ? services.filter((s) => hasDep(s, MAIL)) : owners;
    for (const owner of targets) {
      addEdge({
        source: containerId(owner),
        target: id,
        kind: "sync",
        label: group.mail ? "envoie des e-mails" : "appelle",
        provenance: found || group.mail ? "extracted" : "inferred",
        sources: [src(group.first.path, group.first.line || undefined, group.first.key)],
      });
    }
  }
  void OAUTH;

  /* ---- delivery: pipeline and images ---- */
  const ciFile = project.files.find((f) => f.facts?.ci);
  const ci: CiFacts | undefined = ciFile?.facts?.ci;
  const claimed = new Set<string>();
  const unmatchedImages: { id: string; dockerPath: string; jar: string }[] = [];
  if (ciFile && ci) {
    const tools = [...new Set(ci.jobs.flatMap((j) => j.tools))];
    const manual = ci.jobs.filter((j) => j.manual).length;
    const label =
      ci.provider === "gitlab"
        ? "GitLab CI"
        : ci.provider === "github"
          ? "GitHub Actions"
          : "Jenkins";
    addNode({
      id: "pipe-ci",
      label: `Pipeline ${label}`,
      kind: "pipeline",
      layer: "infrastructure",
      parentId: sysId,
      description: `${ci.jobs.length} jobs${ci.stages.length ? ` en ${ci.stages.length} étapes (${ci.stages.join(" → ")})` : ""}${
        manual ? `, dont ${manual} manuel${manual > 1 ? "s" : ""}` : ""
      }.`,
      tech: [label, ...tools],
      provenance: "extracted",
      sources: [src(ciFile.path)],
    });

    for (const job of ci.jobs) {
      for (const push of job.pushes) {
        const image = imageRepository(push.image);
        if (!image) continue;
        const id = imageNodeId(image);
        const dockerPath = push.dockerfile ? findDockerfile(project, push.dockerfile) : undefined;
        addNode({
          id,
          label: `Image ${image}`,
          kind: "deployment",
          layer: "infrastructure",
          parentId: sysId,
          description: `Image publiée par le job ${job.name}${push.dockerfile ? ` à partir de ${push.dockerfile}` : ""}.`,
          tech: ["Docker"],
          provenance: "extracted",
          sources: [src(dockerPath ?? ciFile.path, undefined, `job ${job.name}`)],
        });
        addEdge({
          source: "pipe-ci",
          target: id,
          kind: "build",
          payload: "artifact",
          label: "construit et publie",
          sources: [src(ciFile.path, undefined, `job ${job.name}`)],
        });
        const docker = dockerPath ? project.byPath.get(dockerPath)?.facts?.docker : undefined;
        if (!docker || !dockerPath) continue;
        for (const jar of docker.jars) {
          const owner = services.find((s) => jar.toLowerCase().startsWith(s.name.toLowerCase()));
          if (owner) {
            claimed.add(owner.key);
            addEdge({
              source: id,
              target: containerId(owner),
              kind: "deploy",
              label: "exécute",
              sources: [src(dockerPath, undefined, jar)],
            });
          } else {
            unmatchedImages.push({ id, dockerPath, jar });
          }
        }
        for (const copy of docker.copies) {
          const ui = uis.find(
            (u) => copy.startsWith(`${u.key}/`) || copy.startsWith(`./${u.key}/`),
          );
          if (ui) {
            addEdge({
              source: containerId(ui),
              target: id,
              kind: "build",
              payload: "artifact",
              label: "embarqué dans l'image",
              sources: [src(dockerPath, undefined, copy)],
            });
          }
        }
      }
    }
  }

  /*
   * `ADD ${JAR_FILE} ./qis-app.jar` names a jar that no Maven module is called. When exactly one
   * image is in that case, the services no other image claims are what it runs. It is a guess,
   * and the edge says so.
   */
  const orphanImages = [...new Set(unmatchedImages.map((u) => u.id))];
  const unclaimed = services.filter((s) => !claimed.has(s.key));
  if (orphanImages.length === 1 && unclaimed.length > 0) {
    const first = unmatchedImages[0];
    for (const owner of unclaimed) {
      if (!first) break;
      addEdge({
        source: first.id,
        target: containerId(owner),
        kind: "deploy",
        label: "exécute",
        provenance: "inferred",
        sources: [src(first.dockerPath, undefined, `${first.jar} : correspondance déduite`)],
      });
    }
  }

  /* ---- people and front end ---- */
  const withControllers = services.filter((s) =>
    ownedTypes(s).some((t) => t.roles.includes("controller")),
  );
  if (uis.length > 0 || withControllers.length > 0) {
    addNode({
      id: "act-users",
      label: "Utilisateurs",
      kind: "actor",
      layer: "externe",
      repoId: EXTERNAL,
      description:
        "Les personnes qui utilisent l'application. Déduit de la présence d'une interface ou d'une API.",
      provenance: "inferred",
    });
    for (const ui of uis) {
      addEdge({
        source: "act-users",
        target: containerId(ui),
        kind: "sync",
        label: "utilisent l'interface",
        provenance: "inferred",
      });
    }
    if (uis.length === 0) {
      for (const s of withControllers) {
        addEdge({
          source: "act-users",
          target: containerId(s),
          kind: "sync",
          label: "appellent l'API",
          provenance: "inferred",
        });
      }
    }
  }
  for (const ui of uis) {
    const http = (tsFilesByUnit.get(ui.key) ?? []).find((f) => f.facts?.ts?.usesHttp);
    if (!http) continue;
    for (const s of withControllers) {
      addEdge({
        source: containerId(ui),
        target: containerId(s),
        kind: "sync",
        label: "appelle l'API REST",
        payload: "rest-json",
        provenance: "inferred",
        sources: [src(http.path, undefined, "HttpClient")],
      });
    }
  }

  return {
    projectId: repositoryId,
    repos: [
      { id: repo, name: repoName, provider: providerLabel(provider) },
      { id: EXTERNAL, name: "Hors périmètre", provider: "—" },
    ],
    commit: commit.slice(0, 7),
    generatedAt: input.generatedAt,
    nodes,
    edges,
    contract: {
      layers: [
        {
          id: "experience",
          label: "Expérience",
          description: "Ce que voit l'utilisateur : interface, contrôleurs HTTP.",
        },
        {
          id: "application",
          label: "Application",
          description: "Les unités déployables qui orchestrent un cas d'usage.",
        },
        {
          id: "domaine",
          label: "Domaine",
          description: "Les règles métier, sans connaissance du transport ni du stockage.",
        },
        {
          id: "infrastructure",
          label: "Infrastructure",
          description: "Bases, files, configuration, chaînes de construction et de déploiement.",
        },
        {
          id: "externe",
          label: "Externe",
          description: "Tout ce que l'équipe ne possède pas : acteurs et systèmes tiers.",
        },
      ],
      forbidden: [
        {
          from: "experience",
          to: "infrastructure",
          reason:
            "Un contrôleur doit passer par un service, jamais attaquer un repository directement.",
        },
        {
          from: "domaine",
          to: "experience",
          reason: "Le domaine ne doit rien savoir de l'interface : la dépendance s'inverse.",
        },
      ],
      // No team validated these rules: they are Cairn's defaults, and the panel says so.
      validatedBy: "",
      validatedAt: "",
    },
    violations,
  };
}

const LABEL_BY_ROLES: Record<string, string> = {
  "controller>service": "appelle",
  "service>repository": "lit et écrit",
  "service>service": "appelle",
  "service>entity": "manipule",
  "repository>entity": "gère",
  "scheduler>service": "déclenche",
  "listener>service": "délègue à",
  "controller>repository": "accède directement à",
};

function violationRule(
  from: JavaRole,
  to: JavaRole,
): { label: string; reason: string; fix: string } | undefined {
  if (from === "controller" && to === "repository") {
    return {
      label: "Expérience → Infrastructure",
      reason: "Un contrôleur doit passer par un service.",
      fix: "Introduire un service entre le contrôleur et le repository.",
    };
  }
  if ((from === "service" || from === "entity") && to === "controller") {
    return {
      label: "Domaine → Expérience",
      reason: "Le domaine ne doit pas dépendre de la couche HTTP.",
      fix: "Inverser la dépendance : le contrôleur appelle le service, jamais l'inverse.",
    };
  }
  return undefined;
}

function isTestPath(path: string, project: Project): boolean {
  return project.byPath.get(path)?.kind === "test";
}

function findDockerfile(project: Project, ref: string): string | undefined {
  const clean = ref.replace(/^\.\//, "");
  if (project.byPath.has(clean)) return clean;
  const base = clean.slice(clean.lastIndexOf("/") + 1);
  return [...project.byPath.keys()].find((p) => p.slice(p.lastIndexOf("/") + 1) === base);
}
