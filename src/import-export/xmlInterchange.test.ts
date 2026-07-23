import { describe, expect, it } from "vitest";
import type { MindMapDocument } from "../mindmap/types";
import {
  detectXmlInterchange,
  exportFreeplane,
  exportOpml,
  importFreeplane,
  importOpml,
  XmlInterchangeError,
} from "./xmlInterchange";

const document: MindMapDocument = {
  version: 1,
  title: "Project & Plan",
  root: {
    id: "root-id",
    text: "Project & Plan",
    note: "Root <note>",
    style: { fill: "#ffeeaa", textColor: "#112233", fontSize: 18 },
    children: [
      {
        id: "child-id",
        text: "Child",
        note: "Details",
        style: { stroke: "#abcdef" },
        children: [],
      },
    ],
  },
  links: [{ id: "link-1", fromId: "root-id", toId: "child-id", label: "depends" }],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("Freeplane and OPML interchange", () => {
  it("round trips Freeplane hierarchy, IDs, notes, styles, and links", () => {
    const xml = exportFreeplane(document);
    const imported = importFreeplane(xml);
    expect(imported.root).toMatchObject({
      id: "root-id",
      text: "Project & Plan",
      note: "Root <note>",
      style: { fill: "#ffeeaa", textColor: "#112233", fontSize: 18 },
      children: [{ id: "child-id", text: "Child", note: "Details" }],
    });
    expect(imported.links).toEqual([
      { id: "link-1", fromId: "root-id", toId: "child-id", label: "depends" },
    ]);
  });

  it("round trips OPML hierarchy, IDs, notes, and app extension styles", () => {
    const imported = importOpml(exportOpml(document));
    expect(imported.title).toBe("Project & Plan");
    expect(imported.root).toMatchObject({
      id: "root-id",
      text: "Project & Plan",
      note: "Root <note>",
      style: { fill: "#ffeeaa", textColor: "#112233", fontSize: 18 },
      children: [
        {
          id: "child-id",
          text: "Child",
          note: "Details",
          style: { stroke: "#abcdef" },
        },
      ],
    });
  });

  it("rejects DTD/entity attacks, invalid XML, and configured limits", () => {
    const malicious =
      '<!DOCTYPE map [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><map><node TEXT="&xxe;"/></map>';
    expect(() => importFreeplane(malicious)).toThrow(XmlInterchangeError);
    expect(() => importOpml("<opml><body><outline></body></opml>")).toThrow("Invalid XML");
    expect(() =>
      importOpml(
        '<opml><body><outline text="a"><outline text="b"/></outline></body></opml>',
        { maxDepth: 0 },
      ),
    ).toThrow("depth");
  });

  it("round trips floating Freeplane nodes and cross-forest links", () => {
    const withFloating: MindMapDocument = {
      ...document,
      floatingNodes: [
        {
          id: "float-id",
          text: "Floating",
          children: [{ id: "float-child", text: "Leaf", children: [] }],
        },
      ],
      links: [
        ...document.links!,
        { id: "cross", fromId: "child-id", toId: "float-id", label: "see" },
      ],
    };
    const imported = importFreeplane(exportFreeplane(withFloating));
    expect(imported.floatingNodes).toHaveLength(1);
    expect(imported.floatingNodes?.[0]).toMatchObject({
      id: "float-id",
      text: "Floating",
      children: [{ id: "float-child", text: "Leaf" }],
    });
    expect(imported.links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "cross", fromId: "child-id", toId: "float-id" }),
      ]),
    );
  });

  it("round trips floating OPML outlines marked with _floating", () => {
    const withFloating: MindMapDocument = {
      ...document,
      floatingNodes: [
        { id: "float-id", text: "Floating", children: [] },
      ],
    };
    const imported = importOpml(exportOpml(withFloating));
    expect(imported.root).toMatchObject({ id: "root-id", text: "Project & Plan" });
    expect(imported.floatingNodes).toEqual([
      expect.objectContaining({ id: "float-id", text: "Floating" }),
    ]);
  });

  it("does not invent floating nodes for unmarked multi-outline OPML", () => {
    const imported = importOpml(
      `<opml version="2.0"><head><title>Bundle</title></head><body>
        <outline text="A"/><outline text="B"/>
      </body></opml>`,
    );
    expect(imported.floatingNodes).toBeUndefined();
    expect(imported.root.children.map((n) => n.text)).toEqual(["A", "B"]);
  });

  it("detects by extension and document root", () => {
    expect(detectXmlInterchange("map.mm", "")).toBe("freeplane");
    expect(detectXmlInterchange("outline.opml", "")).toBe("opml");
    expect(detectXmlInterchange("unknown.xml", "<opml version='2.0'/>")).toBe("opml");
  });
});
