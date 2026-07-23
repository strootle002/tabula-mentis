import { describe, expect, it } from "vitest";
import type { MindMapDocument } from "./types";
import {
  findNodeInDoc,
  placeNodeAsSiblingInDoc,
  reparentNodeInDoc,
} from "./mapDoc";

function document(): MindMapDocument {
  return {
    version: 1,
    title: "Test",
    root: {
      id: "root",
      text: "Root",
      children: [
        {
          id: "tree",
          text: "Tree",
          children: [{ id: "target", text: "Target", children: [] }],
        },
      ],
    },
    floatingNodes: [
      {
        id: "float",
        text: "Floating",
        children: [
          { id: "float-child", text: "Floating child", children: [] },
        ],
      },
    ],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("document-wide node moves", () => {
  it("attaches a floating root to the main tree", () => {
    const moved = reparentNodeInDoc(document(), "float", "tree");

    expect(moved.floatingNodes).toEqual([]);
    expect(
      findNodeInDoc(moved, "tree")?.children.map((node) => node.id),
    ).toContain("float");
    expect(findNodeInDoc(moved, "float-child")).not.toBeNull();
  });

  it("moves a tree node into a floating forest", () => {
    const moved = reparentNodeInDoc(document(), "target", "float");

    expect(findNodeInDoc(moved, "tree")?.children).toEqual([]);
    expect(
      findNodeInDoc(moved, "float")?.children.map((node) => node.id),
    ).toContain("target");
  });

  it("places siblings inside a floating forest", () => {
    const moved = placeNodeAsSiblingInDoc(
      document(),
      "target",
      "float-child",
      "before",
    );

    expect(
      findNodeInDoc(moved, "float")?.children.map((node) => node.id),
    ).toEqual(["target", "float-child"]);
  });

  it("rejects cycles without cloning the document", () => {
    const original = document();
    expect(reparentNodeInDoc(original, "tree", "target")).toBe(original);
  });
});
