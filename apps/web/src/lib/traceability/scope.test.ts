import { describe, expect, it } from "vitest";
import { parseScope } from "./scope";

describe("parsing a board scope", () => {
  it("accepts what people paste from each tool", () => {
    expect(parseScope("azure", "https://dev.azure.com/acme/Payments%20Core/_boards/board")).toEqual(
      {
        project: "Payments Core",
      },
    );
    expect(parseScope("youtrack", "PAY")).toEqual({ query: "project: PAY" });
    expect(parseScope("redmine", "https://rm.example/projects/payments/issues")).toEqual({
      project: "payments",
    });
    expect(parseScope("asana", "https://app.asana.com/0/1201234567890/list")).toEqual({
      project: "1201234567890",
    });
    expect(parseScope("clickup", "https://app.clickup.com/9012345/v/li/901234567")).toEqual({
      list: "901234567",
    });
    expect(
      parseScope(
        "plane",
        "https://app.plane.so/acme/projects/0F8C1D2E-3A4B-4C5D-8E9F-001122334455/issues",
      ),
    ).toEqual({ project: "0f8c1d2e-3a4b-4c5d-8e9f-001122334455" });
    expect(parseScope("monday", "https://acme.monday.com/boards/1234567890/views/5")).toEqual({
      board: "1234567890",
    });
    expect(parseScope("shortcut", "team:payments")).toEqual({ query: "team:payments" });
  });

  it("refuses what is not a scope", () => {
    expect(parseScope("asana", "my project")).toBeNull();
    expect(parseScope("plane", "WEB")).toBeNull();
    expect(parseScope("monday", "board")).toBeNull();
  });
});
