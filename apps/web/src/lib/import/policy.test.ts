import { ROLES } from "@cairn/shared";
import { describe, expect, it } from "vitest";
import { mayImport } from "./policy";

describe("mayImport", () => {
  it("only the superadmin may import, in any mode", () => {
    for (const role of ROLES) {
      for (const production of [false, true]) {
        const allowed = mayImport(role, { production, demo: false });
        expect(allowed, `${role} production=${production}`).toBe(role === "superadmin");
      }
    }
  });

  it("refuses even the superadmin when the role comes from the demo cookie in production", () => {
    expect(mayImport("superadmin", { production: true, demo: true })).toBe(false);
  });

  it("allows the demo superadmin while developing", () => {
    expect(mayImport("superadmin", { production: false, demo: true })).toBe(true);
  });
});
