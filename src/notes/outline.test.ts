// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import { extractOutline } from "./outline";

let editor: Editor | null = null;

afterEach(() => {
  editor?.destroy();
  editor = null;
});

function makeEditor(content: string): Editor {
  editor = new Editor({
    extensions: [
      StarterKit,
      Markdown.configure({ markedOptions: { gfm: true } }),
    ],
    content,
    contentType: "markdown",
  });
  return editor;
}

describe("extractOutline", () => {
  it("collects H1–H3 headings in document order", () => {
    const ed = makeEditor(
      "# One\n\nPara\n\n## Two\n\n### Three\n\n#### Four\n\n# Five",
    );
    const outline = extractOutline(ed);
    expect(outline.map((i) => [i.level, i.text])).toEqual([
      [1, "One"],
      [2, "Two"],
      [3, "Three"],
      [1, "Five"],
    ]);
  });

  it("returns ascending document positions", () => {
    const ed = makeEditor("# One\n\n## Two\n\n## Three");
    const outline = extractOutline(ed);
    expect(outline.map((i) => i.pos)).toEqual(
      [...outline.map((i) => i.pos)].sort((a, b) => a - b),
    );
    expect(outline[0].pos).toBe(0);
  });

  it("returns an empty outline for notes without headings", () => {
    const ed = makeEditor("Just a paragraph.\n\n- a list item");
    expect(extractOutline(ed)).toEqual([]);
  });
});
