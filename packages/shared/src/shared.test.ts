import { describe, expect, it } from "vitest";
import { can, provenanceOf, usageEventSchema } from "./index";

describe("roles", () => {
  it("never lets a developer see tokens or euros", () => {
    expect(can("dev", "see.tokens")).toBe(false);
    expect(can("dev", "see.euros")).toBe(false);
  });
  it("keeps euros away from admin", () => {
    expect(can("admin", "see.euros")).toBe(false);
    expect(can("superadmin", "see.euros")).toBe(true);
  });
});

describe("usage", () => {
  it("has no user field", () => {
    expect("user" in usageEventSchema.shape).toBe(false);
  });
  it("labels gateway usage as measured and estimates as estimated", () => {
    expect(provenanceOf("gateway")).toBe("measured");
    expect(provenanceOf("estimate")).toBe("estimated");
  });
});
