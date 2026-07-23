import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown } from "@tiptap/markdown";
import { useEffect, useRef } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { findNodeInDoc } from "./mapDoc";
import { normalizeNodeImages } from "./nodeImages";
import { handleNodeImagePaste } from "./pasteNodeImages";
import { useAppStore } from "../store/appStore";
import {
  VaultImage,
  imageEditorProps,
  pickAndInsertImage,
} from "../notes/imageSupport";
import { HashTag } from "../notes/wikiAndTags";
import {
  markdownForEditor,
  splitMarkdownFrontmatter,
} from "../notes/editorMarkdown";
import { handleNoteEditorLinkClick } from "../notes/openNoteLink";
import { assetDisplayUrl } from "../vault/imageAssets";

const nodeNoteStarterKit = StarterKit.configure({
  link: { openOnClick: false },
});

export function NodePanel() {
  const activeMap = useAppStore((s) => s.activeMap);
  const selectedNodeId = useAppStore((s) => s.selectedNodeId);
  const vaultPath = useAppStore((s) => s.vaultPath);
  const openTag = useAppStore((s) => s.openTag);
  const updateNodeNote = useAppStore((s) => s.updateNodeNote);
  const updateSelectedStyle = useAppStore((s) => s.updateSelectedStyle);
  const updateSelectedText = useAppStore((s) => s.updateSelectedText);
  const addImagesToSelected = useAppStore((s) => s.addImagesToSelected);
  const removeNodeImage = useAppStore((s) => s.removeNodeImage);
  const addChildToSelected = useAppStore((s) => s.addChildToSelected);
  const deleteSelected = useAppStore((s) => s.deleteSelected);
  const toggleCollapseSelected = useAppStore((s) => s.toggleCollapseSelected);

  const node =
    activeMap && selectedNodeId
      ? findNodeInDoc(activeMap, selectedNodeId)
      : null;

  const editorRef = useRef<ReturnType<typeof useEditor>>(null);
  const initialMarkdown = splitMarkdownFrontmatter(node?.note ?? "");
  const frontmatterRef = useRef(initialMarkdown.frontmatter);
  const loadedNodeIdRef = useRef(node?.id ?? null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      nodeNoteStarterKit,
      VaultImage,
      HashTag,
      Markdown.configure({
        markedOptions: { gfm: true, breaks: false, pedantic: false },
      }),
      Placeholder.configure({ placeholder: "Add a note for this node…" }),
    ],
    content: markdownForEditor(initialMarkdown.body, vaultPath),
    contentType: "markdown",
    onUpdate: ({ editor: ed }) => {
      const nodeId = loadedNodeIdRef.current;
      if (nodeId) {
        updateNodeNote(
          nodeId,
          frontmatterRef.current + ed.getMarkdown(),
        );
      }
    },
    editorProps: {
      ...imageEditorProps(
        () => editorRef.current,
        () => useAppStore.getState().vaultPath,
      ),
      handleDOMEvents: {
        click: (_view, event) => {
          handleNoteEditorLinkClick(event, (message) =>
            useAppStore.setState({ error: message }),
          );
          return false;
        },
      },
    },
  });

  editorRef.current = editor;

  useEffect(() => {
    if (!editor || !node) return;
    const parts = splitMarkdownFrontmatter(node.note ?? "");
    const current = frontmatterRef.current + editor.getMarkdown();
    if ((node.note ?? "") !== current) {
      frontmatterRef.current = parts.frontmatter;
      loadedNodeIdRef.current = node.id;
      editor.commands.setContent(
        markdownForEditor(parts.body, useAppStore.getState().vaultPath),
        { emitUpdate: false, contentType: "markdown" },
      );
    } else {
      loadedNodeIdRef.current = node.id;
    }
  }, [node?.id, node?.note, editor]);

  if (!node) {
    return (
      <aside className="side-panel">
        <h3>Node</h3>
        <p className="hint">Select a node to edit its note and style.</p>
      </aside>
    );
  }

  const style = node.style ?? {};
  const images = normalizeNodeImages(node);

  const pickNodeImages = async () => {
    if (!vaultPath) return;
    const selected = await open({
      multiple: true,
      filters: [
        {
          name: "Images",
          extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"],
        },
      ],
    });
    if (!selected) return;
    const paths = Array.isArray(selected) ? selected : [selected];
    const files: File[] = [];
    for (const path of paths) {
      const bytes = await readFile(path);
      const name = path.split(/[/\\]/).pop() || "image.png";
      files.push(
        new File([bytes.slice()], name, {
          type: guessMime(name),
        }),
      );
    }
    await addImagesToSelected(files);
  };

  const onNoteClickCapture = (e: React.MouseEvent) => {
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

  return (
    <aside className="side-panel">
      <h3>Node</h3>
      <div className="field">
        <label htmlFor="node-text">Text</label>
        <textarea
          id="node-text"
          className="node-text-area"
          rows={Math.max(2, node.text.split("\n").length)}
          value={node.text}
          onChange={(e) => updateSelectedText(e.target.value)}
          onPaste={(e) => {
            handleNodeImagePaste(e);
          }}
        />
      </div>

      <div className="field">
        <label>Images on node</label>
        {images.length > 0 && vaultPath ? (
          <div className="node-image-list">
            {images.map((img) => (
              <div key={img.id} className="node-image-preview">
                <img src={assetDisplayUrl(vaultPath, img.src)} alt="" />
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => removeNodeImage(img.id)}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        ) : null}
        <button
          type="button"
          className="ghost-btn"
          disabled={!vaultPath}
          onClick={() => void pickNodeImages()}
        >
          Add image{images.length ? "s" : ""}
        </button>
        <p className="hint" style={{ marginTop: "0.35rem" }}>
          Select a node and paste an image (Ctrl+V). Drag the green handle to
          resize (up to large). Double-click an image for a full-size preview.
        </p>
      </div>

      <div className="field">
        <label>Note</label>
        <div className="node-note-toolbar">
          <button
            type="button"
            className="ghost-btn"
            disabled={!vaultPath || !editor}
            onMouseDown={(e) => {
              e.preventDefault();
              void pickAndInsertImage(editor, vaultPath);
            }}
          >
            Insert image in note
          </button>
        </div>
        <div onClickCapture={onNoteClickCapture}>
          <EditorContent editor={editor} />
        </div>
      </div>

      <div className="field">
        <label>Colors</label>
        <div className="color-row">
          <input
            type="color"
            title="Fill"
            value={normalizeColor(style.fill, "#f4f1ea")}
            onChange={(e) => updateSelectedStyle({ fill: e.target.value })}
          />
          <input
            type="color"
            title="Stroke"
            value={normalizeColor(style.stroke, "#5a5348")}
            onChange={(e) => updateSelectedStyle({ stroke: e.target.value })}
          />
          <input
            type="color"
            title="Text"
            value={normalizeColor(style.textColor, "#3a342c")}
            onChange={(e) => updateSelectedStyle({ textColor: e.target.value })}
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor="node-scale">Scale ({(style.scale ?? 1).toFixed(2)})</label>
        <input
          id="node-scale"
          type="range"
          min={0.7}
          max={2}
          step={0.05}
          value={style.scale ?? 1}
          onChange={(e) =>
            updateSelectedStyle({ scale: Number(e.target.value) })
          }
        />
      </div>

      <div className="field">
        <label htmlFor="node-font">Font size</label>
        <input
          id="node-font"
          type="number"
          min={10}
          max={28}
          value={style.fontSize ?? 14}
          onChange={(e) =>
            updateSelectedStyle({ fontSize: Number(e.target.value) })
          }
        />
      </div>

      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
        <button type="button" className="ghost-btn" onClick={addChildToSelected}>
          Add child
        </button>
        <button
          type="button"
          className="ghost-btn"
          onClick={toggleCollapseSelected}
          disabled={node.children.length === 0}
        >
          {node.collapsed ? "Expand" : "Collapse"}
        </button>
        <button
          type="button"
          className="ghost-btn"
          onClick={deleteSelected}
          disabled={activeMap?.root.id === node.id}
        >
          Delete
        </button>
      </div>
      <p className="hint">
        Shift+Enter adds a new line in node text. Double-click a node (or F2) to
        edit. Paste images onto the node; use the note editor for images inside
        the note body. Tag with <code>#tag</code>; web links (
        <code>[text](https://…)</code>) open in your browser.
      </p>
    </aside>
  );
}

function guessMime(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "gif") return "image/gif";
  if (ext === "webp") return "image/webp";
  if (ext === "svg") return "image/svg+xml";
  return "image/png";
}

function normalizeColor(value: string | undefined, fallback: string) {
  if (!value || !value.startsWith("#") || (value.length !== 7 && value.length !== 4)) {
    return fallback;
  }
  return value;
}
