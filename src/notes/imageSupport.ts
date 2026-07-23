import Image from "@tiptap/extension-image";
import type { Editor } from "@tiptap/react";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import {
  assetDisplayUrl,
  saveImageAsset,
  saveImageFromFile,
} from "../vault/imageAssets";

export const VaultImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      asset: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-asset"),
        renderHTML: (attributes) => {
          if (!attributes.asset) return {};
          return { "data-asset": attributes.asset };
        },
      },
    };
  },
  renderMarkdown(node) {
    const src = String(node.attrs?.asset || node.attrs?.src || "");
    const alt = String(node.attrs?.alt || "").replaceAll("]", "\\]");
    return `![${alt}](${src})`;
  },
}).configure({
  inline: false,
  allowBase64: false,
});

export function insertVaultImage(
  editor: Editor,
  vaultPath: string,
  relativePath: string,
  alt = "",
) {
  const src = assetDisplayUrl(vaultPath, relativePath);
  editor
    .chain()
    .focus()
    .insertContent({
      type: "image",
      attrs: { src, alt, asset: relativePath },
    })
    .run();
}

export async function pickAndInsertImage(
  editor: Editor | null,
  vaultPath: string | null,
): Promise<boolean> {
  if (!editor || !vaultPath) return false;
  const selected = await open({
    multiple: false,
    filters: [
      {
        name: "Images",
        extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"],
      },
    ],
  });
  if (!selected || Array.isArray(selected)) return false;
  const bytes = await readFile(selected);
  const name = selected.split(/[/\\]/).pop() || "image.png";
  const saved = await saveImageAsset(vaultPath, bytes, name);
  insertVaultImage(editor, vaultPath, saved.relativePath, name);
  return true;
}

export async function ingestImageFiles(
  editor: Editor,
  vaultPath: string,
  files: File[],
): Promise<boolean> {
  let inserted = false;
  for (const file of files) {
    if (!file.type.startsWith("image/")) continue;
    const saved = await saveImageFromFile(vaultPath, file);
    insertVaultImage(editor, vaultPath, saved.relativePath, file.name);
    inserted = true;
  }
  return inserted;
}

/** TipTap editorProps for paste/drop of images into the note body. */
export function imageEditorProps(
  getEditor: () => Editor | null,
  getVaultPath: () => string | null,
) {
  return {
    handlePaste: (_view: unknown, event: ClipboardEvent) => {
      const vaultPath = getVaultPath();
      const editor = getEditor();
      if (!vaultPath || !editor) return false;

      const files = Array.from(event.clipboardData?.files ?? []).filter((f) =>
        f.type.startsWith("image/"),
      );
      if (files.length > 0) {
        event.preventDefault();
        void ingestImageFiles(editor, vaultPath, files);
        return true;
      }

      const items = event.clipboardData?.items;
      if (!items) return false;
      const imageItems = Array.from(items).filter((i) =>
        i.type.startsWith("image/"),
      );
      if (imageItems.length === 0) return false;
      event.preventDefault();
      void (async () => {
        for (const item of imageItems) {
          const file = item.getAsFile();
          if (!file) continue;
          const saved = await saveImageFromFile(vaultPath, file);
          insertVaultImage(editor, vaultPath, saved.relativePath, "pasted");
        }
      })();
      return true;
    },
    handleDrop: (_view: unknown, event: DragEvent) => {
      const vaultPath = getVaultPath();
      const editor = getEditor();
      const files = Array.from(event.dataTransfer?.files ?? []).filter((f) =>
        f.type.startsWith("image/"),
      );
      if (!vaultPath || !editor || files.length === 0) return false;
      event.preventDefault();
      void ingestImageFiles(editor, vaultPath, files);
      return true;
    },
  };
}
