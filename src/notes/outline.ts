import type { Editor } from "@tiptap/core";

export interface OutlineItem {
  level: number;
  text: string;
  /** Document position of the heading node. */
  pos: number;
}

/** Heading levels shown in the outline, matching the note toolbar's H1–H3. */
export function extractOutline(editor: Editor): OutlineItem[] {
  const items: OutlineItem[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== "heading") return true;
    const level = Number(node.attrs.level);
    if (level >= 1 && level <= 3) {
      items.push({ level, text: node.textContent, pos });
    }
    return false;
  });
  return items;
}
