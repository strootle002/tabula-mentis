import type { MindMapDocument } from "../mindmap/types";

export interface MapHistoryEntry {
  id: string;
  label: string;
  at: number;
  map: MindMapDocument;
  selectedNodeId: string | null;
}

const MAX_HISTORY = 80;

let lastCoalesceLabel: string | null = null;
let lastCoalesceKey: string | null = null;
let lastCoalesceAt = 0;

export function cloneMap(map: MindMapDocument): MindMapDocument {
  return structuredClone(map);
}

export function makeHistoryEntry(
  label: string,
  map: MindMapDocument,
  selectedNodeId: string | null,
): MapHistoryEntry {
  return {
    id: crypto.randomUUID(),
    label,
    at: Date.now(),
    map: cloneMap(map),
    selectedNodeId,
  };
}

export function appendHistory(
  history: MapHistoryEntry[],
  entry: MapHistoryEntry,
): MapHistoryEntry[] {
  return [...history, entry].slice(-MAX_HISTORY);
}

/** Returns true if a new history snapshot should be recorded. */
export function shouldRecordChange(
  label: string,
  opts?: { coalesce?: boolean; coalesceKey?: string | null },
): boolean {
  const now = Date.now();
  const key = opts?.coalesceKey ?? null;
  if (opts?.coalesce) {
    if (
      lastCoalesceLabel === label &&
      lastCoalesceKey === key &&
      now - lastCoalesceAt < 1000
    ) {
      lastCoalesceAt = now;
      return false;
    }
    lastCoalesceLabel = label;
    lastCoalesceKey = key;
    lastCoalesceAt = now;
    return true;
  }
  lastCoalesceLabel = null;
  lastCoalesceKey = null;
  lastCoalesceAt = 0;
  return true;
}

export function resetHistoryCoalesce() {
  lastCoalesceLabel = null;
  lastCoalesceKey = null;
  lastCoalesceAt = 0;
}

export function formatHistoryTime(at: number): string {
  return new Date(at).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}
