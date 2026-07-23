import { useEffect, useMemo, useRef } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown } from "@tiptap/markdown";
import { useAppStore } from "../store/appStore";
import { notesWithTag } from "../notes/links";
import { NoteToolbar } from "./NoteToolbar";
import { VaultImage, imageEditorProps } from "./imageSupport";
import { HashTag } from "./wikiAndTags";
import {
  markdownForEditor,
  splitMarkdownFrontmatter,
} from "./editorMarkdown";
import { handleNoteEditorLinkClick } from "./openNoteLink";
import { isNodeNotesPath, isTagNotesPath } from "../vault/vaultFs";

const tagNoteStarterKit = StarterKit.configure({
  link: { openOnClick: false },
});

function TagNoteEditor({ tag }: { tag: string }) {
  const content = useAppStore((s) => s.activeTagNoteContent);
  const path = useAppStore((s) => s.activeTagNotePath);
  const vaultPath = useAppStore((s) => s.vaultPath);
  const setTagNoteContent = useAppStore((s) => s.setTagNoteContent);
  const openTag = useAppStore((s) => s.openTag);

  const editorRef = useRef<ReturnType<typeof useEditor>>(null);
  const initial = splitMarkdownFrontmatter(content);
  const frontmatterRef = useRef(initial.frontmatter);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      tagNoteStarterKit,
      VaultImage,
      HashTag,
      Markdown.configure({
        markedOptions: { gfm: true, breaks: false, pedantic: false },
      }),
      Placeholder.configure({
        placeholder: `Notes about #${tag}…`,
      }),
    ],
    content: markdownForEditor(initial.body, vaultPath),
    contentType: "markdown",
    onUpdate: ({ editor: ed }) => {
      setTagNoteContent(frontmatterRef.current + ed.getMarkdown());
    },
    editorProps: imageEditorProps(
      () => editorRef.current,
      () => useAppStore.getState().vaultPath,
    ),
  });

  editorRef.current = editor;

  useEffect(() => {
    if (!editor) return;
    const parts = splitMarkdownFrontmatter(content);
    const current = frontmatterRef.current + editor.getMarkdown();
    if (content !== current) {
      frontmatterRef.current = parts.frontmatter;
      editor.commands.setContent(
        markdownForEditor(parts.body, useAppStore.getState().vaultPath),
        { emitUpdate: false, contentType: "markdown" },
      );
    } else {
      frontmatterRef.current = parts.frontmatter;
    }
  }, [tag, path, content, editor]);

  const onClickCapture = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const tagEl = target.closest(".note-tag") as HTMLElement | null;
    if (tagEl) {
      e.preventDefault();
      const next =
        tagEl.getAttribute("data-tag") ||
        (tagEl.textContent ?? "").replace(/^#/, "");
      if (next) void openTag(next);
      return;
    }
    handleNoteEditorLinkClick(e, (message) =>
      useAppStore.setState({ error: message }),
    );
  };

  return (
    <section className="tag-note-editor" onClickCapture={onClickCapture}>
      <h3>Tag notes</h3>
      <p className="hint">
        Private scratchpad for this tag — not listed in the sidebar library.
      </p>
      <NoteToolbar editor={editor} />
      <EditorContent editor={editor} />
    </section>
  );
}

export function TagPage() {
  const activeTag = useAppStore((s) => s.activeTag);
  const tagHits = useAppStore((s) => s.tagHits);
  const noteIndex = useAppStore((s) => s.noteIndex);
  const openNote = useAppStore((s) => s.openNote);
  const openMap = useAppStore((s) => s.openMap);
  const openTag = useAppStore((s) => s.openTag);
  const setSelectedNode = useAppStore((s) => s.setSelectedNode);
  const getRelatedTags = useAppStore((s) => s.getRelatedTags);

  const related = useMemo(
    () => (activeTag ? getRelatedTags(activeTag) : []),
    [activeTag, getRelatedTags, tagHits, noteIndex],
  );

  if (!activeTag) {
    return (
      <div className="empty-state">
        <h2>No tag selected</h2>
      </div>
    );
  }

  const relatedNotes = notesWithTag(noteIndex, activeTag).filter(
    (n) => !isNodeNotesPath(n.folder) && !isTagNotesPath(n.folder),
  );

  return (
    <div className="tag-page">
      <header className="tag-page-header">
        <h2>#{activeTag}</h2>
        <p className="hint">
          {tagHits.length} matching line{tagHits.length === 1 ? "" : "s"}
        </p>
      </header>

      <section className="tag-lines">
        {tagHits.length === 0 ? (
          <p className="hint">No lines contain this tag yet.</p>
        ) : (
          tagHits.map((hit, i) => (
            <button
              key={`${hit.notePath ?? hit.nodeId}-${hit.lineNumber}-${i}`}
              type="button"
              className="tag-line-card"
              onClick={() => {
                if (hit.source === "note" && hit.notePath) {
                  void openNote(hit.notePath);
                } else if (hit.mapPath && hit.nodeId) {
                  void openMap(hit.mapPath).then(() => {
                    setSelectedNode(hit.nodeId!);
                  });
                }
              }}
            >
              <div className="tag-line-meta">
                <strong>
                  {hit.source === "node"
                    ? `${hit.mapName ?? "Map"} · ${hit.noteName}`
                    : hit.noteName}
                </strong>
                <span className="hint">line {hit.lineNumber}</span>
              </div>
              <p>{hit.line}</p>
            </button>
          ))
        )}
      </section>

      <section className="tag-notes-list">
        <h3>Related tags</h3>
        {related.length === 0 ? (
          <p className="hint">No other tags co-occur with this one yet.</p>
        ) : (
          <div className="tag-chips related-tag-chips">
            {related.slice(0, 24).map((r) => (
              <button
                key={r.tag}
                type="button"
                className="tag-chip"
                title={`${r.count} shared note${r.count === 1 ? "" : "s"}`}
                onClick={() => void openTag(r.tag)}
              >
                #{r.tag}
                <span className="hint"> {r.count}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="tag-notes-list">
        <h3>Notes with #{activeTag}</h3>
        {relatedNotes.length === 0 ? (
          <p className="hint">No notes list this tag.</p>
        ) : (
          <div className="sidebar-list">
            {relatedNotes.map((n) => (
              <button
                key={n.path}
                type="button"
                className="sidebar-item"
                onClick={() => void openNote(n.path)}
              >
                {n.folder ? `${n.folder}/` : ""}
                {n.name}
              </button>
            ))}
          </div>
        )}
      </section>

      <TagNoteEditor key={activeTag} tag={activeTag} />
    </div>
  );
}
