import { describe, expect, it, vi } from "vitest";

vi.mock("../vault/imageAssets", () => ({
  assetDisplayUrl: (vault: string, path: string) =>
    `asset://${vault}/${path}`,
}));

import {
  markdownForEditor,
  splitMarkdownFrontmatter,
} from "./editorMarkdown";

describe("editor Markdown preparation", () => {
  it("separates and preserves YAML frontmatter exactly", () => {
    const source = [
      "---",
      "aliases: [Alpha]",
      "status: draft",
      "---",
      "# Heading",
      "",
    ].join("\n");

    expect(splitMarkdownFrontmatter(source)).toEqual({
      frontmatter: [
        "---",
        "aliases: [Alpha]",
        "status: draft",
        "---",
        "",
      ].join("\n"),
      body: "# Heading\n",
    });
  });

  it("does not mistake ordinary horizontal rules for frontmatter", () => {
    expect(splitMarkdownFrontmatter("Before\n\n---\n\nAfter")).toEqual({
      frontmatter: "",
      body: "Before\n\n---\n\nAfter",
    });
  });

  it("resolves vault images but leaves fenced code untouched", () => {
    const source = [
      "![diagram](assets/map.png)",
      "```md",
      "![literal](assets/code.png)",
      "```",
    ].join("\n");

    expect(markdownForEditor(source, "/vault")).toContain(
      '<img src="asset:///vault/assets/map.png" alt="diagram" data-asset="assets/map.png">',
    );
    expect(markdownForEditor(source, "/vault")).toContain(
      "![literal](assets/code.png)",
    );
  });
});
