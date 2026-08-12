import { mergeAttributes, Node } from "@tiptap/core";

export const BLOCK_EMBED_ID = "[A-Za-z0-9][A-Za-z0-9_-]{5,63}";
const EMBED_DIRECTIVE = new RegExp(
  `^\\{\\{\\s*(?:embed|transclude)\\s+\\(\\((${BLOCK_EMBED_ID})\\)\\)\\s*\\}\\}`,
  "i",
);

/** Block-level `{{embed ((id))}}` atom — live transclusion of a referenced block. */
export const BlockEmbed = Node.create({
  name: "blockEmbed",
  atom: true,
  group: "block",
  selectable: true,

  addAttributes() {
    return {
      blockId: {
        default: null,
        parseHTML: (el) => (el as HTMLElement).getAttribute("data-block-id"),
        renderHTML: (attrs) =>
          attrs.blockId ? { "data-block-id": String(attrs.blockId) } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-block-embed]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-block-embed": "" })];
  },

  markdownTokenName: "blockEmbed",

  markdownTokenizer: {
    name: "blockEmbed",
    level: "block" as const,
    start(src: string) {
      const match = /\{\{\s*(?:embed|transclude)\s+\(\(/i.exec(src);
      return match ? match.index : -1;
    },
    tokenize(src: string) {
      const match = EMBED_DIRECTIVE.exec(src);
      if (!match) return undefined;
      return { type: "blockEmbed", raw: match[0], blockId: match[1] };
    },
  },

  parseMarkdown(token, helpers) {
    const blockId = String(
      (token as { blockId?: string }).blockId ?? "",
    ).trim();
    if (!blockId) return [];
    return helpers.createNode("blockEmbed", { blockId });
  },

  renderMarkdown(node) {
    const blockId = String(node.attrs?.blockId ?? "").trim();
    return blockId ? `{{embed ((${blockId}))}}` : "";
  },
});
