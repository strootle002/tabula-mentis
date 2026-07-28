import { describe, expect, it } from "vitest";
import type { MindMapDocument } from "../mindmap/types";
import {
  mapSearchDocuments,
  replaceMapInIndex,
  VaultSearchIndex,
} from "./searchIndex";

const map = (title: string, childText: string): MindMapDocument => ({
  version: 1,
  title,
  root: {
    id: "root",
    text: "Overview",
    children: [{ id: "child", text: childText, note: "#urgent details", children: [] }],
  },
  floatingNodes: [
    { id: "floating", text: "Independent idea", note: "satellite", children: [] },
  ],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

describe("VaultSearchIndex", () => {
  it("ranks exact titles above content and returns useful snippets", () => {
    const index = new VaultSearchIndex();
    index.upsert({
      id: "note:a",
      kind: "note",
      title: "Architecture",
      content: "A short page",
      path: "notes/Architecture.md",
    });
    index.upsert({
      id: "note:b",
      kind: "note",
      title: "Meeting",
      content: "Discuss the architecture proposal tomorrow",
      path: "notes/Meeting.md",
    });

    const results = index.search("architecture");
    expect(results.map((result) => result.id)).toEqual(["note:a", "note:b"]);
    expect(results[1].snippet).toContain("architecture proposal");
  });

  it("snippets accented text using original offsets after NFKD matching", () => {
    const index = new VaultSearchIndex();
    index.upsert({
      id: "note:cafe",
      kind: "note",
      title: "Trip",
      content: "Discuss café architecture with the team",
      path: "notes/Trip.md",
    });

    const results = index.search("cafe");
    expect(results).toHaveLength(1);
    expect(results[0].snippet).toContain("café");
    expect(results[0].snippet).toContain("architecture");
  });

  it("updates one document without rebuilding unrelated entries", () => {
    const index = new VaultSearchIndex();
    index.upsert({
      id: "note:a",
      kind: "note",
      title: "A",
      content: "oldterm",
      path: "A.md",
    });
    index.upsert({
      id: "note:b",
      kind: "note",
      title: "B",
      content: "keepterm",
      path: "B.md",
    });
    index.upsert({
      id: "note:a",
      kind: "note",
      title: "A",
      content: "newterm",
      path: "A.md",
    });

    expect(index.search("oldterm")).toEqual([]);
    expect(index.search("newterm")[0].id).toBe("note:a");
    expect(index.search("keepterm")[0].id).toBe("note:b");
  });

  it("indexes descendants and floating nodes and replaces stale map nodes", () => {
    const index = new VaultSearchIndex();
    const first = map("Plan", "First version");
    expect(mapSearchDocuments("maps/plan.map.json", first)).toHaveLength(4);
    const ids = replaceMapInIndex(index, "maps/plan.map.json", first);
    expect(index.search("satellite")[0].nodeId).toBe("floating");

    replaceMapInIndex(index, "maps/plan.map.json", map("Plan", "Replacement"), ids);
    expect(index.search("first")).toEqual([]);
    expect(index.search("replacement")[0].nodeId).toBe("child");
  });

  it("indexes the map-as-tag slug so Ctrl+K finds the map and root", () => {
    const docs = mapSearchDocuments("maps/plan.map.json", map("Plan", "Child"));
    const mapDoc = docs.find((document) => document.kind === "map");
    const rootDoc = docs.find((document) => document.nodeId === "root");
    expect(mapDoc?.tags).toEqual(["overview"]);
    expect(rootDoc?.tags).toEqual(["overview"]);

    const index = new VaultSearchIndex();
    replaceMapInIndex(index, "maps/plan.map.json", map("Plan", "Child"));
    const hits = index.search("overview");
    expect(hits.some((hit) => hit.kind === "map")).toBe(true);
    expect(hits.some((hit) => hit.nodeId === "root")).toBe(true);
  });

  it("indexes hyphenated root-tag slugs that title tokens alone would miss", () => {
    const doc: MindMapDocument = {
      version: 1,
      title: "Plan",
      root: {
        id: "root",
        text: "My Research Plan",
        children: [],
      },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const index = new VaultSearchIndex();
    replaceMapInIndex(index, "maps/plan.map.json", doc);
    const hits = index.search("my-research-plan");
    expect(hits.map((hit) => hit.kind).sort()).toEqual(["map", "node"]);
    expect(hits.find((hit) => hit.kind === "node")?.nodeId).toBe("root");
  });
});
