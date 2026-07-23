import { describe, expect, it } from "vitest";
import type { MindMapDocument } from "../mindmap/types";
import {
  collectMapImageReferences,
  collectMarkdownImageReferences,
  selectConservativeOrphans,
} from "./orphanImages";

const document: MindMapDocument = {
  version: 1,
  title: "Images",
  root: {
    id: "root",
    text: "Root",
    images: [
      {
        id: "image",
        src: "assets/img-100-abc123.png",
        width: 40,
        height: 40,
      },
    ],
    children: [],
  },
  floatingNodes: [
    {
      id: "floating",
      text: "Floating",
      note: "![note](assets/img-200-def456.webp)",
      children: [],
    },
  ],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("orphan image selection", () => {
  it("collects node and node-note image references", () => {
    expect([...collectMapImageReferences([document])].sort()).toEqual([
      "assets/img-100-abc123.png",
      "assets/img-200-def456.webp",
    ]);
  });

  it("collects Markdown assets but ignores external URLs", () => {
    const result = collectMarkdownImageReferences(
      "![local](assets/img-300-aaa111.jpg)\n![remote](https://example.com/x.png)",
    );
    expect([...result.references]).toEqual(["assets/img-300-aaa111.jpg"]);
    expect(result.certain).toBe(true);
  });

  it("fails closed for uncertain Markdown", () => {
    const result = collectMarkdownImageReferences(
      "unfinished ![image](assets/img-400-bbb222.png",
    );
    expect(result.certain).toBe(false);
    expect(
      selectConservativeOrphans(
        ["img-400-bbb222.png"],
        result.references,
        result.certain,
      ),
    ).toEqual([]);
  });

  it("only selects unreferenced app-managed top-level images", () => {
    const references = new Set(["assets/img-100-abc123.png"]);
    expect(
      selectConservativeOrphans(
        [
          "img-100-abc123.png",
          "img-500-ccc333.gif",
          "family-photo.png",
          "img-600-ddd444.png.mindmap-backup",
        ],
        references,
      ),
    ).toEqual(["assets/img-500-ccc333.gif"]);
  });
});
