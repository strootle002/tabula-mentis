import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";
import { extractOutline, type OutlineItem } from "./outline";

function sameItems(a: OutlineItem[], b: OutlineItem[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (item, i) =>
        item.pos === b[i].pos &&
        item.level === b[i].level &&
        item.text === b[i].text,
    )
  );
}

function activeHeadingPos(items: OutlineItem[], from: number): number | null {
  let active: number | null = null;
  for (const item of items) {
    if (item.pos > from) break;
    active = item.pos;
  }
  return active;
}

/** Indented heading list with click-to-scroll and active-heading tracking. */
export function NoteOutline({ editor }: { editor: Editor | null }) {
  const [items, setItems] = useState<OutlineItem[]>([]);
  const [activePos, setActivePos] = useState<number | null>(null);

  useEffect(() => {
    if (!editor) {
      setItems([]);
      setActivePos(null);
      return;
    }
    const refresh = () => {
      const next = extractOutline(editor);
      setItems((prev) => (sameItems(prev, next) ? prev : next));
      const active = activeHeadingPos(next, editor.state.selection.from);
      setActivePos((prev) => (prev === active ? prev : active));
    };
    refresh();
    editor.on("update", refresh);
    editor.on("selectionUpdate", refresh);
    return () => {
      editor.off("update", refresh);
      editor.off("selectionUpdate", refresh);
    };
  }, [editor]);

  const jumpTo = (pos: number) => {
    if (!editor) return;
    editor.chain().focus().setTextSelection(pos + 1).run();
    const dom = editor.view.nodeDOM(pos);
    if (dom instanceof HTMLElement) {
      const reduced = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      dom.scrollIntoView({
        behavior: reduced ? "auto" : "smooth",
        block: "start",
      });
    }
  };

  if (!editor) return null;

  return (
    <>
      <h3>Outline</h3>
      {items.length === 0 ? (
        <p className="hint">
          No headings yet. Use H1–H3 to structure this note.
        </p>
      ) : (
        <div className="sidebar-list note-outline">
          {items.map((item) => (
            <button
              key={item.pos}
              type="button"
              className={`sidebar-item note-outline-item level-${item.level} ${activePos === item.pos ? "active" : ""}`}
              onClick={() => jumpTo(item.pos)}
              title={item.text || "(empty heading)"}
            >
              {item.text || "(empty heading)"}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
