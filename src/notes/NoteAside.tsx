import { useMemo } from "react";
import type { Editor } from "@tiptap/react";
import { useAppStore } from "../store/appStore";
import {
  backlinksForNote,
  outgoingLinksForNote,
  resolveWikiTarget,
} from "./links";
import { NoteOutline } from "./NoteOutline";
import { isNodeNotesPath, isTagNotesPath } from "../vault/vaultFs";

/** Right-hand note panel: outline, backlinks, outgoing links, and tips. */
export function NoteAside({ editor }: { editor: Editor | null }) {
  const activeNotePath = useAppStore((s) => s.activeNotePath);
  const activeNoteName = useAppStore((s) => s.activeNoteName);
  const noteIndex = useAppStore((s) => s.noteIndex);
  const openNote = useAppStore((s) => s.openNote);
  const createNote = useAppStore((s) => s.createNote);
  const pushToast = useAppStore((s) => s.pushToast);

  const libraryIndex = useMemo(
    () =>
      noteIndex.filter(
        (n) => !isNodeNotesPath(n.folder) && !isTagNotesPath(n.folder),
      ),
    [noteIndex],
  );

  const current = useMemo(
    () => libraryIndex.find((n) => n.path === activeNotePath) ?? null,
    [libraryIndex, activeNotePath],
  );

  const backlinks = useMemo(
    () =>
      activeNoteName
        ? backlinksForNote(libraryIndex, activeNoteName, activeNotePath)
        : [],
    [libraryIndex, activeNoteName, activeNotePath],
  );

  const outgoing = useMemo(
    () => outgoingLinksForNote(libraryIndex, current),
    [libraryIndex, current],
  );

  const openOrCreate = (target: string) => {
    const hit = resolveWikiTarget(libraryIndex, target);
    if (hit) {
      void openNote(hit.path);
      return;
    }
    void createNote(target).then(() => {
      pushToast(`Created note “${target}”`, "success");
    });
  };

  return (
    <aside className="note-aside">
      <NoteOutline editor={editor} />

      <h3>Linked from</h3>
      {backlinks.length === 0 ? (
        <p className="hint">No other notes link here yet.</p>
      ) : (
        <div className="sidebar-list note-aside-list">
          {backlinks.map((hit) => (
            <button
              key={hit.path}
              type="button"
              className="sidebar-item"
              onClick={() => void openNote(hit.path)}
            >
              {hit.folder ? `${hit.folder}/` : ""}
              {hit.name}
            </button>
          ))}
        </div>
      )}

      <h3>Outgoing links</h3>
      {outgoing.length === 0 ? (
        <p className="hint">
          Add <code>[[Note Name]]</code> in this note to link out.
        </p>
      ) : (
        <div className="sidebar-list note-aside-list">
          {outgoing.map((row) => (
            <button
              key={row.target}
              type="button"
              className={`sidebar-item ${row.resolved ? "" : "missing-link"}`}
              title={
                row.resolved
                  ? `Open ${row.resolved.name}`
                  : `Create note “${row.target}”`
              }
              onClick={() => openOrCreate(row.target)}
            >
              {row.resolved ? row.resolved.name : `${row.target} (new)`}
            </button>
          ))}
        </div>
      )}

      <h3>Tips</h3>
      <p className="hint">
        Use <code>[[Note]]</code> or <code>[[Note|Label]]</code> for wiki
        links. Tag with <code>#tag</code>. Web links use{" "}
        <code>[label](https://…)</code>.
      </p>
    </aside>
  );
}

export function NoteAsideToggle() {
  const noteAsideOpen = useAppStore((s) => s.noteAsideOpen);
  const toggleNoteAside = useAppStore((s) => s.toggleNoteAside);
  return (
    <button
      type="button"
      className={`panel-toggle-btn ${noteAsideOpen ? "is-open" : ""}`}
      onClick={toggleNoteAside}
      title={
        noteAsideOpen ? "Hide the right note panel" : "Show the right note panel"
      }
    >
      {noteAsideOpen ? "Hide panel ›" : "‹ Show panel"}
    </button>
  );
}
