import { useEffect, useMemo, useState } from "react";
import type { Editor } from "@tiptap/react";
import { useAppStore } from "../store/appStore";
import { isNodeNotesPath, isTagNotesPath } from "../vault/vaultFs";

/**
 * Autocomplete popup when the caret is inside an unfinished `[[query`.
 * Completing inserts `[[Name]]` which the WikiLink input rule then marks.
 */
export function WikiLinkSuggest({ editor }: { editor: Editor | null }) {
  const noteIndex = useAppStore((s) => s.noteIndex);
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!editor) return;
    const sync = () => {
      const { from } = editor.state.selection;
      const textBefore = editor.state.doc.textBetween(
        Math.max(0, from - 80),
        from,
        "\n",
        "\n",
      );
      const match = /\[\[([^\]]*)$/.exec(textBefore);
      if (!match || textBefore.includes("]]", textBefore.lastIndexOf("[["))) {
        setQuery(null);
        return;
      }
      setQuery(match[1] ?? "");
      setActive(0);
    };
    editor.on("selectionUpdate", sync);
    editor.on("update", sync);
    return () => {
      editor.off("selectionUpdate", sync);
      editor.off("update", sync);
    };
  }, [editor]);

  const suggestions = useMemo(() => {
    if (query == null) return [];
    const q = query.toLowerCase();
    return noteIndex
      .filter(
        (n) =>
          !isNodeNotesPath(n.folder) &&
          !isTagNotesPath(n.folder) &&
          (!q || n.name.toLowerCase().includes(q)),
      )
      .slice(0, 8);
  }, [noteIndex, query]);

  if (query == null || !editor) return null;

  const insert = (name: string) => {
    const { from } = editor.state.selection;
    const textBefore = editor.state.doc.textBetween(
      Math.max(0, from - 80),
      from,
      "\n",
      "\n",
    );
    const match = /\[\[([^\]]*)$/.exec(textBefore);
    if (!match) return;
    const start = from - match[0].length;
    editor
      .chain()
      .focus()
      .deleteRange({ from: start, to: from })
      .insertContent(`[[${name}]]`)
      .run();
    setQuery(null);
  };

  return (
    <div
      className="wiki-suggest"
      role="listbox"
      aria-label="Wiki link suggestions"
      onKeyDown={(e) => {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setActive((i) => Math.min(suggestions.length - 1, i + 1));
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setActive((i) => Math.max(0, i - 1));
        } else if (e.key === "Enter" && suggestions[active]) {
          e.preventDefault();
          insert(suggestions[active].name);
        } else if (e.key === "Escape") {
          setQuery(null);
        }
      }}
    >
      {suggestions.length === 0 ? (
        <p className="hint">No matching notes</p>
      ) : (
        suggestions.map((note, i) => (
          <button
            key={note.path}
            type="button"
            role="option"
            aria-selected={i === active}
            className={`wiki-suggest-item ${i === active ? "active" : ""}`}
            onMouseEnter={() => setActive(i)}
            onMouseDown={(e) => {
              e.preventDefault();
              insert(note.name);
            }}
          >
            {note.folder ? `${note.folder}/` : ""}
            {note.name}
          </button>
        ))
      )}
    </div>
  );
}
