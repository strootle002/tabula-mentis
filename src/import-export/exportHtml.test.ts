import { describe, expect, it } from "vitest";
import { mapOutlineToHtml, noteContentToHtml } from "./exportHtml";
import type { MindNode } from "../mindmap/types";

function node(text: string, children: MindNode[] = [], id = text): MindNode {
  return {
    id,
    text,
    children,
  } as MindNode;
}

describe("exportHtml", () => {
  it("exports a nested map outline", () => {
    const html = mapOutlineToHtml(
      "Plan",
      node("Root", [node("A", [node("A1")]), node("B")]),
    );
    expect(html).toContain("<title>Plan</title>");
    expect(html).toContain("<h1>Plan</h1>");
    expect(html).toContain("<li>Root");
    expect(html).toContain("<li>A1</li>");
    expect(html).toContain("<li>B</li>");
  });

  it("escapes HTML in node text", () => {
    const html = mapOutlineToHtml("T", node('<script>alert(1)</script>'));
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });

  it("does not infinite-loop on cyclic trees", () => {
    const root = node("Root", []);
    const child = node("Child", [root]);
    root.children = [child];
    const html = mapOutlineToHtml("Cycle", root);
    expect(html).toContain("Root");
    expect(html).toContain("Child");
  });

  it("exports note markdown as HTML", () => {
    const html = noteContentToHtml("Note", "# Hello\n\n**bold** text");
    expect(html).toContain("<h1>Hello</h1>");
    expect(html).toContain("<strong>bold</strong>");
  });
});
