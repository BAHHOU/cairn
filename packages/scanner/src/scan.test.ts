import { describe, expect, it } from "vitest";
import { gitBlobSha, scanRepository } from "./index";

const SECRET = "hunter2hunter2";

const FILES: Record<string, string> = {
  "pom.xml": `<project><modelVersion>4.0.0</modelVersion><groupId>com.acme</groupId><artifactId>shop</artifactId><version>1</version><packaging>pom</packaging>
<modules><module>common</module><module>app</module></modules></project>`,
  "common/pom.xml": `<project><modelVersion>4.0.0</modelVersion><groupId>com.acme</groupId><artifactId>common</artifactId><version>1</version>
<dependencies><dependency><groupId>org.postgresql</groupId><artifactId>postgresql</artifactId></dependency></dependencies></project>`,
  "app/pom.xml": `<project><modelVersion>4.0.0</modelVersion><groupId>com.acme</groupId><artifactId>app</artifactId><version>1</version>
<dependencies>
<dependency><groupId>com.acme</groupId><artifactId>common</artifactId><version>1</version></dependency>
<dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-web</artifactId></dependency>
<dependency><groupId>com.ibm.mq</groupId><artifactId>mq-jms-spring-boot-starter</artifactId></dependency>
</dependencies></project>`,
  "app/src/main/java/com/acme/App.java": `package com.acme;
import org.springframework.boot.autoconfigure.SpringBootApplication;
@SpringBootApplication
public class App { public static void main(String[] a) {} }`,
  "app/src/main/java/com/acme/web/OrderController.java": `package com.acme.web;
import com.acme.service.OrderService;
import com.acme.data.OrderRepository;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping("/orders")
public class OrderController {
  @GetMapping public String list() { return ""; }
}`,
  "app/src/main/java/com/acme/service/OrderService.java": `package com.acme.service;
import com.acme.data.OrderRepository;
import org.springframework.stereotype.Service;
@Service
public class OrderService {}`,
  "common/src/main/java/com/acme/data/OrderRepository.java": `package com.acme.data;
import org.springframework.data.jpa.repository.JpaRepository;
public interface OrderRepository extends JpaRepository<OrderEntity, Long> {}`,
  "common/src/main/java/com/acme/data/OrderEntity.java": `package com.acme.data;
import jakarta.persistence.*;
@Entity
@Table(name = "orders")
public class OrderEntity { @Id Long id; }`,
  "app/src/main/resources/application.yml": `servers:
  mq:
    queue-name-in: DEV.ORDERS.IN
spring:
  datasource:
    password: \${DB_PASSWORD}
`,
  ".gitlab-ci.yml": `stages: [build]
build_app:
  stage: build
  script:
    - mvn package
`,
};

const entries = (files: Record<string, string>) =>
  Object.entries(files)
    .map(([path, content]) => ({
      path,
      sha: gitBlobSha(content),
      bytes: Buffer.byteLength(content),
    }))
    .sort((a, b) => a.path.localeCompare(b.path));

const run = (
  files: Record<string, string>,
  previous?: Parameters<typeof scanRepository>[0]["previous"],
) =>
  scanRepository({
    repositoryId: "repo-1",
    repoName: "acme/shop",
    provider: "gitlab",
    commit: "a".repeat(40),
    entries: entries(files),
    read: async (path) => Buffer.from(files[path] ?? ""),
    generatedAt: "2026-01-01T00:00:00.000Z",
    ...(previous ? { previous } : {}),
  });

describe("scanRepository", () => {
  it("counts the structure of a Spring Boot project", async () => {
    const { report } = await run(FILES);
    expect(report.stats.files).toBe(Object.keys(FILES).length);
    expect(report.stats.structure.controllers).toBe(1);
    expect(report.stats.structure.services).toBe(1);
    expect(report.stats.structure.repositories).toBe(1);
    expect(report.stats.structure.entities).toBe(1);
    expect(report.stats.structure.endpoints).toBe(1);
  });

  it("builds the architecture from what the code and the configuration say", async () => {
    const { architecture } = await run(FILES);
    const ids = architecture.nodes.map((n) => n.id);
    expect(ids).toContain("ctr-app");
    expect(ids).toContain("ctr-common");
    expect(ids).toContain("db-postgres");
    expect(ids).toContain("q-dev-orders-in");
    expect(ids).toContain("pipe-ci");

    const queue = architecture.edges.find(
      (e) => e.target === "ctr-app" && e.source === "q-dev-orders-in",
    );
    expect(queue?.label).toBe("consomme");
    // Said inferred: nothing in the code ties the key to a listener.
    expect(queue?.provenance).toBe("inferred");

    // The driver arrives through the `common` module: the application still talks to the database.
    expect(
      architecture.edges.some((e) => e.source === "ctr-app" && e.target === "db-postgres"),
    ).toBe(true);
    expect(architecture.repos.at(-1)?.id).toBe("externe");
    expect(architecture.contract.validatedBy).toBe("");
  });

  it("flags a controller that reaches a repository directly", async () => {
    const { architecture } = await run(FILES);
    expect(architecture.violations).toHaveLength(1);
    expect(architecture.violations[0]?.rule).toBe("Expérience → Infrastructure");
  });

  it("derives tables and keeps imports aggregated in the code map", async () => {
    const { codeGraph } = await run(FILES);
    const table = codeGraph.nodes.find((n) => n.kind === "table");
    expect(table?.label).toBe("orders");
    expect(codeGraph.nodes.some((n) => n.kind === "class" && n.label === "OrderController")).toBe(
      true,
    );
    expect(codeGraph.edges.every((e) => ["imports", "reads", "configures"].includes(e.kind))).toBe(
      true,
    );
  });

  it("reports where a secret is, never what it is", async () => {
    const files = {
      ...FILES,
      "app/src/main/resources/application.yml":
        FILES["app/src/main/resources/application.yml"]?.replace("$" + "{DB_PASSWORD}", SECRET) ??
        "",
    };
    const result = await run(files);
    const finding = result.report.findings.find((f) => f.key === "spring.datasource.password");
    expect(finding).toMatchObject({
      rule: "hardcoded-secret",
      path: "app/src/main/resources/application.yml",
      line: 6,
    });
    const everything = JSON.stringify(result);
    expect(everything).not.toContain(SECRET);
  });

  it("only re-reads the files whose hash changed", async () => {
    const first = await run(FILES);
    expect(first.report.incremental).toMatchObject({
      mode: "full",
      analysed: Object.keys(FILES).length,
      reused: 0,
    });

    const previous = { commit: "a".repeat(40), files: first.files };
    const same = await run(FILES, previous);
    expect(same.report.incremental).toMatchObject({
      mode: "incremental",
      analysed: 0,
      reused: Object.keys(FILES).length,
    });

    const changed = {
      ...FILES,
      "app/src/main/java/com/acme/service/OrderService.java": `${FILES["app/src/main/java/com/acme/service/OrderService.java"]}\n// edit`,
    };
    delete (changed as Record<string, string | undefined>)[".gitlab-ci.yml"];
    const next = await run(changed, previous);
    expect(next.report.incremental).toMatchObject({ analysed: 1, removed: 1 });
    expect(next.architecture.nodes.some((n) => n.id === "pipe-ci")).toBe(false);
  });

  it("is deterministic", async () => {
    const a = await run(FILES);
    const b = await run(FILES);
    expect({ ...a.report, durationMs: 0 }).toEqual({ ...b.report, durationMs: 0 });
    expect(a.architecture).toEqual(b.architecture);
    expect(a.codeGraph).toEqual(b.codeGraph);
  });
});
