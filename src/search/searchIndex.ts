import type { MindMapDocument, MindNode } from "../mindmap/types";
import type { NoteIndexEntry } from "../notes/links";

export type SearchKind = "note" | "map" | "node";

export interface SearchDocument {
  id: string;
  kind: SearchKind;
  title: string;
  content: string;
  path: string;
  tags?: string[];
  mapPath?: string;
  nodeId?: string;
}

export interface SearchResult extends SearchDocument {
  score: number;
  snippet: string;
}

interface IndexedDocument {
  source: SearchDocument;
  normalizedTitle: string;
  normalizedContent: string;
  normalizedPath: string;
  tokens: Map<string, number>;
}

const WORDS = /[\p{L}\p{N}_-]+/gu;

function normalize(value: string): string {
  return value.normalize("NFKD").toLocaleLowerCase();
}

/** NFKD can change string length; map normalized offsets back to the original. */
function normalizeWithMap(value: string): {
  normalized: string;
  map: number[];
} {
  let normalized = "";
  const map: number[] = [];
  for (let i = 0; i < value.length; i++) {
    const piece = value[i]!.normalize("NFKD").toLocaleLowerCase();
    for (let j = 0; j < piece.length; j++) map.push(i);
    normalized += piece;
  }
  return { normalized, map };
}

function terms(value: string): string[] {
  return normalize(value).match(WORDS) ?? [];
}

function makeSnippet(content: string, queryTerms: string[]): string {
  const plain = content.replace(/\s+/g, " ").trim();
  if (!plain) return "";
  const { normalized, map } = normalizeWithMap(plain);
  const positions = queryTerms
    .map((term) => normalized.indexOf(term))
    .filter((position) => position >= 0);
  const hitNorm = positions.length ? Math.min(...positions) : 0;
  const startNorm = Math.max(0, hitNorm - 42);
  const endNorm = Math.min(normalized.length, startNorm + 132);
  const start =
    map.length === 0 ? 0 : (map[startNorm] ?? map[map.length - 1] ?? 0);
  const end =
    endNorm <= 0 || map.length === 0
      ? 0
      : (map[Math.min(endNorm, map.length) - 1] ?? plain.length - 1) + 1;
  return `${start > 0 ? "…" : ""}${plain.slice(start, end)}${end < plain.length ? "…" : ""}`;
}

function indexDocument(source: SearchDocument): IndexedDocument {
  const tokens = new Map<string, number>();
  for (const token of terms(
    `${source.title} ${source.title} ${source.content} ${source.path} ${(source.tags ?? []).join(" ")}`,
  )) {
    tokens.set(token, (tokens.get(token) ?? 0) + 1);
  }
  return {
    source,
    normalizedTitle: normalize(source.title),
    normalizedContent: normalize(source.content),
    normalizedPath: normalize(source.path),
    tokens,
  };
}

/** In-memory vault index with document-level incremental replacement/removal. */
export class VaultSearchIndex {
  private readonly documents = new Map<string, IndexedDocument>();

  upsert(document: SearchDocument): void {
    this.documents.set(document.id, indexDocument(document));
  }

  remove(id: string): boolean {
    return this.documents.delete(id);
  }

  clear(): void {
    this.documents.clear();
  }

  get size(): number {
    return this.documents.size;
  }

  search(query: string, limit = 30): SearchResult[] {
    const queryTerms = [...new Set(terms(query))];
    if (!queryTerms.length) return [];
    const phrase = normalize(query.trim());
    const results: SearchResult[] = [];

    for (const indexed of this.documents.values()) {
      let score = 0;
      let matched = true;
      for (const term of queryTerms) {
        const titleExact = indexed.normalizedTitle === term;
        const titlePrefix = indexed.normalizedTitle.startsWith(term);
        const pathHit = indexed.normalizedPath.includes(term);
        const frequency = indexed.tokens.get(term) ?? 0;
        const prefixFrequency = frequency
          ? 0
          : [...indexed.tokens.entries()]
              .filter(([token]) => token.startsWith(term))
              .reduce((total, [, count]) => total + count, 0);
        if (!frequency && !prefixFrequency && !pathHit) {
          matched = false;
          break;
        }
        score += titleExact ? 70 : titlePrefix ? 38 : 0;
        score += Math.min(frequency * 6 + prefixFrequency * 3, 24);
        score += pathHit ? 4 : 0;
      }
      if (!matched) continue;
      if (indexed.normalizedTitle.includes(phrase)) score += 24;
      if (indexed.normalizedContent.includes(phrase)) score += 10;
      if (indexed.source.kind === "note") score += 2;
      results.push({
        ...indexed.source,
        score,
        snippet: makeSnippet(indexed.source.content, queryTerms),
      });
    }

    return results
      .sort(
        (a, b) =>
          b.score - a.score ||
          a.title.localeCompare(b.title) ||
          a.id.localeCompare(b.id),
      )
      .slice(0, Math.max(0, limit));
  }
}

export function noteSearchDocument(note: NoteIndexEntry): SearchDocument {
  return {
    id: `note:${note.path}`,
    kind: "note",
    title: note.name,
    content: note.content,
    path: note.path,
    tags: note.tags,
  };
}

function visitNode(
  node: MindNode,
  mapPath: string,
  ancestors: string[],
  add: (document: SearchDocument) => void,
): void {
  const breadcrumb = [...ancestors, node.text].filter(Boolean);
  add({
    id: `node:${mapPath}:${node.id}`,
    kind: "node",
    title: node.text || "Untitled node",
    content: `${node.note ?? ""} ${breadcrumb.join(" / ")}`,
    path: `${mapPath}#${node.id}`,
    mapPath,
    nodeId: node.id,
  });
  for (const child of node.children) visitNode(child, mapPath, breadcrumb, add);
}

/** Index a complete map, including every independent floating-node forest. */
export function mapSearchDocuments(
  mapPath: string,
  map: MindMapDocument,
): SearchDocument[] {
  const documents: SearchDocument[] = [
    {
      id: `map:${mapPath}`,
      kind: "map",
      title: map.title,
      content: map.title,
      path: mapPath,
      mapPath,
    },
  ];
  const add = (document: SearchDocument) => documents.push(document);
  visitNode(map.root, mapPath, [map.title], add);
  for (const floating of map.floatingNodes ?? []) {
    visitNode(floating, mapPath, [map.title, "Floating"], add);
  }
  return documents;
}

export function replaceMapInIndex(
  index: VaultSearchIndex,
  mapPath: string,
  map: MindMapDocument,
  previousNodeIds: Iterable<string> = [],
): string[] {
  index.remove(`map:${mapPath}`);
  for (const nodeId of previousNodeIds) {
    index.remove(`node:${mapPath}:${nodeId}`);
  }
  const documents = mapSearchDocuments(mapPath, map);
  for (const document of documents) index.upsert(document);
  return documents
    .filter((document) => document.nodeId)
    .map((document) => document.nodeId!);
}
