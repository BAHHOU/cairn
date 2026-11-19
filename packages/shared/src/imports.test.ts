import { describe, expect, it } from "vitest";
import { IMPORT_QUEUE_STALL_MS, IMPORT_RUN_STALL_MS, isImportStalled } from "./imports";

const T0 = Date.parse("2026-11-19T12:00:00Z");
const at = (ms: number) => new Date(T0 + ms).toISOString();

describe("isImportStalled", () => {
  it("flags a queued run nobody picked up", () => {
    const view = { status: "queued" as const, createdAt: at(0), startedAt: null };
    expect(isImportStalled(view, T0 + 30_000)).toBe(false);
    expect(isImportStalled(view, T0 + IMPORT_QUEUE_STALL_MS + 1)).toBe(true);
  });

  it("flags a run stuck in cloning or scanning, timed from its start", () => {
    const view = { status: "scanning" as const, createdAt: at(0), startedAt: at(60 * 60_000) };
    expect(isImportStalled(view, T0 + 60 * 60_000 + 60_000)).toBe(false);
    expect(isImportStalled(view, T0 + 60 * 60_000 + IMPORT_RUN_STALL_MS + 1)).toBe(true);
  });

  it("never flags a finished run", () => {
    for (const status of ["done", "failed"] as const) {
      expect(isImportStalled({ status, createdAt: at(0), startedAt: at(0) }, T0 + 86_400_000)).toBe(
        false,
      );
    }
  });
});
