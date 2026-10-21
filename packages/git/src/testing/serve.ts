import { startFakeForge } from "./fake-forge";

/**
 * Local stand-in for GitLab/GitHub, to try the import without any real server or token:
 *
 *   pnpm --filter @cairn/git forge            # GitLab-style on http://127.0.0.1:4010
 *   FORGE_KIND=github pnpm --filter @cairn/git forge
 *
 * Add `http://127.0.0.1:4010` to GIT_HOSTS, then import `http://127.0.0.1:4010/acme/payments-api`
 * with the token printed below. Real git over smart HTTP, real REST answers.
 */
const kind = process.env.FORGE_KIND === "github" ? "github" : "gitlab";
const token = process.env.FORGE_TOKEN || "demo-token";
const port = Number(process.env.FORGE_PORT) || 4010;

const forge = await startFakeForge({
  kind,
  token,
  port,
  repos: [
    {
      fullPath: "acme/payments-api",
      defaultBranch: "main",
      branches: {
        main: {
          "pom.xml": "<project><artifactId>payments-api</artifactId></project>",
          "src/main/java/App.java": "public class App {}",
          Dockerfile: "FROM eclipse-temurin:21",
          ".gitlab-ci.yml": "stages: [build, test]",
        },
        "release/2.1": {
          "k8s/kustomization.yaml": "resources: []",
          "src/main/java/Release.java": "public class Release {}",
        },
        "feature/sepa-instant": {
          "pyproject.toml": "[project]\nname = 'sepa-tools'",
          "tools/convert.py": "print('sepa')",
        },
      },
    },
  ],
});

console.log(`Fake ${kind} forge listening on ${forge.url}`);
console.log(`  GIT_HOSTS entry : http://${forge.host}`);
console.log(`  Repository      : ${forge.url}/acme/payments-api`);
console.log(`  Token           : ${token}`);
console.log("Press Ctrl+C to stop.");
process.on("SIGINT", () => {
  void forge.stop().then(() => process.exit(0));
});
