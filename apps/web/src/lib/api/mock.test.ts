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
