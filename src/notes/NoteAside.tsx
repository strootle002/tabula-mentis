import { useAppStore } from "../store/appStore";

/** Right-hand note tips panel (tags-focused; collapsible). */
export function NoteAside() {
  return (
    <aside className="note-aside">
      <h3>Tips</h3>
      <p className="hint">
        Tag ideas with <code>#tag</code> or nested <code>#parent/child</code>.
        Click a tag to open its page. Web links use{" "}
        <code>[label](https://…)</code> and open in your browser.
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
