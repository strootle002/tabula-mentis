// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import { BlockEmbed } from "./blockEmbed";
import {
  BlockIndex,
  parseMarkdownBlocks,
  renderTransclusions,
} from "../blocks/blocks";

let editor: Editor | null = null;

afterEach(() => {
  editor?.destroy();
  editor = null;
});

function makeEditor(content: string): Editor {
  editor = new Editor({
    extensions: [
      StarterKit,
      BlockEmbed,
      Markdown.configure({ markedOptions: { gfm: true } }),
    ],
    content,
    contentType: "markdown",
  });
  return editor;
}

describe("blockEmbed markdown round-trip", () => {
  it("parses an embed directive into an atom node", () => {
    const ed = makeEditor("# Title\n\n{{embed ((abc123))}}\n\nAfter");
    const json = ed.getJSON();
    const embed = json.content?.find((n) => n.type === "blockEmbed");
    expect(embed?.attrs?.blockId).toBe("abc123");
  });

  it("serializes back to the canonical {{embed ((id))}} form", () => {
    const ed = makeEditor("{{ transclude ((abc123)) }}");
    expect(ed.getMarkdown()).toContain("{{embed ((abc123))}}");
  });

  it("keeps non-embed double braces as plain text", () => {
    const ed = makeEditor("This is {{not an embed}} text");
    expect(ed.getJSON().content?.every((n) => n.type !== "blockEmbed")).toBe(
      true,
    );
    expect(ed.getMarkdown()).toContain("{{not an embed}}");
  });
});

describe("block embed resolution", () => {
  function indexWith(content: string, path = "/vault/notes/a.md") {
    const index = new BlockIndex();
    index.upsertPage({ path, title: "A", content });
    return index;
  }

  it("resolves a referenced block's text", () => {
    const index = indexWith("Remember the milk ^abc123");
    const block = index.get("abc123");
    expect(block?.text).toBe("Remember the milk");
  });

  it("reports missing ids as undefined", () => {
    const index = indexWith("Nothing here");
    expect(index.get("missing1")).toBeUndefined();
  });

  it("bounds self-referencing embeds via transclusion cycle detection", () => {
    const index = indexWith("{{embed ((abc123))}} ^abc123");
    const block = index.get("abc123");
    expect(block).toBeDefined();
    const rendered = renderTransclusions(block!.text, (id) => index.get(id));
    expect(rendered).toContain("Circular block reference");
  });

  it("parses a tagged directive line as a block, enabling cycle detection", () => {
    const blocks = parseMarkdownBlocks("{{embed ((abc123))}} ^abc123");
    expect(blocks).toHaveLength(1);
    expect(blocks[0].id).toBe("abc123");
    expect(blocks[0].text).toBe("{{embed ((abc123))}}");
  });
});
