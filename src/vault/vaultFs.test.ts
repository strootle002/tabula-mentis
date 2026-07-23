import { describe, expect, it } from "vitest";
import {
  normalizeVaultRelativePath,
  validateVaultFileName,
} from "./vaultFs";

describe("vault path validation", () => {
  it("normalizes safe nested folders", () => {
    expect(normalizeVaultRelativePath(" Projects\\Research ")).toBe(
      "Projects/Research",
    );
    expect(normalizeVaultRelativePath("")).toBe("");
  });

  it.each([
    "../outside",
    "safe/../../outside",
    "/absolute",
    "C:\\absolute",
    "safe/./child",
    "safe//child",
  ])("rejects unsafe relative folder %s", (folder) => {
    expect(() => normalizeVaultRelativePath(folder)).toThrow();
  });

  it.each(["../note.md", "folder/note.md", "bad:name.md", "CON.md"])(
    "rejects unsafe filename %s",
    (fileName) => {
      expect(() => validateVaultFileName(fileName)).toThrow();
    },
  );

  it("accepts portable filenames", () => {
    expect(validateVaultFileName("Concept Graph.map.json")).toBe(
      "Concept Graph.map.json",
    );
  });
});
