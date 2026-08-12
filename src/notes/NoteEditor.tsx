import { useEditor, EditorContent, ReactNodeViewRenderer } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown } from "@tiptap/markdown";
import { useEffect, useRef } from "react";
import { useAppStore } from "../store/appStore";
import { NoteToolbar } from "./NoteToolbar";
import { VaultImage, imageEditorProps } from "./imageSupport";
import { HashTag, WikiLink } from "./wikiAndTags";
import { BlockEmbed } from "./blockEmbed";
import { BlockEmbedView } from "./BlockEmbedView";
import {
  markdownForEditor,
  splitMarkdownFrontmatter,
} from "./editorMarkdown";
import { handleNoteEditorLinkClick } from "./openNoteLink";
import { resolveWikiTarget } from "./links";
import { NoteAside, NoteAsideToggle } from "./NoteAside";
import { isNodeNotesPath, isTagNotesPath } from "../vault/vaultFs";
import { WikiLinkSuggest } from "./WikiLinkSuggest";
import { QueryBlockView } from "./QueryBlockView";
import { TaskItem, TaskList } from "@tiptap/extension-list";

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
  const noteIndex = useAppStore((s) => s.noteIndex);
  const openTag = useAppStore((s) => s.openTag);
  const openNote = useAppStore((s) => s.openNote);
  const createNote = useAppStore((s) => s.createNote);
  const noteAsideOpen = useAppStore((s) => s.noteAsideOpen);
  const presentationMode = useAppStore((s) => s.presentationMode);

  const editorRef = useRef<ReturnType<typeof useEditor>>(null);
  const initialMarkdown = splitMarkdownFrontmatter(activeNoteContent);
  const frontmatterRef = useRef(initialMarkdown.frontmatter);

  const editor = useEditor({
    immediatelyRender: false,
    editable: !presentationMode,
    extensions: [
      noteStarterKit,
      TaskList,
      TaskItem.configure({ nested: true }),
      VaultImage,
      HashTag,
      WikiLink,
      BlockEmbed.extend({
        addNodeView() {
          return ReactNodeViewRenderer(BlockEmbedView);
        },
      }),
      Markdown.configure({
        markedOptions: { gfm: true, breaks: false, pedantic: false },
      }),
      Placeholder.configure({
        placeholder: "Write a longform note. Use #tags and [[WikiLinks]]…",
      }),
    ],
    content: markdownForEditor(initialMarkdown.body, vaultPath),
    contentType: "markdown",
    onUpdate: ({ editor: ed }) => {
      if (useAppStore.getState().presentationMode) return;
      setNoteContent(frontmatterRef.current + ed.getMarkdown());
    },
    editorProps: imageEditorProps(
      () => editorRef.current,
      () => useAppStore.getState().vaultPath,
    ),
  });

  editorRef.current = editor;

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!presentationMode);
  }, [editor, presentationMode]);

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
          <p>Create or open a note from the sidebar to get started.</p>
        </div>
      </div>
    );
  }

  const openWiki = (target: string) => {
    const library = noteIndex.filter(
      (n) => !isNodeNotesPath(n.folder) && !isTagNotesPath(n.folder),
    );
    const hit = resolveWikiTarget(library, target);
    if (hit) {
      void openNote(hit.path);
      return;
    }
    if (presentationMode) return;
    void createNote(target);
  };

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
    handleNoteEditorLinkClick(e, {
      onError: (message) => useAppStore.setState({ error: message }),
      onWikiTarget: openWiki,
    });
  };

  const title = activeNoteName ?? "Note";

  return (
    <div
      className={`note-view ${noteAsideOpen && !presentationMode ? "" : "full"} ${presentationMode ? "is-presenting" : ""}`}
    >
      <div className="note-editor-wrap" onClickCapture={onClickCapture}>
        {!presentationMode && (
          <div className="note-editor-header">
            <h2 className="heading-display">{title}</h2>
            <NoteAsideToggle />
          </div>
        )}
        {!presentationMode && <NoteToolbar editor={editor} />}
        <div className="note-editor-body">
          {presentationMode && (
            <h2 className="presentation-note-title">{title}</h2>
          )}
          <EditorContent editor={editor} />
          {!presentationMode && <WikiLinkSuggest editor={editor} />}
          {!presentationMode && (
            <QueryBlockView content={activeNoteContent} />
          )}
        </div>
      </div>
      {!presentationMode && noteAsideOpen && <NoteAside editor={editor} />}
    </div>
  );
}
