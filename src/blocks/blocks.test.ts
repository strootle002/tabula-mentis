import { describe, expect, it } from "vitest";
import {
  BlockIndex,
  ensureExplicitBlockIds,
  extractBlockReferences,
  parseMarkdownBlocks,
  renderTransclusions,
} from "./blocks";

describe("Markdown blocks", () => {
  it("recognizes persisted IDs while leaving source untouched", () => {
    const source = "# Heading\n\nParagraph text ^existing-1\n\n- Task item\n";
    const blocks = parseMarkdownBlocks(source, "notes/A.md");
    expect(blocks).toMatchObject([
      { id: "existing-1", explicitId: true, kind: "paragraph", text: "Paragraph text" },
      { explicitId: false, kind: "list-item", text: "Task item" },
    ]);
    expect(source).toBe("# Heading\n\nParagraph text ^existing-1\n\n- Task item\n");
  });

  it("adds deterministic IDs only through explicit migration", () => {
    const source = "First paragraph\n\n- List item";
    const first = ensureExplicitBlockIds(source, "notes/A.md");
    const second = ensureExplicitBlockIds(source, "notes/A.md");
    expect(first).toEqual(second);
    expect(first.addedIds).toHaveLength(2);
    expect(ensureExplicitBlockIds(first.content, "notes/A.md").addedIds).toEqual([]);
  });

  it("indexes references and protects transclusion cycles and depth", () => {
    const index = new BlockIndex();
    index.upsertPage({
      path: "A.md",
      title: "A",
      content: "Alpha embeds {{embed ((block-b))}} ^block-a",
    });
    index.upsertPage({
      path: "B.md",
      title: "B",
      content: "Beta embeds {{embed ((block-a))}} ^block-b",
    });

    expect(extractBlockReferences("See ((block-a)) and ((block-a))")).toEqual(["block-a"]);
    expect(
      renderTransclusions("{{embed ((block-a))}}", (id) => index.get(id)),
    ).toContain("Circular block reference: block-a");
    expect(
      renderTransclusions("{{embed ((block-a))}}", (id) => index.get(id), {
        maxDepth: 1,
      }),
    ).toContain("depth limit");
    expect(
      renderTransclusions("{{embed ((missing-id))}}", (id) => index.get(id)),
    ).toBe("[Missing block: missing-id]");
  });
});
