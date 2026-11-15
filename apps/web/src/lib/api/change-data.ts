import type { ChangePolicy, DiffLine, MergeRequest, PersonView, SpecView } from "@cairn/shared";

/**
 * Change control, demo data (fictitious). Each merge request shows one way a change escapes review:
 * a spec rewritten after approval, no ticket at all, a beneficiary hardcoded in code that every
 * approver missed, a spec still in draft. Two are compliant, so the queue is not all red.
 *
 * Zone names are written by the organisation in its policy, so they are data, not UI text.
 */

export const DEMO_POLICY: ChangePolicy = {
  zones: [
    {
      id: "payments",
      name: "Paiements & virements",
      paths: ["**/payment/**", "**/payments/**"],
      keywords: ["virement", "paiement", "payment", "plafond", "transfer"],
      requires: ["business", "techLead"],
    },
    {
      id: "access",
      name: "Droits d'accès",
      paths: ["**/security/**", "**/auth/**"],
      keywords: ["rôle", "role", "droit", "habilitation", "permission", "accès"],
      requires: ["techLead", "security"],
    },
    {
      id: "settlement",
      name: "Règlement-livraison",
      paths: ["**/settlement/**"],
      keywords: ["règlement", "settlement", "bénéficiaire", "beneficiary"],
      requires: ["business", "security"],
    },
  ],
  approvedStatuses: ["Validé", "Prêt pour le développement"],
  ticketProjects: ["PAY", "TRE", "TIT"],
};

export const DEMO_PEOPLE: PersonView[] = [
  { id: "m.leroy", name: "Martine Leroy", roles: ["business"] },
  { id: "c.petit", name: "Camille Petit", roles: ["business"] },
  { id: "e.roux", name: "Élise Roux", roles: ["business"] },
  { id: "j.morel", name: "Julien Morel", roles: ["techLead"] },
  { id: "s.haddad", name: "Sarah Haddad", roles: ["security"] },
  { id: "t.renaud", name: "Thomas Renaud", roles: [] },
  { id: "a.martin", name: "Alex Martin", roles: [] },
  { id: "n.faure", name: "Nicolas Faure", roles: [] },
  { id: "l.garnier", name: "Léa Garnier", roles: [] },
  { id: "p.henry", name: "Paul Henry", roles: [] },
];

const lines = (from: number, ...texts: string[]): DiffLine[] =>
  texts.map((text, i) => ({ line: from + i, text }));

export const DEMO_SPECS: SpecView[] = [
  {
    key: "PAY-42",
    title: "Plafond des virements pour les comptes professionnels",
    status: "Validé",
    url: null,
    approved: {
      at: "2026-10-01T09:12:00Z",
      byId: "m.leroy",
      text: "Les comptes professionnels peuvent émettre des virements jusqu'à 50 000 € par jour. Au-delà, le virement est refusé et le conseiller est alerté.",
    },
    text: "Les comptes professionnels peuvent émettre des virements jusqu'à 2 000 000 € par jour. Au-delà, le virement est refusé et le conseiller est alerté.",
    revisions: [
      { at: "2026-09-29T15:40:00Z", authorId: "m.leroy" },
      { at: "2026-10-28T21:47:00Z", authorId: "t.renaud" },
    ],
  },
  {
    key: "PAY-57",
    title: "Export PDF des relevés",
    status: "Validé",
    url: null,
    approved: {
      at: "2026-10-12T10:00:00Z",
      byId: "m.leroy",
      text: "Le client peut télécharger ses relevés mensuels au format PDF depuis l'espace relevés.",
    },
    text: "Le client peut télécharger ses relevés mensuels au format PDF depuis l'espace relevés.",
    revisions: [{ at: "2026-10-11T16:20:00Z", authorId: "m.leroy" }],
  },
  {
    key: "PAY-60",
    title: "Libellés du formulaire de virement",
    status: "Prêt pour le développement",
    url: null,
    approved: {
      at: "2026-10-30T08:30:00Z",
      byId: "m.leroy",
      text: "Harmoniser les libellés du formulaire de virement avec la charte éditoriale.",
    },
    text: "Harmoniser les libellés du formulaire de virement avec la charte éditoriale.",
    revisions: [],
  },
  {
    key: "TRE-19",
    title: "Rôle de trésorier adjoint",
    status: "Validé",
    url: null,
    approved: {
      at: "2026-10-20T14:00:00Z",
      byId: "c.petit",
      text: "Créer un rôle de trésorier adjoint ayant le même droit d'accès aux prévisions que le trésorier, sans droit de validation.",
    },
    text: "Créer un rôle de trésorier adjoint ayant le même droit d'accès aux prévisions que le trésorier, sans droit de validation.",
    revisions: [{ at: "2026-10-19T09:00:00Z", authorId: "c.petit" }],
  },
  {
    key: "TRE-22",
    title: "Seuil d'alerte de trésorerie basse",
    status: "En rédaction",
    url: null,
    approved: null,
    text: "Relever le seuil d'alerte de trésorerie basse à 250 000 €.",
    revisions: [{ at: "2026-11-02T11:00:00Z", authorId: "l.garnier" }],
  },
  {
    key: "TIT-7",
    title: "Règlements en échec",
    status: "Validé",
    url: null,
    approved: {
      at: "2026-10-15T13:30:00Z",
      byId: "e.roux",
      text: "En cas d'échec, le règlement est mis en file d'attente et signalé à l'opérateur pour traitement manuel.",
    },
    text: "En cas d'échec, le règlement est mis en file d'attente et signalé à l'opérateur pour traitement manuel.",
    revisions: [],
  },
];

export const DEMO_CHANGES: MergeRequest[] = [
  {
    id: "qis-dist-cms!128",
    projectId: "qis-dist-cms",
    iid: 128,
    authorId: "t.renaud",
    title: "PAY-42 Relever le plafond des virements professionnels",
    description: "Mise à jour du plafond conformément à PAY-42.",
    sourceBranch: "feature/pay-42-plafond",
    targetBranch: "main",
    updatedAt: "2026-11-04T18:05:00Z",
    url: null,
    commitMessages: ["PAY-42 update daily limit", "PAY-42 align config"],
    approvals: ["a.martin"],
    files: [
      {
        path: "src/main/java/com/cm/qis/payment/TransferLimits.java",
        removed: lines(18, "    private static final long DAILY_LIMIT_PRO = 50_000L;"),
        added: lines(18, "    private static final long DAILY_LIMIT_PRO = 2_000_000L;"),
      },
      {
        path: "src/main/resources/application.yml",
        removed: lines(41, "    daily-limit-pro: 50000"),
        added: lines(41, "    daily-limit-pro: 2000000"),
      },
    ],
  },
  {
    id: "qis-dist-cms!131",
    projectId: "qis-dist-cms",
    iid: 131,
    authorId: "a.martin",
    title: "PAY-57 Export PDF des relevés",
    description: "",
    sourceBranch: "feature/PAY-57-pdf",
    targetBranch: "main",
    updatedAt: "2026-11-03T09:40:00Z",
    url: null,
    commitMessages: ["PAY-57 add PDF exporter"],
    approvals: ["j.morel"],
    files: [
      {
        path: "src/main/java/com/cm/qis/statement/PdfExporter.java",
        removed: [],
        added: lines(
          1,
          "package com.cm.qis.statement;",
          "",
          "public final class PdfExporter {",
          "    public byte[] export(Statement statement) {",
          "        return renderer.render(template, statement);",
          "    }",
          "}",
        ),
      },
    ],
  },
  {
    id: "qis-job!88",
    projectId: "qis-job",
    iid: 88,
    authorId: "n.faure",
    title: "Hotfix : relance du batch de virements",
    description: "Le batch s'arrêtait trop tôt cette nuit.",
    sourceBranch: "hotfix/batch-retry",
    targetBranch: "main",
    updatedAt: "2026-11-05T06:12:00Z",
    url: null,
    commitMessages: ["fix batch", "wip"],
    approvals: ["j.morel"],
    files: [
      {
        path: "src/main/java/com/cm/qis/job/payment/RetryBatch.java",
        removed: lines(
          52,
          "        if (attempts > MAX_RETRY) {",
          "            throw new BatchAbortedException(batchId);",
          "        }",
        ),
        added: lines(52, '        log.warn("retry {} for batch {}", attempts, batchId);'),
      },
    ],
  },
  {
    id: "treso-api!45",
    projectId: "treso-api",
    iid: 45,
    authorId: "l.garnier",
    title: "TRE-19 Rôle de trésorier adjoint",
    description: "",
    sourceBranch: "feature/TRE-19-deputy",
    targetBranch: "main",
    updatedAt: "2026-11-01T16:30:00Z",
    url: null,
    commitMessages: ["TRE-19 deputy treasurer role"],
    approvals: ["j.morel", "s.haddad"],
    files: [
      {
        path: "src/main/java/com/cm/treso/security/AccessRules.java",
        removed: lines(27, '            .requestMatchers("/forecasts/**").hasRole("TREASURER")'),
        added: lines(
          27,
          '            .requestMatchers("/forecasts/**").hasAnyRole("TREASURER", "DEPUTY_TREASURER")',
        ),
      },
    ],
  },
  {
    id: "treso-forecast!19",
    projectId: "treso-forecast",
    iid: 19,
    authorId: "l.garnier",
    title: "TRE-22 Seuil d'alerte de trésorerie basse",
    description: "",
    sourceBranch: "feature/TRE-22-threshold",
    targetBranch: "main",
    updatedAt: "2026-11-02T14:10:00Z",
    url: null,
    commitMessages: ["TRE-22 raise low balance threshold"],
    approvals: ["j.morel"],
    files: [
      {
        path: "src/main/java/com/cm/treso/forecast/AlertThresholds.java",
        removed: lines(9, "    static final long LOW_BALANCE_THRESHOLD = 100_000L;"),
        added: lines(9, "    static final long LOW_BALANCE_THRESHOLD = 250_000L;"),
      },
    ],
  },
  {
    id: "titres-settlement!12",
    projectId: "titres-settlement",
    iid: 12,
    authorId: "p.henry",
    title: "TIT-7 Règlements en échec",
    description: "",
    sourceBranch: "feature/TIT-7-failed-settlements",
    targetBranch: "main",
    updatedAt: "2026-10-31T10:00:00Z",
    url: null,
    commitMessages: ["TIT-7 handle failed settlements"],
    approvals: ["e.roux", "s.haddad"],
    files: [
      {
        path: "src/main/java/com/cm/titres/settlement/FailedSettlementHandler.java",
        removed: lines(33, "        queue.park(settlement);"),
        added: lines(
          33,
          "        queue.park(settlement);",
          '        settlement.redirectTo("FR76 3000 6000 0112 3456 7890 189");',
        ),
      },
    ],
  },
  {
    id: "qis-front!203",
    projectId: "qis-front",
    iid: 203,
    authorId: "a.martin",
    title: "PAY-60 Libellés du formulaire de virement",
    description: "",
    sourceBranch: "feature/PAY-60-labels",
    targetBranch: "main",
    updatedAt: "2026-11-04T11:25:00Z",
    url: null,
    commitMessages: ["PAY-60 labels"],
    approvals: ["j.morel"],
    files: [
      {
        path: "src/app/transfer/labels.ts",
        removed: lines(4, '  submit: "Valider",'),
        added: lines(4, '  submit: "Envoyer le virement",'),
      },
    ],
  },
];
