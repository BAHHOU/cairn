import { can, ROLES, type Role, type Viewer } from "@cairn/shared";
import { describe, expect, it } from "vitest";
import { createMockApi } from "./mock";

const viewer = (role: Role): Viewer => ({ name: "Test", role, team: "Paiements" });

describe("mock API visibility rules", () => {
  it("never gives tokens, euros or quotas to the dev role", async () => {
    const api = createMockApi(viewer("dev"));
    expect(await api.tokens.summary()).toBeNull();

    const issues = await api.issues.list();
    expect(issues.length).toBeGreaterThan(0);
    for (const issue of issues) expect(issue).not.toHaveProperty("wastedTokensMonth");
  });

  it("scopes the dev role to its own team", async () => {
    const api = createMockApi(viewer("dev"));
    const projects = await api.projects.list();
    expect(projects.length).toBeGreaterThan(0);
    expect(projects.every((p) => p.team === "Paiements")).toBe(true);
    expect(await api.projects.get("treso-api")).toBeNull();
  });

  it("exposes tokens exactly to the roles allowed to see them", async () => {
    for (const role of ROLES) {
      const summary = await createMockApi(viewer(role)).tokens.summary();
      expect(summary !== null).toBe(can(role, "see.tokens"));
      if (summary) expect(summary.euros !== undefined).toBe(can(role, "see.euros"));
    }
  });
});

describe("mock change control", () => {
  it("gives each demo merge request the verdict its story calls for", async () => {
    const list = await createMockApi(viewer("admin")).changes.list();
    const verdicts = Object.fromEntries(list.map((c) => [`${c.projectId}!${c.iid}`, c.verdict]));
    expect(verdicts).toEqual({
      "qis-dist-cms!128": "blocked",
      "qis-job!88": "blocked",
      "titres-settlement!12": "blocked",
      "treso-api!45": "review",
      "treso-forecast!19": "review",
      "qis-dist-cms!131": "pass",
      "qis-front!203": "pass",
    });
    // The most urgent first.
    expect(list.map((c) => c.verdict)).toEqual([
      "blocked",
      "blocked",
      "blocked",
      "review",
      "review",
      "pass",
      "pass",
    ]);
  });

  it("only shows a developer the merge requests of their team", async () => {
    const api = createMockApi(viewer("dev"));
    const list = await api.changes.list();
    expect(new Set(list.map((c) => c.projectId))).toEqual(
      new Set(["qis-dist-cms", "qis-job", "qis-front"]),
    );
    expect(await api.changes.get("treso-api", 45)).toBeNull();
  });

  it("reviews the spec rewritten after approval as blocked, against the approved text", async () => {
    const review = await createMockApi(viewer("admin")).changes.get("qis-dist-cms", 128);
    const kinds = review?.evaluation.findings.map((f) => f.kind);
    expect(kinds).toContain("spec.rewrittenByAuthor");
    expect(kinds).toContain("change.amountNotInSpec");
    expect(review?.specs.map((s) => s.key)).toEqual(["PAY-42"]);
    expect(review?.zones.map((z) => z.id)).toEqual(["payments"]);
  });
});
