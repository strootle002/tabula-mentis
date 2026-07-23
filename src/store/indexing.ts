import type { MindMapDocument, MindNode } from "../mindmap/types";
import {
  buildNoteIndex,
  extractTags,
  type NoteIndexEntry,
} from "../notes/links";

export interface NoteMetadata {
  name: string;
  path: string;
  folder: string;
}

export interface IncrementalIndex {
  noteIndex: NoteIndexEntry[];
  mapTagsByPath: Record<string, string[]>;
}

function collectNodeTags(node: MindNode, tags: Set<string>): void {
  if (node.note) {
    for (const tag of extractTags(node.note)) tags.add(tag);
  }
  for (const child of node.children) collectNodeTags(child, tags);
}

/** Extract tags from every map node, including independent floating forests. */
export function extractMapNodeTags(map: MindMapDocument): string[] {
  const tags = new Set<string>();
  collectNodeTags(map.root, tags);
  for (const node of map.floatingNodes ?? []) collectNodeTags(node, tags);
  return [...tags].sort();
}

/** Replace exactly one note entry without reparsing unrelated notes. */
export function upsertNoteIndex(
  index: NoteIndexEntry[],
  note: NoteMetadata,
  content: string,
): NoteIndexEntry[] {
  const entry = buildNoteIndex([{ ...note, content }])[0];
  const existing = index.findIndex((item) => item.path === note.path);
  if (existing < 0) return [...index, entry];
  const next = index.slice();
  next[existing] = entry;
  return next;
}

export function removeNoteIndex(
  index: NoteIndexEntry[],
  path: string,
): NoteIndexEntry[] {
  return index.filter((item) => item.path !== path);
}

/** Replace one map's contribution so removed tags disappear accurately. */
export function upsertMapTagIndex(
  byPath: Record<string, string[]>,
  path: string,
  map: MindMapDocument,
): Record<string, string[]> {
  return { ...byPath, [path]: extractMapNodeTags(map) };
}

export function removeMapTagIndex(
  byPath: Record<string, string[]>,
  path: string,
): Record<string, string[]> {
  const next = { ...byPath };
  delete next[path];
  return next;
}

export function flattenMapTags(byPath: Record<string, string[]>): string[] {
  return [...new Set(Object.values(byPath).flat())].sort();
}
