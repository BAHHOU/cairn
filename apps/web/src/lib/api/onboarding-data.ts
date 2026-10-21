import type { ArchSource, ProjectOnboarding } from "@cairn/shared";

/**
 * Demo onboarding for the flagship project. Fictitious, but written the way the
 * real thing would have to be: every command cites the file it came from, every
 * duration is wall-clock on a machine that has never built this project, and the
 * failures are the ones that actually happen rather than the ones that are easy
 * to document.
 */

const MAIN = "qis-dist-cms";

const src = (path: string, note?: string, line?: number): ArchSource => ({
  repoId: MAIN,
  path,
  line,
  note,
});

export const QIS_ONBOARDING: ProjectOnboarding = {
  projectId: MAIN,
  repoId: MAIN,
  cloneUrl: "git@gitlab.interne:paiements/qis-dist-cms.git",
  maintainer: "Karim Benali — équipe Paiements",
  generatedAt: "2026-10-16T07:12:00.000Z",

  prereqs: [
    {
      id: "p-jdk",
      label: "JDK",
      version: "21 (Temurin)",
      check: "java -version",
      install: "Via le catalogue poste de travail, entrée « Temurin 21 LTS »",
      required: true,
      provenance: "extracted",
      sources: [src("pom.xml", "<maven.compiler.release>21</maven.compiler.release>", 24)],
    },
    {
      id: "p-maven",
      label: "Maven",
      version: "3.9 (ou le wrapper ./mvnw fourni)",
      check: "./mvnw -version",
      required: true,
      provenance: "extracted",
      sources: [src(".mvn/wrapper/maven-wrapper.properties")],
    },
    {
      id: "p-docker",
      label: "Docker Desktop",
      version: "≥ 4.30, WSL2 activé",
      check: "docker compose version",
      install: "Licence entreprise requise, à demander avec l'accès poste",
      required: true,
      provenance: "extracted",
      sources: [src("infra/docker-compose.yml")],
    },
    {
      id: "p-node",
      label: "Node.js",
      version: "22 LTS",
      check: "node -v",
      required: false,
      provenance: "extracted",
      sources: [src("package.json", "Uniquement pour l'interface qis-front", 3)],
    },
  ],

  accesses: [
    {
      id: "a-vpn",
      label: "VPN interne + accès GitLab",
      askWho: "Service desk (ticket « Accès développeur Paiements »)",
      leadTimeDays: 1,
      why: "Sans VPN, ni le dépôt ni le dépôt d'artefacts ne répondent.",
      blocking: true,
    },
    {
      id: "a-artifactory",
      label: "Compte Artifactory (Maven et npm)",
      askWho: "Équipe CAGIP Build, canal #artifactory",
      leadTimeDays: 2,
      why: "Le proxy d'entreprise bloque Maven Central et npmjs. Toutes les dépendances passent par Artifactory : sans ce compte, la toute première compilation échoue.",
      blocking: true,
    },
    {
      id: "a-mq",
      label: "File bac à sable sur le gestionnaire MQ de développement",
      askWho: "Exploitation Paiements",
      leadTimeDays: 3,
      why: "Le conteneur MQ local suffit pour la plupart des tâches, mais toute vérification de bout en bout avec l'amont SWIFT demande une file nominative.",
      blocking: false,
    },
    {
      id: "a-s3",
      label: "Jeton de lecture sur le dépôt S3 des fichiers RN",
      askWho: "Équipe CAGIP Stockage",
      leadTimeDays: 2,
      why: "L'injecteur démarre sans, mais ne trouvera aucun fichier à traiter.",
      blocking: false,
    },
  ],

  steps: [
    // ------------------------------------------------------------ récupération
    {
      id: "st-clone",
      phase: "recuperation",
      title: "Cloner le dépôt",
      command: "git clone git@gitlab.interne:paiements/qis-dist-cms.git\ncd qis-dist-cms",
      shell: "any",
      explanation:
        "Le dépôt principal contient l'API et l'injecteur. qis-job et qis-front sont des dépôts voisins, inutiles pour démarrer.",
      expect: "Un dossier qis-dist-cms contenant pom.xml, deploy/ et infra/.",
      durationMin: 2,
      provenance: "extracted",
      sources: [src("README.md")],
    },

    // ------------------------------------------------------------ configuration
    {
      id: "st-maven-settings",
      phase: "configuration",
      title: "Pointer Maven vers Artifactory",
      command:
        "cp infra/settings.xml.example ~/.m2/settings.xml\n# puis remplacer VOTRE_IDENTIFIANT et VOTRE_JETON",
      shell: "any",
      explanation:
        "Le proxy d'entreprise renvoie 407 sur Maven Central. Toutes les dépendances doivent passer par le miroir Artifactory, déclaré dans ce fichier.",
      expect: "./mvnw -version affiche la version sans erreur réseau.",
      durationMin: 5,
      provenance: "extracted",
      sources: [src("infra/settings.xml.example")],
    },
    {
      id: "st-env",
      phase: "configuration",
      title: "Créer le fichier d'environnement local",
      command: "cp .env.example .env",
      shell: "any",
      explanation:
        "Les valeurs par défaut pointent toutes vers les conteneurs locaux. Aucun secret de production n'est nécessaire pour développer.",
      expect: "Un fichier .env non suivi par git, avec QIS_DB_URL sur localhost:5432.",
      durationMin: 2,
      provenance: "extracted",
      sources: [src(".env.example")],
    },

    // ------------------------------------------------------------ services
    {
      id: "st-compose",
      phase: "services",
      title: "Démarrer PostgreSQL et IBM MQ",
      command: "docker compose -f infra/docker-compose.yml up -d",
      shell: "any",
      explanation:
        "Les deux dépendances d'infrastructure tournent en local. L'image MQ est volumineuse : le premier démarrage télécharge environ 1,2 Go.",
      expect:
        "docker compose ps montre qisdist-postgres et qisdist-mq en état healthy. MQ met environ 90 secondes à le devenir.",
      durationMin: 12,
      provenance: "extracted",
      sources: [src("infra/docker-compose.yml")],
    },
    {
      id: "st-migrate",
      phase: "services",
      title: "Appliquer les migrations de base",
      command: "./mvnw flyway:migrate",
      shell: "any",
      explanation: "Crée le schéma qisdist. À rejouer après chaque récupération de main.",
      expect: "« Successfully applied N migrations » et une table distribution présente.",
      durationMin: 3,
      provenance: "extracted",
      sources: [src("src/main/resources/db/migration/V1__init.sql")],
    },

    // ------------------------------------------------------------ exécution
    {
      id: "st-build",
      phase: "execution",
      title: "Première compilation",
      command: "./mvnw clean install -DskipTests",
      shell: "any",
      explanation:
        "Remplit le cache local. C'est l'étape la plus longue, et la seule qui le soit : les suivantes se comptent en secondes.",
      expect: "BUILD SUCCESS, et un fichier target/qis-dist-api.jar.",
      durationMin: 14,
      provenance: "extracted",
      sources: [src("pom.xml")],
    },
    {
      id: "st-run",
      phase: "execution",
      title: "Lancer l'API",
      command: "./mvnw spring-boot:run -Dspring-boot.run.profiles=local",
      shell: "any",
      explanation:
        "Le profil local désactive l'authentification OIDC et branche l'application sur les conteneurs démarrés plus haut.",
      expect: "« Started Application in … seconds » et l'API qui répond sur le port 8080.",
      durationMin: 2,
      provenance: "extracted",
      sources: [src("src/main/resources/application-local.yml")],
    },
    {
      id: "st-front",
      phase: "execution",
      title: "Lancer l'interface",
      command: "cd ../qis-front && npm ci && npm start",
      shell: "any",
      explanation:
        "Nécessaire uniquement pour travailler sur l'écran de suivi. L'API se teste très bien sans.",
      expect: "L'interface répond sur le port 4200 et appelle l'API locale.",
      durationMin: 8,
      optional: true,
      provenance: "extracted",
      sources: [src("package.json", undefined, 12)],
    },

    // ------------------------------------------------------------ vérification
    {
      id: "st-smoke",
      phase: "verification",
      title: "Vérifier de bout en bout",
      command: "./scripts/inject-sample.sh src/test/resources/samples/RN-20261016.txt",
      shell: "bash",
      explanation:
        "Dépose un fichier RN d'exemple dans la file d'entrée et suit son parcours jusqu'à la base.",
      expect:
        "Une ligne dans la table distribution avec le statut ENRICHED, et aucune entrée dans dead_letter.",
      durationMin: 4,
      provenance: "extracted",
      sources: [src("scripts/inject-sample.sh")],
    },
    {
      id: "st-tests",
      phase: "verification",
      title: "Lancer la suite de tests",
      command: "./mvnw verify",
      shell: "any",
      explanation:
        "Les tests d'intégration démarrent leurs propres conteneurs ; ils n'utilisent pas ceux lancés plus haut et ne les perturbent pas.",
      expect: "Tests run: … Failures: 0, Errors: 0.",
      durationMin: 11,
      provenance: "extracted",
      sources: [src("pom.xml", "Profil failsafe", 142)],
    },
  ],

  pitfalls: [
    {
      id: "pf-407",
      symptom:
        "Could not transfer artifact … Return code is: 407, ReasonPhrase: Proxy Authentication Required.",
      cause:
        "Maven essaie d'atteindre Maven Central directement. Le proxy d'entreprise refuse tout ce qui n'est pas le miroir Artifactory.",
      fix: "Vérifier que ~/.m2/settings.xml existe et que le bloc <mirrors> n'a pas été écrasé par une mise à jour du poste. C'est la panne la plus fréquente à l'arrivée.",
      command: "./mvnw -X help:effective-settings | Select-String mirror",
      sources: [src("infra/settings.xml.example")],
    },
    {
      id: "pf-mq-health",
      symptom: "L'application démarre puis boucle sur « MQRC_HOST_NOT_AVAILABLE ».",
      cause:
        "Le conteneur MQ accepte les connexions avant d'avoir fini d'initialiser son gestionnaire de files. L'application démarre trop tôt.",
      fix: "Attendre que docker compose ps affiche healthy, pas seulement running, puis relancer. Compter environ 90 secondes au premier démarrage.",
      command: "docker compose -f infra/docker-compose.yml ps",
      sources: [src("infra/docker-compose.yml", "healthcheck du service mq")],
    },
    {
      id: "pf-flyway",
      symptom: "Validate failed: migrations have failed validation.",
      cause:
        "Une migration a été modifiée après avoir été appliquée en local, souvent après un rebase sur main.",
      fix: "En local uniquement, remettre le schéma à zéro. Ne jamais exécuter cette commande ailleurs que sur votre poste.",
      command: "./mvnw flyway:clean flyway:migrate",
      sources: [src("src/main/resources/db/migration/V1__init.sql")],
    },
    {
      id: "pf-ports",
      symptom: "Web server failed to start. Port 8080 was already in use.",
      cause: "Une instance précédente tourne encore, ou un autre projet occupe le port.",
      fix: "Identifier le processus et l'arrêter, plutôt que de changer le port : le profil local et les scripts d'exemple supposent 8080.",
      command: "Get-NetTCPConnection -LocalPort 8080 -State Listen",
      sources: [src("src/main/resources/application-local.yml")],
    },
  ],

  firstIssueIds: ["i07", "i16"],
};

export const ONBOARDINGS: Record<string, ProjectOnboarding> = {
  [MAIN]: QIS_ONBOARDING,
};
