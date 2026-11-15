import { describe, expect, it } from "vitest";
import { splitProjectName } from "./project-name";

describe("splitProjectName", () => {
  it("splits an imported repository into group, name and branch", () => {
    expect(splitProjectName("weguidee/bridge-crm@feature-partners")).toEqual({
      path: "weguidee/bridge-crm",
      short: "bridge-crm",
      namespace: "weguidee",
      branch: "feature-partners",
    });
  });

  it("keeps nested groups together", () => {
    expect(splitProjectName("TBS/CMS/QIS/qis-dist@main").namespace).toBe("TBS/CMS/QIS");
  });

  it("returns a demo project's plain name as is", () => {
    expect(splitProjectName("Paiements")).toEqual({
      path: "Paiements",
      short: "Paiements",
      namespace: null,
      branch: null,
    });
  });
});
