import { describe, expect, it } from "vitest";
import { diffWords } from "./text-diff";

describe("diffWords", () => {
  it("shows a changed amount as one replacement", () => {
    expect(diffWords("jusqu'à 50 000 € par jour", "jusqu'à 2 000 000 € par jour")).toEqual([
      { kind: "same", text: "jusqu'à " },
      { kind: "removed", text: "50 000" },
      { kind: "added", text: "2 000 000" },
      { kind: "same", text: " € par jour" },
    ]);
  });

  it("returns one unchanged part for identical texts", () => {
    expect(diffWords("Export PDF", "Export PDF")).toEqual([{ kind: "same", text: "Export PDF" }]);
  });

  it("keeps both texts recoverable from the parts", () => {
    const before = "Créer un rôle sans droit de validation.";
    const after = "Créer un rôle adjoint avec droit de validation.";
    const parts = diffWords(before, after);
    const keep = (kind: "added" | "removed") =>
      parts
        .filter((p) => p.kind !== kind)
        .map((p) => p.text)
        .join("");
    expect(keep("added")).toBe(before);
    expect(keep("removed")).toBe(after);
  });
});
