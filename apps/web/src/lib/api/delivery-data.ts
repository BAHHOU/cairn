import type { ArchSource, DeliveryPipeline } from "@cairn/shared";

/**
 * Demo delivery chain for the flagship project. Fictitious, like everything else
 * in the mock, but shaped like a real GitLab pipeline: a shared CI part, then one
 * lane per environment, with the gates where they actually sit.
 *
 * The numbers are deliberately uncomfortable. A seed where the chain is healthy
 * would demonstrate the rendering and nothing else; the point of the page is to
 * make the waiting and the missing barriers visible, so the seed has both.
 */

const MAIN = "qis-dist-cms";

const src = (path: string, note?: string, line?: number): ArchSource => ({
  repoId: MAIN,
  path,
  line,
  note,
});

const CI = ".gitlab-ci.yml";

export const QIS_DELIVERY: DeliveryPipeline = {
  projectId: MAIN,
  repoId: MAIN,
  provider: "GitLab CI",
  commit: "a3f91c2",
  generatedAt: "2026-10-16T07:12:00.000Z",

  stages: [
    // ------------------------------------------------------------ shared CI
    {
      id: "s-build",
      label: "Compilation Maven",
      kind: "build",
      trigger: "auto",
      durationP50Min: 4,
      durationP90Min: 9,
      blocking: true,
      provenance: "extracted",
      sources: [src(CI, "Job build:api", 18)],
    },
    {
      id: "s-unit",
      label: "Tests unitaires",
      kind: "test",
      trigger: "auto",
      durationP50Min: 6,
      durationP90Min: 8,
      blocking: true,
      provenance: "extracted",
      sources: [src(CI, "Job test:unit", 34)],
    },
    {
      id: "s-integration",
      label: "Tests d'intégration",
      kind: "test",
      trigger: "auto",
      durationP50Min: 11,
      durationP90Min: 23,
      blocking: true,
      condition: "Testcontainers : PostgreSQL et IBM MQ éphémères",
      provenance: "extracted",
      sources: [src(CI, "Job test:it", 47)],
    },
    {
      id: "s-sonar",
      label: "Analyse SonarQube",
      kind: "quality",
      trigger: "auto",
      durationP50Min: 3,
      blocking: true,
      condition: "Porte qualité : couverture ≥ 70 % sur le code modifié",
      provenance: "extracted",
      sources: [src(CI, "Job quality:sonar", 66)],
    },
    {
      id: "s-sast",
      label: "Analyse de sécurité (SAST)",
      kind: "security",
      trigger: "auto",
      durationP50Min: 5,
      // The whole point of the seed: this runs, publishes, and stops nothing.
      blocking: false,
      condition: "allow_failure: true",
      provenance: "extracted",
      sources: [src(CI, "Job security:sast — allow_failure: true", 79)],
    },
    {
      id: "s-package",
      label: "Image conteneur",
      kind: "package",
      trigger: "auto",
      durationP50Min: 3,
      durationP90Min: 6,
      blocking: true,
      provenance: "extracted",
      sources: [src(CI, "Job package:image (Kaniko)", 91)],
    },

    // ------------------------------------------------------------ dev
    {
      id: "s-deploy-dev",
      label: "Déploiement dev",
      kind: "deploy",
      trigger: "auto",
      envId: "env-dev",
      durationP50Min: 2,
      blocking: true,
      provenance: "extracted",
      sources: [src(CI, "Job deploy:dev", 108)],
    },

    // ------------------------------------------------------------ homologation
    {
      id: "s-deploy-hom",
      label: "Déploiement homologation",
      kind: "deploy",
      trigger: "manual",
      envId: "env-hom",
      durationP50Min: 3,
      blocking: true,
      condition: "Uniquement depuis main",
      provenance: "extracted",
      sources: [src(CI, "Job deploy:hom — when: manual", 119)],
    },
    {
      id: "s-smoke-hom",
      label: "Tests de bon fonctionnement",
      kind: "verify",
      trigger: "auto",
      envId: "env-hom",
      durationP50Min: 4,
      blocking: true,
      provenance: "extracted",
      sources: [src(CI, "Job verify:hom", 131)],
    },

    // ------------------------------------------------------------ production
    {
      id: "s-deploy-prod",
      label: "Bascule production",
      kind: "deploy",
      trigger: "manual",
      envId: "env-prod",
      durationP50Min: 6,
      durationP90Min: 14,
      blocking: true,
      condition: "Fenêtre de bascule : 18 h – 20 h, hors jours de place",
      provenance: "extracted",
      sources: [src(CI, "Job deploy:prod — when: manual", 142)],
    },
    {
      id: "s-verify-prod",
      label: "Contrôle post-bascule",
      kind: "verify",
      trigger: "auto",
      envId: "env-prod",
      durationP50Min: 5,
      blocking: true,
      condition: "Vérifie la profondeur des files et le premier message traité",
      provenance: "extracted",
      sources: [src(CI, "Job verify:prod", 158)],
    },
  ],

  environments: [
    {
      id: "env-dev",
      label: "Développement",
      rank: 0,
      url: "https://qis-dev.interne",
      replicas: 1,
      dataKind: "synthetic",
      approval: { required: false },
      deploysNodeIds: ["app-api", "app-injector", "app-front", "k8s-dev"],
      current: { version: "2026.10.16-a3f91c2", deployedAt: "2026-10-16T07:31:00.000Z" },
      provenance: "extracted",
      sources: [src("deploy/overlays/dev/kustomization.yaml")],
    },
    {
      id: "env-hom",
      label: "Homologation",
      rank: 1,
      url: "https://qis-hom.interne",
      replicas: 2,
      dataKind: "anonymised",
      approval: {
        required: true,
        // Nobody is named: the risk rules pick this up.
        waitP50Min: 240,
        note: "Le job est manuel, mais aucun rôle n'est attaché dans la configuration.",
      },
      deploysNodeIds: ["app-api", "app-injector", "app-worker", "app-front", "k8s-hom"],
      current: { version: "2026.10.14-7cd01be", deployedAt: "2026-10-14T16:02:00.000Z" },
      provenance: "extracted",
      sources: [src("deploy/overlays/hom/kustomization.yaml")],
    },
    {
      id: "env-prod",
      label: "Production",
      rank: 2,
      url: "https://qis.interne",
      replicas: 3,
      dataKind: "production",
      approval: {
        required: true,
        who: "Responsable d'exploitation Paiements",
        waitP50Min: 1620,
        note: "Validation en comité de mise en production, le mardi et le jeudi.",
      },
      deploysNodeIds: ["app-api", "app-injector", "app-worker", "app-front", "k8s-prod"],
      current: { version: "2026.10.07-4b1aa90", deployedAt: "2026-10-07T18:24:00.000Z" },
      provenance: "extracted",
      sources: [src("deploy/overlays/prod/kustomization.yaml")],
    },
  ],

  rollback: {
    how: "Réappliquer l'étiquette d'image précédente via le job rollback:prod, puis rejouer les messages de la file de rebut.",
    durationMin: 12,
    testedAt: "2026-09-18T18:00:00.000Z",
    provenance: "declared",
    sources: [src("docs/exploitation/runbook.md", "Section « Retour arrière »")],
  },
};

export const DELIVERIES: Record<string, DeliveryPipeline> = {
  [MAIN]: QIS_DELIVERY,
};
