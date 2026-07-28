import { describe, expect, it } from "vitest";
import { mapLayoutToSvg, mapLayoutToVisualHtml } from "./exportMapHtml";
import type { LayoutResult } from "../mindmap/types";
import type { ExportPngColors } from "./exportPng";

const colors: ExportPngColors = {
  canvas: "#ebe7df",
  edge: "#958b7c",
  accent: "#1a7a62",
  textMuted: "#7a7166",
  nodeFill: "#f4f1ea",
  nodeStroke: "#5a5348",
  nodeText: "#3a342c",
  bgElevated: "#f0ebe3",
};

/** 1×1 PNG */
const TINY_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function sampleLayout(withImage = false): LayoutResult {
  return {
    width: 400,
    height: 200,
    nodes: [
      {
        id: "r",
        text: "Root",
        images: withImage
          ? [
              {
                id: "img1",
                src: "assets/tiny.png",
                width: 40,
                height: 40,
              },
            ]
          : [],
        collapsed: false,
        style: {},
        x: 20,
        y: 40,
        width: 120,
        height: withImage ? 100 : 36,
        depth: 0,
        parentId: null,
        childIds: ["a"],
        hasChildren: true,
      },
      {
        id: "a",
        text: "Child <B>",
        images: [],
        collapsed: false,
        style: {},
        x: 200,
        y: 80,
        width: 100,
        height: 36,
        depth: 1,
        parentId: "r",
        childIds: [],
        hasChildren: false,
      },
    ],
    edges: [
      {
        fromId: "r",
        toId: "a",
        x1: 140,
        y1: 90,
        x2: 200,
        y2: 98,
        kind: "tree",
      },
    ],
  };
}

describe("exportMapHtml", () => {
  it("emits an SVG with nodes and edges", async () => {
    const svg = await mapLayoutToSvg(sampleLayout(), {
      layoutStyle: "right",
      colors,
    });
    expect(svg).toContain("<svg");
    expect(svg).toContain("Root");
    expect(svg).toContain("&lt;B&gt;");
    expect(svg).toContain("<path d=");
    expect(svg).toContain("<rect");
  });

  it("wraps the SVG in a standalone HTML document", async () => {
    const html = await mapLayoutToVisualHtml("My Map", sampleLayout(), {
      layoutStyle: "right",
      colors,
    });
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("<title>My Map</title>");
    expect(html).toContain("<svg");
    expect(html).toContain("Root");
  });

  it("embeds node images as data URLs", async () => {
    const imageDataUrls = new Map<string, string | null>([
      ["assets/tiny.png", TINY_PNG_DATA_URL],
    ]);
    const svg = await mapLayoutToSvg(sampleLayout(true), {
      layoutStyle: "right",
      colors,
      imageDataUrls,
    });
    expect(svg).toContain("<image href=");
    expect(svg).toContain(TINY_PNG_DATA_URL);
  });
});
