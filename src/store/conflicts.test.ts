import { describe, expect, it } from "vitest";
import {
  decideExternalChange,
  isAtomicWriteArtifact,
  mapsMatchIgnoringUpdatedAt,
} from "./conflicts";

describe("external edit conflict transitions", () => {
  it("reloads a clean active document", () => {
    expect(decideExternalChange("note", "/notes/a.md", false, 10)).toEqual({
      type: "reload",
    });
  });

  it("preserves dirty local work and records a conflict", () => {
    expect(decideExternalChange("map", "/maps/a.map.json", true, 20)).toEqual({
      type: "conflict",
      conflict: {
        kind: "map",
        path: "/maps/a.map.json",
        detectedAt: 20,
      },
    });
  });

  it("recognizes this app's atomic write artifacts", () => {
    expect(isAtomicWriteArtifact("/notes/a.md.mindmap-tmp")).toBe(true);
    expect(isAtomicWriteArtifact("/maps/a.map.json.mindmap-backup")).toBe(true);
    expect(isAtomicWriteArtifact("/notes/a.md")).toBe(false);
  });

  it("treats timestamp-only map changes as an own-save echo", () => {
    const local = {
      version: 1 as const,
      title: "Map",
      root: { id: "root", text: "Map", children: [] },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    expect(
      mapsMatchIgnoringUpdatedAt(local, {
        ...local,
        updatedAt: "2026-07-22T12:00:00.000Z",
      }),
    ).toBe(true);
    expect(
      mapsMatchIgnoringUpdatedAt(local, {
        ...local,
        title: "Externally changed",
      }),
    ).toBe(false);
  });
});
