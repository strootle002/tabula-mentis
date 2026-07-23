import type { MindMapDocument } from "../mindmap/types";

export type DocumentKind = "map" | "note";

export interface ExternalConflict {
  kind: DocumentKind;
  path: string;
  detectedAt: number;
}

export type ExternalChangeDecision =
  | { type: "reload" }
  | { type: "conflict"; conflict: ExternalConflict };

/** Pure state transition used by the filesystem watcher and unit tests. */
export function decideExternalChange(
  kind: DocumentKind,
  path: string,
  dirty: boolean,
  detectedAt = Date.now(),
): ExternalChangeDecision {
  return dirty
    ? { type: "conflict", conflict: { kind, path, detectedAt } }
    : { type: "reload" };
}

export function isAtomicWriteArtifact(path: string): boolean {
  return (
    path.endsWith(".mindmap-tmp") ||
    path.endsWith(".mindmap-backup") ||
    path.includes(".mindmap-tmp/") ||
    path.includes(".mindmap-backup/")
  );
}

/** Own map saves change updatedAt, but otherwise preserve document content. */
export function mapsMatchIgnoringUpdatedAt(
  local: MindMapDocument,
  disk: MindMapDocument,
): boolean {
  const { updatedAt: _localUpdatedAt, ...localContent } = local;
  const { updatedAt: _diskUpdatedAt, ...diskContent } = disk;
  return JSON.stringify(localContent) === JSON.stringify(diskContent);
}
