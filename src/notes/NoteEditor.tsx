import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown } from "@tiptap/markdown";
import { useEffect, useRef } from "react";
import { useAppStore } from "../store/appStore";
import { NoteToolbar } from "./NoteToolbar";
import { VaultImage, imageEditorProps } from "./imageSupport";
import { HashTag } from "./wikiAndTags";
import { isContinuousJournal, isJournalNote } from "./journals";
import {
  markdownForEditor,
  splitMarkdownFrontmatter,
} from "./editorMarkdown";
import { handleNoteEditorLinkClick } from "./openNoteLink";
import { NoteAside, NoteAsideToggle } from "./NoteAside";

const noteStarterKit = StarterKit.configure({
  // TipTap's default openOnClick uses window.open(), which breaks in the
  // Tauri webview ("URL could not be displayed") and can trigger bogus reads.
  link: { openOnClick: false },
});

export function NoteEditor() {
  const activeNoteContent = useAppStore((s) => s.activeNoteContent);
  const activeNoteName = useAppStore((s) => s.activeNoteName);
  const activeNotePath = useAppStore((s) => s.activeNotePath);
  const vaultPath = useAppStore((s) => s.vaultPath);
  const setNoteContent = useAppStore((s) => s.setNoteContent);
  const notes = useAppStore((s) => s.notes);
  const openTag = useAppStore((s) => s.openTag);
  const noteAsideOpen = useAppStore((s) => s.noteAsideOpen);

  const editorRef = useRef<ReturnType<typeof useEditor>>(null);
  const initialMarkdown = splitMarkdownFrontmatter(activeNoteContent);
  const frontmatterRef = useRef(initialMarkdown.frontmatter);

  const noteMeta = notes.find((n) => n.path === activeNotePath);
  const isJournal =
    !!noteMeta && isJournalNote(noteMeta.name, noteMeta.folder);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      noteStarterKit,
      VaultImage,
      HashTag,
      Markdown.configure({
        markedOptions: { gfm: true, breaks: false, pedantic: false },
      }),
      Placeholder.configure({
        placeholder: isJournal
          ? "Write freely. Tag ideas with #idea…"
          : "Write a longform note. Use #tags to organize…",
      }),
    ],
    content: markdownForEditor(initialMarkdown.body, vaultPath),
    contentType: "markdown",
    onUpdate: ({ editor: ed }) => {
      setNoteContent(frontmatterRef.current + ed.getMarkdown());
    },
    editorProps: imageEditorProps(
      () => editorRef.current,
      () => useAppStore.getState().vaultPath,
    ),
  });

  editorRef.current = editor;

  useEffect(() => {
    if (!editor || !activeNotePath) return;
    const parts = splitMarkdownFrontmatter(activeNoteContent);
    const current = frontmatterRef.current + editor.getMarkdown();
    if (activeNoteContent !== current) {
      frontmatterRef.current = parts.frontmatter;
      editor.commands.setContent(
        markdownForEditor(parts.body, useAppStore.getState().vaultPath),
        { emitUpdate: false, contentType: "markdown" },
      );
    } else {
      frontmatterRef.current = parts.frontmatter;
    }
  }, [activeNotePath, activeNoteContent, editor]);

  if (!activeNotePath) {
    return (
      <div className="empty-state">
        <div>
          <h2>No note open</h2>
          <p>Create or open a note from the sidebar.</p>
        </div>
      </div>
    );
  }

  const onClickCapture = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const tagEl = target.closest(".note-tag") as HTMLElement | null;
    if (tagEl) {
      e.preventDefault();
      const tag =
        tagEl.getAttribute("data-tag") ||
        (tagEl.textContent ?? "").replace(/^#/, "");
      if (tag) openTag(tag);
      return;
    }
    handleNoteEditorLinkClick(e, (message) =>
      useAppStore.setState({ error: message }),
    );
  };

  const title =
    isJournal && isContinuousJournal(noteMeta!.name, noteMeta!.folder)
      ? "Journal"
      : (activeNoteName ?? "Note");

  return (
    <div className={`note-view ${noteAsideOpen ? "" : "full"}`}>
      <div className="note-editor-wrap" onClickCapture={onClickCapture}>
        <div className="note-editor-header">
          <h2 style={{ fontFamily: "var(--font-display)", margin: 0 }}>
            {title}
          </h2>
          <NoteAsideToggle />
        </div>
        <NoteToolbar editor={editor} />
        <EditorContent editor={editor} />
      </div>
      {noteAsideOpen && <NoteAside />}
    </div>
  );
}
