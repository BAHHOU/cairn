import type { CodeEdge, CodeEdgeKind, CodeGraph, CodeNode, CodeNodeKind } from "@cairn/shared";

/**
 * The code map of `qis-dist-cms`, as an extractor would have left it.
 *
 * Written as tuples rather than objects on purpose: seventy symbols spelled out in
 * full would be a file nobody rereads, and a seed nobody rereads quietly rots. The
 * shape is `[id, label, kind, path, line, archNodeId]`, and everything derivable —
 * the language, the repository — is derived rather than repeated.
 *
 * The communities are *not* in this file. They are computed from the links by
 * `detectCommunities`, which is the whole point: if a developer moves a class, the
 * cluster follows without anyone updating a legend.
 */

type NodeRow = [
  id: string,
  label: string,
  kind: CodeNodeKind,
  path: string,
  line: number,
  archNodeId: string,
];

const JAVA = "src/main/java/com/cacib/qis/dist/";
const SQL = "src/main/resources/db/migration/";

const NODE_ROWS: NodeRow[] = [
  // --- Couche REST -------------------------------------------------------
  [
    "c-dist-controller",
    "DistributionController",
    "class",
    `${JAVA}api/DistributionController.java`,
    42,
    "cmp-rest",
  ],
  [
    "c-msg-controller",
    "MessageController",
    "class",
    `${JAVA}api/MessageController.java`,
    38,
    "cmp-rest",
  ],
  [
    "c-health-controller",
    "HealthController",
    "class",
    `${JAVA}api/HealthController.java`,
    19,
    "cmp-rest",
  ],
  ["c-dist-dto", "DistributionDto", "class", `${JAVA}api/dto/DistributionDto.java`, 14, "cmp-rest"],
  ["c-msg-dto", "MessageDto", "class", `${JAVA}api/dto/MessageDto.java`, 12, "cmp-rest"],
  [
    "c-error-response",
    "ErrorResponse",
    "class",
    `${JAVA}api/dto/ErrorResponse.java`,
    9,
    "cmp-rest",
  ],
  [
    "c-exception-handler",
    "ApiExceptionHandler",
    "class",
    `${JAVA}api/ApiExceptionHandler.java`,
    27,
    "cmp-rest",
  ],
  ["c-page-factory", "pageRequestOf()", "function", `${JAVA}api/Paging.java`, 33, "cmp-rest"],
  ["c-web-config", "WebMvcConfig", "config", `${JAVA}api/WebMvcConfig.java`, 21, "cmp-rest"],

  // --- Sécurité ----------------------------------------------------------
  [
    "c-jwt-filter",
    "JwtAuthFilter",
    "class",
    `${JAVA}security/JwtAuthFilter.java`,
    48,
    "cmp-security",
  ],
  [
    "c-token-verifier",
    "TokenVerifier",
    "class",
    `${JAVA}security/TokenVerifier.java`,
    31,
    "cmp-security",
  ],
  ["c-role-guard", "RoleGuard", "class", `${JAVA}security/RoleGuard.java`, 24, "cmp-security"],
  [
    "c-security-config",
    "SecurityConfig",
    "config",
    `${JAVA}security/SecurityConfig.java`,
    36,
    "cmp-security",
  ],
  ["x-spring-security", "spring-security", "external", "", 0, ""],

  // --- Domaine -----------------------------------------------------------
  [
    "c-dist-service",
    "DistributionService",
    "class",
    `${JAVA}domain/DistributionService.java`,
    57,
    "cmp-service",
  ],
  [
    "c-routing-service",
    "RoutingService",
    "class",
    `${JAVA}domain/RoutingService.java`,
    41,
    "cmp-service",
  ],
  [
    "c-validation-service",
    "ValidationService",
    "class",
    `${JAVA}domain/ValidationService.java`,
    29,
    "cmp-service",
  ],
  [
    "c-fee-calculator",
    "FeeCalculator",
    "class",
    `${JAVA}domain/FeeCalculator.java`,
    22,
    "cmp-service",
  ],
  [
    "c-cutoff-policy",
    "CutoffPolicy",
    "class",
    `${JAVA}domain/CutoffPolicy.java`,
    73,
    "cmp-service",
  ],
  [
    "c-distribution",
    "Distribution",
    "class",
    `${JAVA}domain/model/Distribution.java`,
    18,
    "cmp-service",
  ],
  [
    "c-counterparty",
    "Counterparty",
    "class",
    `${JAVA}domain/model/Counterparty.java`,
    11,
    "cmp-service",
  ],
  ["c-amount", "Amount", "class", `${JAVA}domain/model/Amount.java`, 8, "cmp-service"],
  ["c-currency", "Currency", "class", `${JAVA}domain/model/Currency.java`, 6, "cmp-service"],
  [
    "c-domain-exception",
    "DomainException",
    "class",
    `${JAVA}domain/DomainException.java`,
    7,
    "cmp-service",
  ],

  // --- Analyse des messages MT -------------------------------------------
  ["c-mt-parser", "MtParser", "class", `${JAVA}mt/MtParser.java`, 64, "cmp-mapper"],
  ["c-mt103", "Mt103Message", "class", `${JAVA}mt/Mt103Message.java`, 23, "cmp-mapper"],
  ["c-mt202", "Mt202Message", "class", `${JAVA}mt/Mt202Message.java`, 21, "cmp-mapper"],
  ["c-field-32a", "Field32A", "class", `${JAVA}mt/field/Field32A.java`, 14, "cmp-mapper"],
  ["c-field-50k", "Field50K", "class", `${JAVA}mt/field/Field50K.java`, 13, "cmp-mapper"],
  ["c-field-59", "Field59", "class", `${JAVA}mt/field/Field59.java`, 13, "cmp-mapper"],
  [
    "c-mt-mapper",
    "MtToDistributionMapper",
    "class",
    `${JAVA}mt/MtToDistributionMapper.java`,
    45,
    "cmp-mapper",
  ],
  [
    "c-mt-validator",
    "MtFieldValidator",
    "class",
    `${JAVA}mt/MtFieldValidator.java`,
    37,
    "cmp-mapper",
  ],
  [
    "c-swift-charset",
    "swiftCharset()",
    "function",
    `${JAVA}mt/SwiftCharset.java`,
    16,
    "cmp-mapper",
  ],
  ["x-prowide", "prowide-core", "external", "", 0, ""],

  // --- Persistance --------------------------------------------------------
  [
    "c-dist-repo",
    "DistributionRepository",
    "interface",
    `${JAVA}repo/DistributionRepository.java`,
    15,
    "cmp-repo",
  ],
  [
    "c-msg-repo",
    "MessageRepository",
    "interface",
    `${JAVA}repo/MessageRepository.java`,
    13,
    "cmp-repo",
  ],
  [
    "c-audit-repo",
    "AuditRepository",
    "interface",
    `${JAVA}repo/AuditRepository.java`,
    11,
    "cmp-repo",
  ],
  [
    "c-dist-entity",
    "DistributionEntity",
    "class",
    `${JAVA}repo/entity/DistributionEntity.java`,
    20,
    "cmp-repo",
  ],
  [
    "c-msg-entity",
    "MessageEntity",
    "class",
    `${JAVA}repo/entity/MessageEntity.java`,
    17,
    "cmp-repo",
  ],
  ["c-audit-entity", "AuditEntity", "class", `${JAVA}repo/entity/AuditEntity.java`, 15, "cmp-repo"],
  ["t-distribution", "distribution", "table", `${SQL}V1__init.sql`, 3, "db-pg"],
  ["t-message", "message", "table", `${SQL}V1__init.sql`, 28, "db-pg"],
  ["t-audit-log", "audit_log", "table", `${SQL}V4__audit.sql`, 2, "db-pg"],
  ["t-counterparty", "counterparty", "table", `${SQL}V1__init.sql`, 51, "db-pg"],
  ["c-flyway-v12", "V12__add_cutoff.sql", "config", `${SQL}V12__add_cutoff.sql`, 1, "db-pg"],
  ["x-hibernate", "hibernate-core", "external", "", 0, ""],

  // --- Messagerie ---------------------------------------------------------
  [
    "c-mq-listener",
    "MqMessageListener",
    "class",
    `${JAVA}mq/MqMessageListener.java`,
    52,
    "cmp-mqlistener",
  ],
  ["c-mq-publisher", "MqPublisher", "class", `${JAVA}mq/MqPublisher.java`, 34, "cmp-mqlistener"],
  ["c-retry-policy", "RetryPolicy", "class", `${JAVA}mq/RetryPolicy.java`, 26, "cmp-mqlistener"],
  [
    "c-dead-letter",
    "DeadLetterHandler",
    "class",
    `${JAVA}mq/DeadLetterHandler.java`,
    30,
    "cmp-mqlistener",
  ],
  [
    "c-envelope",
    "MessageEnvelope",
    "class",
    `${JAVA}mq/MessageEnvelope.java`,
    12,
    "cmp-mqlistener",
  ],
  ["x-ibm-mq", "com.ibm.mq.allclient", "external", "", 0, ""],

  // --- Construction et déploiement ----------------------------------------
  ["cfg-app", "application.yml", "config", "src/main/resources/application.yml", 1, "cmp-config"],
  [
    "cfg-app-prod",
    "application-prod.yml",
    "config",
    "src/main/resources/application-prod.yml",
    1,
    "cmp-config",
  ],
  ["cfg-pom", "pom.xml", "config", "pom.xml", 1, "cmp-config"],
  ["cfg-dockerfile", "Dockerfile", "config", "Dockerfile", 1, "cmp-config"],
  ["cfg-ci", ".gitlab-ci.yml", "config", ".gitlab-ci.yml", 1, "cmp-config"],
  ["cfg-k8s", "deployment.yaml", "config", "deploy/k8s/deployment.yaml", 1, "cmp-config"],

  // --- Transverse ---------------------------------------------------------
  ["c-logger", "StructuredLogger", "class", `${JAVA}common/StructuredLogger.java`, 18, ""],
  ["c-clock", "Clock", "interface", `${JAVA}common/Clock.java`, 5, ""],
  ["c-ids", "newId()", "function", `${JAVA}common/Ids.java`, 9, ""],
  ["c-json", "JsonCodec", "class", `${JAVA}common/JsonCodec.java`, 24, ""],

  // --- Au-delà du code ----------------------------------------------------
  ["d-readme", "README.md", "doc", "README.md", 1, ""],
  ["d-runbook", "Runbook d'exploitation", "doc", "docs/runbook.md", 1, ""],
  ["d-api-contract", "Contrat d'API", "doc", "docs/api-contract.md", 1, ""],
  ["a-adr-003", "ADR-003 Parseur MT maison", "adr", "docs/adr/003-parseur-mt.md", 1, ""],
  [
    "a-adr-007",
    "ADR-007 Un seul chemin d'écriture",
    "adr",
    "docs/adr/007-chemin-ecriture.md",
    1,
    "",
  ],
  ["a-adr-011", "ADR-011 Idempotence des reprises", "adr", "docs/adr/011-idempotence.md", 1, ""],
  ["r-cutoff", "POURQUOI: cutoff à 16h30", "rationale", `${JAVA}domain/CutoffPolicy.java`, 88, ""],
  ["r-retry", "POURQUOI: 3 tentatives puis DLQ", "rationale", `${JAVA}mq/RetryPolicy.java`, 41, ""],
  [
    "r-charset",
    "NOTE: jeu de caractères SWIFT restreint",
    "rationale",
    `${JAVA}mt/SwiftCharset.java`,
    22,
    "",
  ],
];

type EdgeRow = [source: string, target: string, kind: CodeEdgeKind, note?: string];

/** `extracted` unless a note explains what the resolver had to guess. */
const EDGE_ROWS: EdgeRow[] = [
  // REST
  ["c-dist-controller", "c-dist-dto", "imports"],
  ["c-dist-controller", "c-dist-service", "calls"],
  ["c-dist-controller", "c-error-response", "imports"],
  ["c-dist-controller", "c-page-factory", "calls"],
  ["c-dist-controller", "c-logger", "imports"],
  ["c-msg-controller", "c-msg-dto", "imports"],
  ["c-msg-controller", "c-dist-service", "calls"],
  [
    "c-msg-controller",
    "c-mt-parser",
    "calls",
    "Type résolu par nom : aucun import explicite dans le fichier.",
  ],
  ["c-msg-controller", "c-logger", "imports"],
  ["c-health-controller", "c-logger", "imports"],
  ["c-exception-handler", "c-error-response", "imports"],
  ["c-exception-handler", "c-domain-exception", "calls"],
  ["c-exception-handler", "c-logger", "imports"],
  [
    "c-web-config",
    "c-dist-controller",
    "configures",
    "Enregistrement par balayage de paquet, pas par référence directe.",
  ],
  [
    "c-web-config",
    "c-msg-controller",
    "configures",
    "Enregistrement par balayage de paquet, pas par référence directe.",
  ],
  ["c-dist-dto", "c-amount", "imports"],
  ["c-msg-dto", "c-amount", "imports"],
  ["d-api-contract", "c-dist-controller", "documents"],
  ["d-api-contract", "c-msg-controller", "documents"],

  // Sécurité
  ["c-jwt-filter", "c-token-verifier", "calls"],
  ["c-jwt-filter", "c-logger", "imports"],
  ["c-jwt-filter", "x-spring-security", "imports"],
  ["c-security-config", "c-jwt-filter", "configures"],
  ["c-security-config", "c-role-guard", "configures"],
  ["c-security-config", "x-spring-security", "imports"],
  ["c-role-guard", "c-token-verifier", "calls"],
  ["c-token-verifier", "c-json", "imports"],
  ["c-role-guard", "c-dist-controller", "calls", "Annotation @PreAuthorize posée sur les routes."],
  [
    "c-jwt-filter",
    "c-msg-controller",
    "calls",
    "Chaîne de filtres : l'ordre vient de la configuration.",
  ],

  // Domaine
  ["c-dist-service", "c-routing-service", "calls"],
  ["c-dist-service", "c-validation-service", "calls"],
  ["c-dist-service", "c-fee-calculator", "calls"],
  ["c-dist-service", "c-distribution", "imports"],
  ["c-dist-service", "c-dist-repo", "calls"],
  ["c-dist-service", "c-mq-publisher", "calls"],
  ["c-dist-service", "c-logger", "imports"],
  ["c-dist-service", "c-ids", "imports"],
  ["c-routing-service", "c-counterparty", "imports"],
  ["c-routing-service", "c-cutoff-policy", "calls"],
  ["c-validation-service", "c-domain-exception", "imports"],
  ["c-validation-service", "c-amount", "calls"],
  ["c-fee-calculator", "c-amount", "imports"],
  ["c-fee-calculator", "c-currency", "imports"],
  ["c-amount", "c-currency", "imports"],
  ["c-distribution", "c-amount", "imports"],
  ["c-distribution", "c-counterparty", "imports"],
  ["c-cutoff-policy", "c-clock", "imports"],
  ["r-cutoff", "c-cutoff-policy", "explains"],
  ["a-adr-007", "c-dist-service", "decides"],

  // Messages MT
  ["c-mt-parser", "c-mt103", "imports"],
  ["c-mt-parser", "c-mt202", "imports"],
  ["c-mt-parser", "c-mt-validator", "calls"],
  ["c-mt-parser", "c-swift-charset", "calls"],
  ["c-mt-parser", "x-prowide", "imports"],
  ["c-mt103", "c-field-32a", "imports"],
  ["c-mt103", "c-field-50k", "imports"],
  ["c-mt103", "c-field-59", "imports"],
  ["c-mt202", "c-field-32a", "imports"],
  ["c-mt202", "c-field-59", "imports"],
  ["c-mt-mapper", "c-mt103", "imports"],
  ["c-mt-mapper", "c-mt202", "imports"],
  ["c-mt-mapper", "c-distribution", "imports"],
  ["c-mt-mapper", "c-amount", "calls"],
  ["c-mt-validator", "c-swift-charset", "calls"],
  ["c-mt-validator", "c-domain-exception", "imports"],
  [
    "c-field-32a",
    "c-amount",
    "imports",
    "Type du champ montant déduit de la signature du constructeur.",
  ],
  ["a-adr-003", "c-mt-parser", "decides"],
  ["r-charset", "c-swift-charset", "explains"],
  // L'écart de contrat n° 2 de la vue architecture, vu depuis le code qui le produit.
  [
    "c-mt-mapper",
    "c-dist-controller",
    "calls",
    "Appel remontant : le mapper rappelle la couche REST (écart de contrat).",
  ],

  // Persistance
  ["c-dist-repo", "c-dist-entity", "imports"],
  ["c-dist-repo", "x-hibernate", "imports"],
  ["c-dist-repo", "t-distribution", "reads"],
  ["c-dist-repo", "t-distribution", "writes"],
  ["c-msg-repo", "c-msg-entity", "imports"],
  ["c-msg-repo", "t-message", "reads"],
  ["c-msg-repo", "t-message", "writes"],
  ["c-audit-repo", "c-audit-entity", "imports"],
  ["c-audit-repo", "t-audit-log", "writes"],
  ["c-audit-repo", "c-clock", "imports"],
  ["c-dist-entity", "c-amount", "imports"],
  ["c-dist-entity", "x-hibernate", "imports"],
  ["c-msg-entity", "x-hibernate", "imports"],
  ["c-audit-entity", "x-hibernate", "imports"],
  [
    "c-dist-entity",
    "t-counterparty",
    "reads",
    "Jointure @ManyToOne sans contrainte déclarée en base.",
  ],
  ["c-flyway-v12", "t-distribution", "configures"],
  ["d-runbook", "t-audit-log", "documents"],
  // L'écart de contrat n° 1 : le contrôleur écrit directement en base.
  [
    "c-dist-controller",
    "t-distribution",
    "writes",
    "Requête native dans le contrôleur (écart de contrat).",
  ],

  // Messagerie
  ["c-mq-listener", "c-mt-parser", "calls"],
  ["c-mq-listener", "c-dist-service", "calls"],
  ["c-mq-listener", "c-envelope", "imports"],
  ["c-mq-listener", "c-retry-policy", "calls"],
  ["c-mq-listener", "c-msg-repo", "calls"],
  ["c-mq-listener", "x-ibm-mq", "imports"],
  ["c-mq-listener", "c-logger", "imports"],
  ["c-mq-publisher", "c-envelope", "imports"],
  ["c-mq-publisher", "x-ibm-mq", "imports"],
  ["c-mq-publisher", "c-retry-policy", "calls"],
  ["c-retry-policy", "c-dead-letter", "calls"],
  ["c-dead-letter", "c-audit-repo", "calls"],
  ["c-dead-letter", "c-logger", "imports"],
  ["c-envelope", "c-json", "imports"],
  ["r-retry", "c-retry-policy", "explains"],
  ["a-adr-011", "c-retry-policy", "decides"],

  // Construction et déploiement
  ["cfg-app", "c-security-config", "configures"],
  ["cfg-app", "c-mq-listener", "configures"],
  ["cfg-app", "c-dist-repo", "configures"],
  ["cfg-app-prod", "c-mq-listener", "configures"],
  ["cfg-app-prod", "c-security-config", "configures"],
  ["cfg-pom", "x-prowide", "imports"],
  ["cfg-pom", "x-hibernate", "imports"],
  ["cfg-pom", "x-spring-security", "imports"],
  ["cfg-pom", "x-ibm-mq", "imports"],
  [
    "cfg-dockerfile",
    "cfg-app-prod",
    "configures",
    "Profil actif lu dans la variable d'environnement de l'image.",
  ],
  ["cfg-ci", "cfg-dockerfile", "configures"],
  ["cfg-ci", "cfg-pom", "configures"],
  ["cfg-k8s", "cfg-dockerfile", "configures", "Image déduite du tag poussé par la chaîne CI."],
  ["cfg-k8s", "cfg-app-prod", "configures"],
  ["d-readme", "cfg-pom", "documents"],
  ["d-readme", "cfg-ci", "documents"],
  ["d-runbook", "cfg-k8s", "documents"],
  ["c-ids", "c-clock", "imports"],
];

/** Derived rather than repeated seventy times: one less field to get wrong. */
function languageOf(path: string): string | undefined {
  if (!path) return undefined;
  if (path.endsWith(".java")) return "Java";
  if (path.endsWith(".sql")) return "SQL";
  if (path.endsWith(".yml") || path.endsWith(".yaml")) return "YAML";
  if (path.endsWith(".xml")) return "XML";
  if (path.endsWith(".md")) return "Markdown";
  if (path.endsWith("Dockerfile")) return "Dockerfile";
  return undefined;
}

const NODES: CodeNode[] = NODE_ROWS.map(([id, label, kind, path, line, archNodeId]) => ({
  id,
  label,
  kind,
  ...(path ? { path, language: languageOf(path) } : {}),
  ...(line ? { line } : {}),
  ...(archNodeId ? { archNodeId } : {}),
}));

const EDGES: CodeEdge[] = EDGE_ROWS.map(([source, target, kind, note], index) => ({
  id: `ce${index + 1}`,
  source,
  target,
  kind,
  // The note *is* the guess: a link the extractor had to reason about always carries
  // its reasoning, and a link read straight from the syntax tree never needs one.
  confidence: note ? "inferred" : "extracted",
  ...(note ? { note } : {}),
}));

const QIS_DIST_CMS: CodeGraph = {
  projectId: "qis-dist-cms",
  repoId: "qis-dist-cms",
  commit: "a3f91c2",
  generatedAt: "2026-10-16T07:12:00.000Z",
  nodes: NODES,
  edges: EDGES,
  /** Declared, because a silent skip looks exactly like a success. */
  skipped: [
    {
      path: `${JAVA}generated/MtSchema.java`,
      reason: "Fichier généré à la construction, exclu par .gitignore.",
    },
    {
      path: "docs/archive/specs-2019.pdf",
      reason: "Passe sémantique non lancée : aucun modèle configuré pour les documents.",
    },
    {
      path: "src/main/resources/legacy.inc",
      reason: "Extension ambiguë : déclarez le langage de .inc pour que le fichier soit lu.",
    },
  ],
};

export const CODE_GRAPHS: Record<string, CodeGraph> = {
  "qis-dist-cms": QIS_DIST_CMS,
};
