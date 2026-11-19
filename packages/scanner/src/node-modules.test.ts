import { describe, expect, it } from "vitest";
import { gitBlobSha, scanRepository } from "./index";
import { layerOfModule } from "./node-modules";

const FILES: Record<string, string> = {
  "package.json": JSON.stringify({ name: "rea", dependencies: { zod: "4" } }),
  "src/domain/result.ts": "export type Result = { ok: boolean };\n",
  "src/application/run.ts":
    'import { Result } from "../domain/result.js";\nexport const run = (): Result => ({ ok: true });\n',
  "src/cli/main.ts": 'import { run } from "../application/run.js";\nrun();\n',
  "src/ghidra/bridge.ts":
    'import { Result } from "../domain/result.js";\nexport const g = (): Result => ({ ok: true });\n',
  "tests/conformance/fixture.ts": 'import { run } from "../../src/application/run.js";\n',
  ".github/ISSUE_TEMPLATE/config.yml":
    "contact_links:\n  - name: Docs\n    url: https://github.com/acme/rea/discussions\n",
};

const scan = () =>
  scanRepository({
    repositoryId: "repo-1",
    repoName: "acme/rea",
    provider: "github",
    commit: "b".repeat(40),
    entries: Object.entries(FILES)
      .map(([path, content]) => ({
        path,
        sha: gitBlobSha(content),
        bytes: Buffer.byteLength(content),
      }))
      .sort((a, b) => a.path.localeCompare(b.path)),
    read: async (path) => Buffer.from(FILES[path] ?? ""),
    generatedAt: "2026-01-01T00:00:00.000Z",
  });

describe("TypeScript architecture", () => {
  it("draws one box per src folder, in its layer, linked by imports", async () => {
    const { architecture } = await scan();
    const mods = architecture.nodes.filter((n) => n.id.startsWith("mod-"));
    expect(mods.map((n) => n.label).sort()).toEqual(["application", "cli", "domain", "ghidra"]);
    const layer = (label: string) => mods.find((n) => n.label === label)?.layer;
    expect(layer("domain")).toBe("domaine");
    expect(layer("cli")).toBe("experience");
    expect(layer("ghidra")).toBe("infrastructure");

    const link = (from: string, to: string) =>
      architecture.edges.some((e) => e.source === `mod-${from}` && e.target === `mod-${to}`);
    expect(link("src-cli", "src-application")).toBe(true);
    expect(link("src-application", "src-domain")).toBe(true);
    expect(link("src-ghidra", "src-domain")).toBe(true);
  });

  it("names the system after its main language and ignores tests and forge settings", async () => {
    const { architecture } = await scan();
    const sys = architecture.nodes.find((n) => n.kind === "system");
    expect(sys?.tech[0]).toBe("TypeScript");
    expect(architecture.nodes.some((n) => /tests|conformance/.test(n.id))).toBe(false);
    expect(architecture.nodes.some((n) => n.kind === "external")).toBe(false);
  });

  it("reads layers from usual folder names", () => {
    expect(layerOfModule("contracts")).toBe("domaine");
    expect(layerOfModule("composition")).toBe("application");
    expect(layerOfModule("server")).toBe("experience");
    expect(layerOfModule("sqlite")).toBe("infrastructure");
  });
});
