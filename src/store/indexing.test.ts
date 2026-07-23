import { describe, expect, it } from "vitest";
import type { MindMapDocument, MindNode } from "../mindmap/types";
import {
  extractMapNodeTags,
  flattenMapTags,
  removeMapTagIndex,
  removeNoteIndex,
  upsertMapTagIndex,
  upsertNoteIndex,
} from "./indexing";

const node = (id: string, note = "", children: MindNode[] = []): MindNode => ({
  id,
  text: id,
  note,
  children,
});

const map = (root: MindNode, floatingNodes?: MindNode[]): MindMapDocument => ({
  version: 1,
  title: "Map",
  root,
  floatingNodes,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

describe("incremental vault indexes", () => {
  it("upserts and removes one note without changing other entries", () => {
    const first = upsertNoteIndex([], {
      name: "A",
      path: "/notes/A.md",
      folder: "",
    }, "Links [[B]] #one");
    const withOther = upsertNoteIndex(first, {
      name: "B",
      path: "/notes/B.md",
      folder: "",
    }, "#two");
    const updated = upsertNoteIndex(withOther, {
      name: "A",
      path: "/notes/A.md",
      folder: "",
    }, "Links [[C]] #three");

    expect(updated).toHaveLength(2);
    expect(updated[0]).toMatchObject({ links: ["C"], tags: ["three"] });
    expect(updated[1]).toBe(withOther[1]);
    expect(removeNoteIndex(updated, "/notes/A.md")).toEqual([updated[1]]);
  });

  it("indexes root, descendants, and floating node forests", () => {
    const doc = map(
      node("root", "#root", [node("child", "#child")]),
      [node("floating", "#floating", [node("nested", "#nested")])],
    );
    expect(extractMapNodeTags(doc)).toEqual([
      "child",
      "floating",
      "nested",
      "root",
    ]);
  });

  it("replaces and removes each map contribution independently", () => {
    let index = upsertMapTagIndex({}, "/maps/a.map.json", map(node("a", "#old")));
    index = upsertMapTagIndex(index, "/maps/b.map.json", map(node("b", "#shared")));
    index = upsertMapTagIndex(index, "/maps/a.map.json", map(node("a", "#new #shared")));
    expect(flattenMapTags(index)).toEqual(["new", "shared"]);
    expect(flattenMapTags(removeMapTagIndex(index, "/maps/b.map.json"))).toEqual([
      "new",
      "shared",
    ]);
  });
});
