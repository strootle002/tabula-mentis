import type { MindMapDocument, MindNode } from "../mindmap/types";
import { createEmptyNode } from "../vault/vaultFs";

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

export type CsvImportMode = "columns-as-levels" | "parent-child";

export interface CsvImportOptions {
  mode: CsvImportMode;
  hasHeader: boolean;
  parentColumn?: number;
  childColumn?: number;
  /** Ordered column indexes for hierarchy levels (level 1, level 2, …). */
  levelColumns?: number[];
  title?: string;
}

export function parseCsv(csv: string): string[][] {
  return csv
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0)
    .map(parseCsvLine);
}

/** Parse only the header + first `maxRows` data rows (for wizard preview). */
export function parseCsvPreview(
  csv: string,
  maxRows = 60,
): { headers: string[]; previewRows: string[][]; totalDataRows: number } {
  const lines = csv
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);
  if (lines.length === 0) {
    return { headers: [], previewRows: [], totalDataRows: 0 };
  }
  const header = parseCsvLine(lines[0]);
  const dataLineCount = Math.max(0, lines.length - 1);
  const previewRows = lines
    .slice(0, Math.min(lines.length, maxRows + 1))
    .map(parseCsvLine);
  return {
    headers: header.map((h, i) => h || `Column ${i + 1}`),
    previewRows,
    totalDataRows: dataLineCount,
  };
}

/**
 * Pick hierarchy columns that work for mindmaps: decent fill-rate and moderate
 * cardinality. Avoid nearly-unique columns (timestamps, message, paths).
 */
export function suggestLevelColumns(
  headers: string[],
  sampleRows: string[][],
  maxLevels = 3,
): number[] {
  if (headers.length === 0) return [0];
  const n = Math.max(sampleRows.length, 1);
  const scored = headers.map((h, i) => {
    const values = sampleRows
      .map((r) => (r[i] ?? "").trim())
      .filter(Boolean);
    const cardinality = new Set(values).size;
    const fill = values.length / n;
    const hl = h.toLowerCase();
    let score = 0;
    if (fill >= 0.4) score += 2;
    if (cardinality >= 2 && cardinality <= Math.max(12, Math.floor(n * 0.3))) {
      score += 4;
    } else if (cardinality > Math.floor(n * 0.75)) {
      score -= 6; // almost unique per row
    }
    if (
      /(^|[._])(action|category|type|name|provider|hostname|status|result)([._]|$)/i.test(
        hl,
      )
    ) {
      score += 3;
    }
    if (/timestamp|message|command_line|executable|path|pid|@timestamp/i.test(hl)) {
      score -= 4;
    }
    return { i, score, cardinality };
  });

  const picked = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, maxLevels)
    .map((s) => s.i)
    .sort((a, b) => a - b);

  return picked.length > 0 ? picked : [0];
}

/** Estimate how many mindmap nodes a columns-as-levels import would create. */
export function estimateLevelImportNodes(
  rows: string[][],
  levelColumns: number[],
): number {
  const seen = new Set<string>();
  for (const row of rows) {
    const parts: string[] = [];
    for (const i of levelColumns) {
      const text = (row[i] ?? "").trim();
      if (!text) continue;
      parts.push(text);
      seen.add(parts.join("\u0001"));
    }
  }
  return seen.size + 1; // + root
}

export const MAX_IMPORT_NODES = 8_000;

export function detectImportKind(
  fileName: string,
  content: string,
): "csv" | "txt" | "json" {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".csv")) return "csv";
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".txt") || lower.endsWith(".md")) return "txt";
  const trimmed = content.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      JSON.parse(trimmed);
      return "json";
    } catch {
      /* fall through */
    }
  }
  const lines = content.split(/\r?\n/).filter((l) => l.trim()).slice(0, 8);
  if (lines.length === 0) return "txt";
  const commaHeavy = lines.filter((l) => (l.match(/,/g) ?? []).length >= 1).length;
  if (commaHeavy >= Math.ceil(lines.length * 0.6)) return "csv";
  return "txt";
}

/** Flatten JSON array/object into a table of rows for the import wizard / grid. */
export function jsonToTable(content: string): {
  headers: string[];
  rows: string[][];
} {
  const data = JSON.parse(content);
  if (Array.isArray(data)) {
    if (data.length === 0) return { headers: [], rows: [] };
    if (typeof data[0] === "object" && data[0] !== null && !Array.isArray(data[0])) {
      const headers = Array.from(
        new Set(data.flatMap((row) => Object.keys(row as object))),
      );
      const rows = data.map((row) =>
        headers.map((h) => stringifyCell((row as Record<string, unknown>)[h])),
      );
      return { headers, rows };
    }
    if (Array.isArray(data[0])) {
      const width = Math.max(...data.map((r) => (r as unknown[]).length), 1);
      const headers = Array.from({ length: width }, (_, i) => `Column ${i + 1}`);
      const rows = data.map((r) => {
        const arr = r as unknown[];
        return headers.map((_, i) => stringifyCell(arr[i]));
      });
      return { headers, rows };
    }
    return {
      headers: ["Value"],
      rows: data.map((v) => [stringifyCell(v)]),
    };
  }
  if (typeof data === "object" && data !== null) {
    // Map document?
    if ("root" in data && typeof (data as { root: unknown }).root === "object") {
      return mindMapToTable(data as MindMapDocument);
    }
    const headers = Object.keys(data);
    return {
      headers,
      rows: [headers.map((h) => stringifyCell((data as Record<string, unknown>)[h]))],
    };
  }
  return { headers: ["Value"], rows: [[stringifyCell(data)]] };
}

function stringifyCell(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

export function mindMapToTable(doc: MindMapDocument): {
  headers: string[];
  rows: string[][];
} {
  const hasFloating = (doc.floatingNodes ?? []).length > 0;
  const rows: string[][] = [];
  let maxDepth = 0;
  const walk = (node: MindNode, path: string[], forest: string) => {
    const next = [...path, node.text];
    maxDepth = Math.max(maxDepth, next.length);
    if (node.children.length === 0) {
      rows.push(hasFloating ? [forest, ...next] : next);
    } else {
      node.children.forEach((c) => walk(c, next, forest));
    }
  };
  walk(doc.root, [], "root");
  for (const forest of doc.floatingNodes ?? []) {
    walk(forest, [], `floating:${forest.id}`);
  }
  const levelHeaders = Array.from({ length: maxDepth }, (_, i) => `Level ${i + 1}`);
  const headers = hasFloating ? ["Forest", ...levelHeaders] : levelHeaders;
  const padded = rows.map((r) => {
    const copy = [...r];
    while (copy.length < headers.length) copy.push("");
    return copy;
  });
  return { headers, rows: padded };
}

export function tableToCsv(headers: string[], rows: string[][]): string {
  const escape = (cell: string) => {
    if (/[",\n]/.test(cell)) return `"${cell.replaceAll('"', '""')}"`;
    return cell;
  };
  return [headers, ...rows].map((r) => r.map(escape).join(",")).join("\n");
}

export function exportMapToCsv(doc: MindMapDocument): string {
  const { headers, rows } = mindMapToTable(doc);
  return tableToCsv(headers, rows);
}

/** Rebuild a mindmap tree from level-column rows (as produced by mindMapToTable). */
export function tableToMapTree(rows: string[][]): MindNode {
  const root = createEmptyNode("Root");
  for (const row of rows) {
    let cursor = root;
    for (const cell of row) {
      const text = (cell ?? "").trim();
      if (!text) continue;
      let child = cursor.children.find((c) => c.text === text);
      if (!child) {
        child = createEmptyNode(text);
        cursor.children.push(child);
      }
      cursor = child;
    }
  }
  if (root.children.length === 1) return root.children[0];
  if (root.children.length === 0) return createEmptyNode("Empty");
  return root;
}

/**
 * Rebuild a document from mindMapToTable rows, restoring floating forests when
 * a Forest column is present.
 */
export function tableToMapDocument(
  headers: string[],
  rows: string[][],
  title = "Imported CSV",
): MindMapDocument {
  const forestIdx = headers.findIndex(
    (h) => h.trim().toLocaleLowerCase() === "forest",
  );
  if (forestIdx < 0) {
    return wrapDoc(title, [tableToMapTree(rows)]);
  }

  const byForest = new Map<string, string[][]>();
  for (const row of rows) {
    const forest = (row[forestIdx] ?? "root").trim() || "root";
    const levels = row.filter((_, i) => i !== forestIdx);
    const list = byForest.get(forest) ?? [];
    list.push(levels);
    byForest.set(forest, list);
  }

  const rootRows = byForest.get("root") ?? [];
  byForest.delete("root");
  const root = tableToMapTree(rootRows.length ? rootRows : [[title]]);
  const floatingNodes = [...byForest.entries()].map(([key, forestRows]) => {
    const tree = tableToMapTree(forestRows);
    if (key.startsWith("floating:") && key.slice("floating:".length)) {
      return { ...tree, id: key.slice("floating:".length) };
    }
    return tree;
  });

  const now = new Date().toISOString();
  return {
    version: 1,
    title,
    root,
    floatingNodes: floatingNodes.length ? floatingNodes : undefined,
    createdAt: now,
    updatedAt: now,
  };
}

export function importCsvToMap(
  csv: string,
  options: CsvImportOptions,
): MindMapDocument {
  const rows = parseCsv(csv);
  if (rows.length === 0) {
    return emptyDoc(options.title ?? "Imported CSV");
  }

  const data = options.hasHeader ? rows.slice(1) : rows;
  const title = options.title ?? "Imported CSV";

  if (options.mode === "parent-child") {
    const pIdx = options.parentColumn ?? 0;
    const cIdx = options.childColumn ?? 1;
    const byParent = new Map<string, string[]>();
    const allChildren = new Set<string>();
    const allParents = new Set<string>();

    for (const row of data) {
      const parent = row[pIdx]?.trim();
      const child = row[cIdx]?.trim();
      if (!parent || !child) continue;
      allParents.add(parent);
      allChildren.add(child);
      const list = byParent.get(parent) ?? [];
      list.push(child);
      byParent.set(parent, list);
    }

    const roots = [...allParents].filter((p) => !allChildren.has(p));
    const build = (name: string, seen: Set<string>): MindNode => {
      if (seen.has(name)) return { ...createEmptyNode(name), children: [] };
      seen.add(name);
      const kids = byParent.get(name) ?? [];
      return {
        id: crypto.randomUUID(),
        text: name,
        children: kids.map((k) => build(k, seen)),
      };
    };

    const rootChildren =
      roots.length > 0
        ? roots.map((r) => build(r, new Set()))
        : [...byParent.keys()].map((r) => build(r, new Set()));

    return wrapDoc(title, rootChildren);
  }

  // columns-as-levels (optionally a custom ordered subset of columns)
  const headerRow = options.hasHeader ? rows[0] : null;
  const forestHeaderIdx = headerRow?.findIndex(
    (h) => h.trim().toLocaleLowerCase() === "forest",
  );
  if (
    options.hasHeader &&
    forestHeaderIdx != null &&
    forestHeaderIdx >= 0 &&
    (!options.levelColumns || options.levelColumns.length === 0)
  ) {
    const { headers, rows: tableRows } = {
      headers: headerRow!,
      rows: data,
    };
    const doc = tableToMapDocument(headers, tableRows, title);
    return doc;
  }

  const levelColumns =
    options.levelColumns && options.levelColumns.length > 0
      ? options.levelColumns
      : null;

  const root = createEmptyNode(title);
  let nodeCount = 1;
  for (const row of data) {
    let cursor = root;
    const cells = levelColumns
      ? levelColumns.map((i) => row[i] ?? "").filter((c) => c.trim())
      : row.filter((c) => c.trim());
    for (const cell of cells) {
      const text = cell.trim();
      if (!text) continue;
      let child = cursor.children.find((c) => c.text === text);
      if (!child) {
        child = createEmptyNode(text);
        cursor.children.push(child);
        nodeCount += 1;
        if (nodeCount > MAX_IMPORT_NODES) {
          throw new Error(
            `Import would create more than ${MAX_IMPORT_NODES.toLocaleString()} nodes. ` +
              `Choose fewer / lower-cardinality hierarchy columns (avoid timestamps, messages, and unique IDs).`,
          );
        }
      }
      cursor = child;
    }
  }
  return wrapDoc(
    title,
    root.children.length ? root.children : [createEmptyNode("Empty")],
  );
}

export type TxtImportMode = "indent" | "blank-lines";

export interface TxtImportOptions {
  mode: TxtImportMode;
  title?: string;
}

export function importTxtToMap(
  text: string,
  options: TxtImportOptions,
): MindMapDocument {
  const title = options.title ?? "Imported Text";
  const lines = text.split(/\r?\n/);

  if (options.mode === "blank-lines") {
    const blocks = text
      .split(/\n\s*\n/)
      .map((b) => b.trim())
      .filter(Boolean);
    const children = blocks.map((block) => {
      const [first, ...rest] = block.split(/\n/).map((l) => l.trim()).filter(Boolean);
      const node = createEmptyNode(first || "Section");
      node.children = rest.map((r) => createEmptyNode(r));
      return node;
    });
    return wrapDoc(title, children.length ? children : [createEmptyNode("Empty")]);
  }

  // indent-based (2 spaces or tabs)
  const root = createEmptyNode(title);
  const stack: { depth: number; node: MindNode }[] = [{ depth: -1, node: root }];

  for (const raw of lines) {
    if (!raw.trim()) continue;
    const match = raw.match(/^(\s*)(.*)$/);
    if (!match) continue;
    const indent = match[1].replace(/\t/g, "  ").length;
    const depth = Math.floor(indent / 2);
    const node = createEmptyNode(match[2].trim());
    while (stack.length > 1 && stack[stack.length - 1].depth >= depth) {
      stack.pop();
    }
    stack[stack.length - 1].node.children.push(node);
    stack.push({ depth, node });
  }

  return wrapDoc(
    title,
    root.children.length ? root.children : [createEmptyNode("Empty")],
  );
}

function wrapDoc(title: string, children: MindNode[]): MindMapDocument {
  const now = new Date().toISOString();
  return {
    version: 1,
    title,
    root: {
      id: crypto.randomUUID(),
      text: title,
      children,
    },
    createdAt: now,
    updatedAt: now,
  };
}

function emptyDoc(title: string): MindMapDocument {
  return wrapDoc(title, [createEmptyNode("Empty")]);
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  // Delay revoke so the browser can start the download.
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
