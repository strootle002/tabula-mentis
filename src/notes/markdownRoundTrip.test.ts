// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import { VaultImage } from "./imageSupport";
import { HashTag } from "./wikiAndTags";

let editor: Editor | null = null;

afterEach(() => {
  editor?.destroy();
  editor = null;
});

describe("Tiptap Markdown round-trip", () => {
  it("preserves links, nested lists, fenced code, and tags", () => {
    const source = [
      "# Heading",
      "",
      "- Parent",
      "  - Child",
      "",
      "[ordinary link](https://example.com)",
      "",
      "```ts",
      "const value = 1",
      "```",
      "",
      "See #idea.",
    ].join("\n");

    editor = new Editor({
      extensions: [
        StarterKit,
        VaultImage,
        HashTag,
        Markdown.configure({ markedOptions: { gfm: true } }),
      ],
      content: source,
      contentType: "markdown",
    });

    const result = editor.getMarkdown();
    expect(result).toContain("[ordinary link](https://example.com)");
    expect(result).toContain("- Parent\n  - Child");
    expect(result).toContain("```ts\nconst value = 1\n```");
    expect(result).toContain("#idea");
  });

  it("serializes displayed vault images back to portable paths", () => {
    editor = new Editor({
      extensions: [StarterKit, VaultImage, Markdown],
      content:
        '<img src="asset://localhost/resolved.png" alt="Diagram" data-asset="assets/diagram.png">',
      contentType: "markdown",
    });

    expect(editor.getMarkdown()).toContain(
      "![Diagram](assets/diagram.png)",
    );
  });
});
