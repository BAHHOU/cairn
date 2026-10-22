import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { detectStack } from "./stack";

let dir: string | undefined;

afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = undefined;
});

describe("detectStack", () => {
  it("detects technologies deterministically and ignores node_modules", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "cairn-scan-"));
    await writeFile(path.join(dir, "pom.xml"), "<project/>");
    await writeFile(path.join(dir, "Dockerfile"), "FROM scratch");
    await mkdir(path.join(dir, "node_modules/x"), { recursive: true });
    await writeFile(path.join(dir, "node_modules/x/package.json"), "{}");

    const first = await detectStack(dir);
    const second = await detectStack(dir);
    expect(first).toEqual(second);
    expect(first.technologies).toEqual(["docker", "java-maven"]);
    expect(first.fileCount).toBe(2);
  });
});
