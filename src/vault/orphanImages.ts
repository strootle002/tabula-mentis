import { readDir, remove } from "@tauri-apps/plugin-fs";
import type { MindMapDocument, MindNode } from "../mindmap/types";
import {
  joinPath,
  listMaps,
  listNotes,
  loadMap,
  loadNote,
  vaultAssetsDir,
} from "./vaultFs";

const MANAGED_IMAGE = /^img-\d+-[a-z0-9]{6}\.(?:png|jpe?g|gif|webp|svg|bmp)$/i;
const EXTERNAL_SCHEME = /^(?:https?:|data:|blob:|asset:)/i;

export interface OrphanImagePreview {
  orphanPaths: string[];
  managedCount: number;
  referencedCount: number;
  uncertain: boolean;
}

function managedAssetReference(value: string): string | null {
  const cleaned = value.trim().replaceAll("\\", "/");
  if (!cleaned || EXTERNAL_SCHEME.test(cleaned) || cleaned.includes("?") || cleaned.includes("#")) {
    return null;
  }
  const match = cleaned.match(/(?:^|\/)assets\/([^/]+)$/i);
  if (!match || !MANAGED_IMAGE.test(match[1])) return null;
  return `assets/${match[1]}`;
}

function walkNode(node: MindNode, references: Set<string>) {
  if (node.image) {
    const ref = managedAssetReference(node.image);
    if (ref) references.add(ref);
  }
  for (const image of node.images ?? []) {
    const ref = managedAssetReference(image.src);
    if (ref) references.add(ref);
  }
  if (node.note) collectMarkdownImageReferences(node.note, references);
  node.children.forEach((child) => walkNode(child, references));
}

export function collectMapImageReferences(
  documents: MindMapDocument[],
): Set<string> {
  const references = new Set<string>();
  for (const document of documents) {
    walkNode(document.root, references);
    document.floatingNodes?.forEach((node) => walkNode(node, references));
  }
  return references;
}

function nodeMarkdownIsCertain(node: MindNode): boolean {
  if (node.note && !collectMarkdownImageReferences(node.note).certain) return false;
  return node.children.every(nodeMarkdownIsCertain);
}

function mapMarkdownIsCertain(document: MindMapDocument): boolean {
  return (
    nodeMarkdownIsCertain(document.root) &&
    (document.floatingNodes?.every(nodeMarkdownIsCertain) ?? true)
  );
}

/**
 * Collect ordinary Markdown images and TipTap's optional data-asset HTML.
 * Returns false if image-looking Markdown cannot be parsed, causing cleanup to
 * fail closed rather than guessing that an asset is unused.
 */
export function collectMarkdownImageReferences(
  markdown: string,
  into = new Set<string>(),
): { references: Set<string>; certain: boolean } {
  const consumed: Array<[number, number]> = [];
  const markdownImage = /!\[[^\]]*\]\(\s*(?:<([^>\r\n]+)>|([^\s)\r\n]+))(?:\s+["'][^"'\r\n]*["'])?\s*\)/g;
  for (const match of markdown.matchAll(markdownImage)) {
    consumed.push([match.index, match.index + match[0].length]);
    const ref = managedAssetReference(match[1] ?? match[2] ?? "");
    if (ref) into.add(ref);
  }
  const htmlImage = /<img\b[^>]*(?:data-asset|src)=["']([^"']+)["'][^>]*>/gi;
  for (const match of markdown.matchAll(htmlImage)) {
    const ref = managedAssetReference(match[1]);
    if (ref) into.add(ref);
  }

  let certain = true;
  for (const match of markdown.matchAll(/!\[/g)) {
    const index = match.index;
    if (!consumed.some(([start, end]) => index >= start && index < end)) {
      certain = false;
      break;
    }
  }
  return { references: into, certain };
}

export function selectConservativeOrphans(
  assetNames: string[],
  references: Set<string>,
  certain = true,
): string[] {
  if (!certain) return [];
  return assetNames
    .filter((name) => MANAGED_IMAGE.test(name))
    .filter((name) => !references.has(`assets/${name}`))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => `assets/${name}`);
}

export async function previewOrphanImages(
  vaultPath: string,
): Promise<OrphanImagePreview> {
  const maps = await listMaps(vaultPath);
  const notes = await listNotes(vaultPath);
  const documents = await Promise.all(maps.map((map) => loadMap(map.path)));
  const references = collectMapImageReferences(documents);
  let certain = documents.every(mapMarkdownIsCertain);
  for (const note of notes) {
    const result = collectMarkdownImageReferences(
      await loadNote(note.path),
      references,
    );
    certain &&= result.certain;
  }

  const entries = await readDir(vaultAssetsDir(vaultPath));
  const assetNames = entries
    .filter((entry) => !entry.isDirectory && !!entry.name)
    .map((entry) => entry.name);
  const managedCount = assetNames.filter((name) => MANAGED_IMAGE.test(name)).length;
  return {
    orphanPaths: selectConservativeOrphans(assetNames, references, certain),
    managedCount,
    referencedCount: references.size,
    uncertain: !certain,
  };
}

/** Re-preview immediately before deletion so newly-added references win. */
export async function removeOrphanImages(vaultPath: string): Promise<number> {
  const preview = await previewOrphanImages(vaultPath);
  if (preview.uncertain) return 0;
  for (const relativePath of preview.orphanPaths) {
    await remove(joinPath(vaultPath, relativePath));
  }
  return preview.orphanPaths.length;
}
