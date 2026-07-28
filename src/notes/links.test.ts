import { describe, expect, it } from "vitest";
import {
  backlinksForNote,
  buildTagForest,
  extractTags,
  extractWikiLinks,
  flattenTagForest,
  outgoingLinksForNote,
  relatedTags,
  resolveWikiTarget,
} from "./links";

describe("tags", () => {
  it("extracts hierarchical slash tags", () => {
    expect(extractTags("see #project/frontend and #idea")).toEqual([
      "project/frontend",
      "idea",
    ]);
  });

  it("extracts wiki targets without aliases", () => {
    expect(extractWikiLinks("See [[Alpha]] and [[Beta|label]]")).toEqual([
      "Alpha",
      "Beta",
    ]);
  });

  it("resolves wiki targets case-insensitively", () => {
    const index = [
      { name: "Alpha", path: "/a.md", content: "", folder: "", links: [], tags: [] },
    ];
    expect(resolveWikiTarget(index, "alpha")?.path).toBe("/a.md");
  });

  it("finds backlinks and outgoing links", () => {
    const index = [
      {
        name: "A",
        path: "/a.md",
        content: "[[B]]",
        folder: "",
        links: ["B"],
        tags: [],
      },
      {
        name: "B",
        path: "/b.md",
        content: "",
        folder: "",
        links: [],
        tags: [],
      },
    ];
    expect(backlinksForNote(index, "B").map((h) => h.name)).toEqual(["A"]);
    expect(outgoingLinksForNote(index, index[0])[0]?.resolved?.name).toBe("B");
  });

  it("computes related tags by co-occurrence", () => {
    const related = relatedTags(
      [
        {
          name: "A",
          path: "/a",
          content: "",
          folder: "",
          links: [],
          tags: ["alpha", "beta"],
        },
        {
          name: "B",
          path: "/b",
          content: "",
          folder: "",
          links: [],
          tags: ["alpha", "beta", "gamma"],
        },
        {
          name: "C",
          path: "/c",
          content: "",
          folder: "",
          links: [],
          tags: ["gamma"],
        },
      ],
      "alpha",
    );
    expect(related).toEqual([
      { tag: "beta", count: 2 },
      { tag: "gamma", count: 1 },
    ]);
  });

  it("builds a slash tag forest for indented browsing", () => {
    const forest = buildTagForest(["project", "project/frontend", "idea"]);
    const flat = flattenTagForest(forest);
    expect(flat.map((n) => ({ tag: n.tag, depth: n.depth }))).toEqual([
      { tag: "idea", depth: 0 },
      { tag: "project", depth: 0 },
      { tag: "project/frontend", depth: 1 },
    ]);
  });
});
