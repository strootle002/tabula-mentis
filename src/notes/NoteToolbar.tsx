import type { Editor } from "@tiptap/react";
import { useAppStore } from "../store/appStore";
import { pickAndInsertImage } from "./imageSupport";
import { ensureExplicitBlockIds, parseMarkdownBlocks } from "../blocks/blocks";

export function NoteToolbar({ editor }: { editor: Editor | null }) {
  const vaultPath = useAppStore((s) => s.vaultPath);
  const activeNoteContent = useAppStore((s) => s.activeNoteContent);
  const activeNotePath = useAppStore((s) => s.activeNotePath);
  const setNoteContent = useAppStore((s) => s.setNoteContent);
  const pushToast = useAppStore((s) => s.pushToast);
  if (!editor) return null;

  const copyBlockLink = () => {
    const paragraphText = editor.state.selection.$from.parent.textContent.trim();
    if (!paragraphText) {
      pushToast("Place the cursor in a paragraph first", "error");
      return;
    }
    const path = activeNotePath ?? "";
    let content = activeNoteContent;
    let block = parseMarkdownBlocks(content, path).find(
      (b) => b.text.trim() === paragraphText,
    );
    if (!block) {
      pushToast("Could not locate that block", "error");
      return;
    }
    if (!block.explicitId) {
      content = ensureExplicitBlockIds(content, path).content;
      setNoteContent(content);
      block = parseMarkdownBlocks(content, path).find(
        (b) => b.text.trim() === paragraphText,
      );
      if (!block) {
        pushToast("Could not locate that block", "error");
        return;
      }
    }
    void navigator.clipboard.writeText(`((${block.id}))`).then(() => {
      pushToast("Copied block link", "success");
    });
  };

  const assignBlockIds = () => {
    if (!activeNotePath) return;
    const { content, addedIds } = ensureExplicitBlockIds(
      activeNoteContent,
      activeNotePath,
    );
    if (addedIds.length === 0) {
      pushToast("All blocks already have IDs", "info");
      return;
    }
    setNoteContent(content);
    pushToast(
      `Assigned ${addedIds.length} block id${addedIds.length === 1 ? "" : "s"}`,
      "success",
    );
  };

  const btn = (
    label: string,
    title: string,
    action: () => void,
    active = false,
    disabled = false,
    className = "",
  ) => (
    <button
      type="button"
      className={`note-tool-btn ${className} ${active ? "active" : ""}`}
      title={title}
      disabled={disabled}
      onMouseDown={(e) => {
        e.preventDefault();
        action();
      }}
    >
      {label}
    </button>
  );

  return (
    <div className="note-toolbar" role="toolbar" aria-label="Formatting">
      <div className="note-toolbar-group">
        {btn(
          "B",
          "Bold (Ctrl+B)",
          () => editor.chain().focus().toggleBold().run(),
          editor.isActive("bold"),
          false,
          "tool-bold",
        )}
        {btn(
          "I",
          "Italic (Ctrl+I)",
          () => editor.chain().focus().toggleItalic().run(),
          editor.isActive("italic"),
          false,
          "tool-italic",
        )}
        {btn(
          "S̶",
          "Strikethrough",
          () => editor.chain().focus().toggleStrike().run(),
          editor.isActive("strike"),
        )}
        {btn(
          "</>",
          "Inline code",
          () => editor.chain().focus().toggleCode().run(),
          editor.isActive("code"),
        )}
      </div>

      <div className="note-toolbar-sep" />

      <div className="note-toolbar-group">
        {btn(
          "H1",
          "Heading 1",
          () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
          editor.isActive("heading", { level: 1 }),
        )}
        {btn(
          "H2",
          "Heading 2",
          () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
          editor.isActive("heading", { level: 2 }),
        )}
        {btn(
          "H3",
          "Heading 3",
          () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
          editor.isActive("heading", { level: 3 }),
        )}
        {btn(
          "¶",
          "Paragraph",
          () => editor.chain().focus().setParagraph().run(),
          editor.isActive("paragraph") &&
            !editor.isActive("heading") &&
            !editor.isActive("bulletList") &&
            !editor.isActive("orderedList") &&
            !editor.isActive("blockquote"),
        )}
      </div>

      <div className="note-toolbar-sep" />

      <div className="note-toolbar-group">
        {btn(
          "• List",
          "Bullet list",
          () => editor.chain().focus().toggleBulletList().run(),
          editor.isActive("bulletList"),
        )}
        {btn(
          "1. List",
          "Numbered list",
          () => editor.chain().focus().toggleOrderedList().run(),
          editor.isActive("orderedList"),
        )}
        {btn(
          "☑",
          "Task list",
          () => editor.chain().focus().toggleTaskList().run(),
          editor.isActive("taskList"),
        )}
        {btn(
          "Quote",
          "Blockquote",
          () => editor.chain().focus().toggleBlockquote().run(),
          editor.isActive("blockquote"),
        )}
        {btn("—", "Horizontal rule", () =>
          editor.chain().focus().setHorizontalRule().run(),
        )}
        {btn(
          "Img",
          "Insert image",
          () => {
            void pickAndInsertImage(editor, vaultPath);
          },
          false,
          !vaultPath,
        )}
      </div>

      <div className="note-toolbar-sep" />

      <div className="note-toolbar-group">
        {btn("Copy block link", "Copy a ((block-id)) link to the current paragraph", copyBlockLink)}
        {btn("Assign IDs", "Assign explicit ^ids to every block in this note", assignBlockIds)}
      </div>

      <div className="note-toolbar-sep" />

      <div className="note-toolbar-group">
        {btn(
          "↶",
          "Undo",
          () => editor.chain().focus().undo().run(),
          false,
          !editor.can().undo(),
        )}
        {btn(
          "↷",
          "Redo",
          () => editor.chain().focus().redo().run(),
          false,
          !editor.can().redo(),
        )}
      </div>
    </div>
  );
}
