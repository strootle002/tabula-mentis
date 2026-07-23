import { describe, expect, it } from "vitest";
import {
  buildTagForest,
  extractTags,
  flattenTagForest,
  relatedTags,
} from "./links";

describe("tags", () => {
  it("extracts hierarchical slash tags", () => {
    expect(extractTags("see #project/frontend and #idea")).toEqual([
      "project/frontend",
      "idea",
    ]);
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
