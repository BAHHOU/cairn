import { describe, expect, it } from "vitest";
import { gitBlobSha, humanizeCondition, redact, scanRepository } from "./index";

const CI = `stages:
  - npm
  - mvn
  - sonar
  - docker
  - deploy

variables:
  APP_VERSION: $APP_DEPLOY_VERSION

workflow:
  rules:
    - if: $CI_PIPELINE_SOURCE != "merge_request_event"

install_dependencies:
  stage: npm
  image: reg.example/team/node:18.20.8-alpine
  script:
    - rm -rf node_modules package-lock.json
    - npm install
  artifacts:
    paths:
      - web/dist

build_backend:
  stage: mvn
  image: reg.example/library/maven:3.9.5-eclipse-temurin-21
  before_script:
    - export MAVEN_OPTS="-Dmaven.wagon.http.ssl.insecure=true"
  script:
    - mvn -DAPP_PASSWORD=$APP_REGISTRY_PASSWORD clean package
  artifacts:
    paths:
      - app/target/app.jar
    reports:
      junit:
        - "**/surefire-reports/TEST-*.xml"

sonar_scan:
  stage: sonar
  rules:
    - if: '$CI_COMMIT_BRANCH != null'
      when: on_success
      allow_failure: true
  image: reg.example/library/maven:3.9.5-eclipse-temurin-21
  script:
    - mvn -Dmaven.test.failure.ignore=true -Dsonar.login="$SONAR_TOKEN" sonar:sonar

build_images:
  stage: docker
  needs:
    - job: build_backend
  rules:
    - if: '$CI_COMMIT_BRANCH == "develop" || $CI_COMMIT_TAG != null'
      when: on_success
    - when: manual
  image:
    name: reg.example/kaniko/executor:debug-v1.0.0
  script:
    - /kaniko/executor --context . --dockerfile ./Dockerfile-web --destination reg.example/team/shop-app:$APP_ENV-$APP_VERSION

publish_to_nexus:
  stage: deploy
  image: reg.example/library/maven:3.9.5-eclipse-temurin-21
  rules:
    - if: '$CI_COMMIT_TAG =~ /release/'
      when: always
  script:
    - mvn -Dmaven.test.skip=true deploy
`;

const README = `# Shop

Shop is built using Java 8 and Spring Boot.

## Prerequisites

- WSL 2.6.3.1 (Including Debian) [WIN10]
- Node.js (download version that matches the one in the pipeline)
- JDK (same as the pipeline)

## Run the database

Start PostgreSQL and the broker:

\`\`\`
docker run --env MQ_APP_PASSWORD=hunter2hunter2 --publish 1414:1414 --name mq -d mq-local
\`\`\`

Console: https://localhost:9443/console (admin/passw0rdpass)

## Build

Compile with \`mvn clean install\` using \`config/missing.yml\` and \`app/pom.xml\`:

\`\`\`bash
mvn clean install -DskipTests
\`\`\`

**Do not commit** the settings file with real credentials.

## Run

Edit \`C:/dev/code/shop/application.yml\` then open http://localhost:8083/shop?token=abc123abc123
`;

const FILES: Record<string, string> = {
  ".gitlab-ci.yml": CI,
  "README.md": README,
  "pom.xml": `<project><modelVersion>4.0.0</modelVersion><groupId>com.acme</groupId><artifactId>shop</artifactId><version>1</version><packaging>pom</packaging><modules><module>app</module></modules></project>`,
  "app/pom.xml": `<project><modelVersion>4.0.0</modelVersion><groupId>com.acme</groupId><artifactId>app</artifactId><version>1</version></project>`,
  "app/src/main/java/com/acme/App.java": `package com.acme;
import org.springframework.boot.autoconfigure.SpringBootApplication;
@SpringBootApplication
public class App {}`,
  "Dockerfile-web": `FROM reg.example/jdk/jdk21:21.0.8
EXPOSE 8083
ADD app/target/app-1.jar ./shop-app.jar
ENTRYPOINT ["java","-jar","shop-app.jar"]`,
  "build/dev/config/application.yml": "server:\n  port: 8083\n",
  "build/int/config/application.yml": "server:\n  port: 8083\n",
};

const entries = (files: Record<string, string>) =>
  Object.entries(files)
    .map(([path, content]) => ({
      path,
      sha: gitBlobSha(content),
      bytes: Buffer.byteLength(content),
    }))
    .sort((a, b) => a.path.localeCompare(b.path));

const scan = (files: Record<string, string>) =>
  scanRepository({
    repositoryId: "repo-1",
    repoName: "acme/shop",
    provider: "gitlab",
    commit: "b".repeat(40),
    entries: entries(files),
    read: async (path) => Buffer.from(files[path] ?? ""),
    generatedAt: "2026-01-01T00:00:00.000Z",
  });

describe("delivery", () => {
  it("reads the pipeline: stages in order, one role per job", async () => {
    const { delivery } = await scan(FILES);
    expect(delivery?.stages.map((s) => s.name)).toEqual([
      "npm",
      "mvn",
      "sonar",
      "docker",
      "deploy",
    ]);
    const role = (name: string) =>
      delivery?.stages.flatMap((s) => s.jobs).find((j) => j.name === name)?.role;
    expect(role("install_dependencies")).toBe("build");
    expect(role("sonar_scan")).toBe("quality");
    expect(role("build_images")).toBe("package");
    expect(role("publish_to_nexus")).toBe("publish");
  });

  it("says how a job is triggered, in words", async () => {
    const { delivery } = await scan(FILES);
    const job = delivery?.stages.flatMap((s) => s.jobs).find((j) => j.name === "build_images");
    expect(job?.trigger).toBe("conditional");
    expect(job?.conditions).toEqual([
      "branche develop ou sur un tag → automatique",
      "sinon → manuel",
    ]);
    expect(job?.needs).toEqual(["build_backend"]);
    expect(humanizeCondition("$CI_COMMIT_TAG =~ /release/")).toBe("tag ~ release");
  });

  it("points at what the chain does not protect, with the line", async () => {
    const { delivery } = await scan(FILES);
    const ids = delivery?.findings.map((f) => f.id) ?? [];
    expect(ids).toContain("nonblocking-sonar_scan");
    expect(ids).toContain("failures-ignored-sonar_scan");
    expect(ids).toContain("tests-skipped-publish_to_nexus");
    expect(ids).toContain("runs-always-publish_to_nexus");
    expect(ids).toContain("lockfile-removed-install_dependencies");
    expect(ids).toContain("tls-unverified");
    expect(ids).toContain("no-merge-request-pipeline");
    expect(ids).toContain("no-security-job");
    expect(ids).toContain("no-environment-deploy");
    const sonar = delivery?.findings.find((f) => f.id === "nonblocking-sonar_scan");
    expect(sonar?.source).toEqual({ path: ".gitlab-ci.yml", line: 39 });
    expect(delivery?.mergeRequestPipelines).toBe(false);
  });

  it("describes the image, the variables and the environments", async () => {
    const { delivery } = await scan(FILES);
    expect(delivery?.images[0]).toMatchObject({
      repository: "team/shop-app",
      tag: "$APP_ENV-$APP_VERSION",
      dockerfile: "Dockerfile-web",
      exposes: [8083],
      jar: "app-1.jar",
      builtBy: "build_images",
    });
    const kinds = Object.fromEntries((delivery?.variables ?? []).map((v) => [v.name, v.kind]));
    expect(kinds).toMatchObject({
      CI_COMMIT_BRANCH: "gitlab",
      SONAR_TOKEN: "secret",
      APP_REGISTRY_PASSWORD: "secret",
      APP_ENV: "project",
    });
    expect(delivery?.environments.map((e) => e.name)).toEqual(["dev", "int"]);
  });

  it("is null when there is no pipeline file", async () => {
    const { delivery } = await scan({ "README.md": "# x" });
    expect(delivery).toBeNull();
  });
});

const DEPLOY_FILES: Record<string, string> = {
  ...FILES,
  "deploy/argocd/app.yaml": `apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: shop
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://deploy-bot:s3cretpass@git.example/acme/shop-gitops.git?token=abc
    path: charts/shop
    targetRevision: main
  destination:
    server: https://kubernetes.default.svc
    namespace: shop
  syncPolicy:
    automated:
      prune: true
`,
  "charts/shop/Chart.yaml": "apiVersion: v2\nname: shop\nversion: 0.1.0\n",
  "k8s/deployment.yaml": `apiVersion: apps/v1
kind: Deployment
metadata:
  name: shop-app
  namespace: shop
spec:
  template:
    spec:
      containers:
        - name: app
          image: reg.example/team/shop-app:1.0
`,
  "docker-compose.yml": `services:
  db:
    image: postgres:16
  app:
    image: reg.example/team/shop-app:1.0
    depends_on:
      - db
`,
};

describe("topology", () => {
  it("draws the whole chain, with the deployment part missing when nothing describes it", async () => {
    const { delivery } = await scan(FILES);
    const topology = delivery?.topology;
    expect(topology).toBeDefined();
    const byId = new Map((topology?.nodes ?? []).map((n) => [n.id, n]));
    expect(byId.get("repo")?.lane).toBe("source");
    expect(byId.get("ci")?.lane).toBe("pipeline");
    expect(byId.get("deploy-missing")?.basis).toBe("missing");
    expect(topology?.edges.some((e) => e.to === "deploy-missing" && e.basis === "missing")).toBe(
      true,
    );
    // every edge ends on a node that exists
    for (const e of topology?.edges ?? []) {
      expect(byId.has(e.from)).toBe(true);
      expect(byId.has(e.to)).toBe(true);
    }
    expect(topology?.gaps.length).toBeGreaterThan(0);
  });

  it("finds Argo CD, Helm, Kubernetes and Compose, and never keeps a credential from a repoURL", async () => {
    const { delivery } = await scan(DEPLOY_FILES);
    const topology = delivery?.topology;
    const ids = (topology?.nodes ?? []).map((n) => n.id);
    expect(ids).toContain("argocd");
    expect(ids).not.toContain("deploy-missing");
    const argo = topology?.nodes.find((n) => n.id === "argocd");
    expect(argo?.basis).toBe("found");
    expect(argo?.brand).toBe("argocd");
    const json = JSON.stringify(delivery);
    expect(json).not.toContain("s3cretpass");
    expect(json).not.toContain("token=abc");
  });
});

describe("onboarding", () => {
  it("pins tools from the build files and adds what the README lists", async () => {
    const { onboarding } = await scan(FILES);
    const tool = (id: string) => onboarding.tools.find((t) => t.id === id);
    expect(tool("jdk")).toMatchObject({ version: "21", basis: "pinned", check: "java -version" });
    expect(tool("maven")).toMatchObject({ version: "3.9.5", basis: "pinned" });
    expect(tool("node")).toMatchObject({ version: "18.20.8", basis: "pinned" });
    expect(tool("wsl")).toMatchObject({ version: "2.6.3.1", basis: "documented" });
    // The README names Node and the JDK too, but the pipeline already pins them.
    expect(onboarding.tools.filter((t) => t.id === "node")).toHaveLength(1);
  });

  it("turns the README commands into phased steps, with credentials masked", async () => {
    const { onboarding } = await scan(FILES);
    const services = onboarding.steps.find((s) => s.phase === "services");
    expect(services?.commands[0]).toContain("MQ_APP_PASSWORD=•••");
    expect(services?.source).toEqual({ path: "README.md", line: 15 });
    expect(onboarding.steps.some((s) => s.phase === "build")).toBe(true);
    expect(onboarding.warnings[0]?.text).toContain("Do not commit");
    expect(onboarding.localPaths[0]?.text).toContain("C:/dev/code/shop");
    expect(onboarding.urls.map((u) => u.url)).toContain("http://localhost:8083/shop");
  });

  it("lists the variables someone has to provide, never their values", async () => {
    const { onboarding } = await scan(FILES);
    const names = onboarding.secretsToObtain.map((s) => s.name);
    expect(names).toContain("SONAR_TOKEN");
    expect(names).toContain("APP_DEPLOY_VERSION");
    expect(names).not.toContain("CI_COMMIT_BRANCH");
  });
});

describe("documentation", () => {
  it("catches a README that contradicts the pipeline", async () => {
    const { docs } = await scan(FILES);
    const version = docs.drift.find((d) => d.id.startsWith("version-README.md-java"));
    expect(version?.title).toContain("Java 8");
    expect(version?.title).toContain("Java 21");
    expect(version?.source).toEqual({ path: "README.md", line: 3 });
  });

  it("catches a path that does not exist, and ignores the ones that do", async () => {
    const { docs } = await scan(FILES);
    const missing = docs.drift.filter((d) => d.id.startsWith("missing-"));
    expect(missing.map((m) => m.title)).toEqual([
      "`config/missing.yml` est cité mais n'existe pas",
    ]);
  });

  it("checks what a reader expects to find", async () => {
    const { docs } = await scan(FILES);
    const present = Object.fromEntries(docs.coverage.map((c) => [c.id, c.present]));
    expect(present).toMatchObject({
      readme: true,
      install: true,
      build: true,
      run: true,
      tests: false,
      license: false,
      api: false,
    });
    expect(docs.ai.every((a) => !a.present)).toBe(true);
    expect(docs.outline?.items[0]?.text).toBe("Shop");
  });
});

describe("what never leaves the scan", () => {
  it("keeps every credential written in the README and the pipeline out of the results", async () => {
    const result = await scan(FILES);
    const everything = JSON.stringify([result.delivery, result.onboarding, result.docs]);
    for (const secret of ["hunter2hunter2", "passw0rdpass", "abc123abc123"]) {
      expect(everything).not.toContain(secret);
    }
  });

  it("masks credential-looking values and URL queries", () => {
    expect(redact("PASSWORD: s3cret!")).toBe("PASSWORD: •••");
    expect(redact("https://user:pw123@host/x")).toBe("https://user:•••@host/x");
    expect(redact("badge ?token=sqb_0123456789abcdef0123456789abcdef01234567")).not.toContain(
      "sqb_0123",
    );
    expect(redact("see (src/main) here")).toBe("see (src/main) here");
  });
});
