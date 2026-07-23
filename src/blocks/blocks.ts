export type BlockKind = "paragraph" | "list-item";

export interface MarkdownBlock {
  id: string;
  explicitId: boolean;
  kind: BlockKind;
  text: string;
  raw: string;
  startLine: number;
  endLine: number;
}

export interface BlockPage {
  path: string;
  title: string;
  content: string;
}

export interface BlockRecord extends MarkdownBlock {
  pagePath: string;
  pageTitle: string;
}

export interface TransclusionOptions {
  maxDepth?: number;
  cycleText?: (id: string) => string;
  missingText?: (id: string) => string;
}

const EXPLICIT_ID = /(?:\s+)\^([A-Za-z0-9][A-Za-z0-9_-]{5,63})\s*$/;
const REFERENCE = /\(\(([A-Za-z0-9][A-Za-z0-9_-]{5,63})\)\)/g;
const EMBED = /\{\{\s*(?:embed|transclude)\s+\(\(([A-Za-z0-9][A-Za-z0-9_-]{5,63})\)\)\s*\}\}/gi;

function hash(value: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${(h2 >>> 0).toString(36)}${(h1 >>> 0).toString(36)}`.slice(0, 12);
}

function virtualId(path: string, startLine: number, text: string): string {
  return `v-${hash(`${path}\u0000${startLine}\u0000${text}`)}`;
}

function isFence(line: string): boolean {
  return /^\s*(```|~~~)/.test(line);
}

/**
 * Parse paragraph and list-item blocks. Blocks without a persisted `^id` get
 * deterministic virtual IDs; callers may explicitly persist them with
 * ensureExplicitBlockIds. Parsing never mutates note content.
 */
export function parseMarkdownBlocks(content: string, pagePath = ""): MarkdownBlock[] {
  const lines = content.split(/\r?\n/);
  const blocks: MarkdownBlock[] = [];
  let inFence = false;
  let paragraphStart = -1;
  let paragraph: string[] = [];

  const add = (raw: string, startLine: number, endLine: number, kind: BlockKind) => {
    const match = raw.match(EXPLICIT_ID);
    const withoutId = match ? raw.slice(0, match.index).trimEnd() : raw.trimEnd();
    const text = kind === "list-item"
      ? withoutId.replace(/^\s*(?:[-+*]|\d+[.)])\s+/, "")
      : withoutId;
    if (!text.trim()) return;
    blocks.push({
      id: match?.[1] ?? virtualId(pagePath, startLine, text),
      explicitId: Boolean(match),
      kind,
      text,
      raw,
      startLine,
      endLine,
    });
  };

  const flushParagraph = (endLine: number) => {
    if (paragraphStart < 0) return;
    add(paragraph.join("\n"), paragraphStart, endLine, "paragraph");
    paragraphStart = -1;
    paragraph = [];
  };

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    if (isFence(line)) {
      flushParagraph(lineNumber - 1);
      inFence = !inFence;
      return;
    }
    if (inFence || /^\s{0,3}#{1,6}\s+/.test(line)) {
      flushParagraph(lineNumber - 1);
      return;
    }
    if (/^\s*(?:[-+*]|\d+[.)])\s+/.test(line)) {
      flushParagraph(lineNumber - 1);
      add(line, lineNumber, lineNumber, "list-item");
      return;
    }
    if (!line.trim()) {
      flushParagraph(lineNumber - 1);
      return;
    }
    if (paragraphStart < 0) paragraphStart = lineNumber;
    paragraph.push(line);
  });
  flushParagraph(lines.length);
  return blocks;
}

/** Persist IDs only when explicitly requested; existing bytes otherwise stay untouched. */
export function ensureExplicitBlockIds(
  content: string,
  pagePath = "",
): { content: string; addedIds: string[] } {
  const blocks = parseMarkdownBlocks(content, pagePath);
  const lines = content.split(/\r?\n/);
  const addedIds: string[] = [];
  for (const block of [...blocks].reverse()) {
    if (block.explicitId) continue;
    const id = `b-${hash(`${pagePath}\u0000${block.startLine}\u0000${block.text}`)}`;
    lines[block.endLine - 1] = `${lines[block.endLine - 1].trimEnd()} ^${id}`;
    addedIds.push(id);
  }
  return { content: lines.join("\n"), addedIds: addedIds.reverse() };
}

export class BlockIndex {
  private readonly blocks = new Map<string, BlockRecord>();
  private readonly idsByPage = new Map<string, Set<string>>();

  upsertPage(page: BlockPage): void {
    this.removePage(page.path);
    const ids = new Set<string>();
    for (const block of parseMarkdownBlocks(page.content, page.path)) {
      this.blocks.set(block.id, {
        ...block,
        pagePath: page.path,
        pageTitle: page.title,
      });
      ids.add(block.id);
    }
    this.idsByPage.set(page.path, ids);
  }

  removePage(path: string): void {
    for (const id of this.idsByPage.get(path) ?? []) this.blocks.delete(id);
    this.idsByPage.delete(path);
  }

  get(id: string): BlockRecord | undefined {
    return this.blocks.get(id);
  }

  values(): BlockRecord[] {
    return [...this.blocks.values()];
  }
}

export function extractBlockReferences(content: string): string[] {
  const ids = new Set<string>();
  for (const match of content.matchAll(REFERENCE)) ids.add(match[1]);
  return [...ids];
}

/**
 * Expand embed directives to Markdown. Plain ((id)) references remain stable
 * textual references. Expansion is bounded and reports cycles/missing blocks.
 */
export function renderTransclusions(
  content: string,
  resolve: (id: string) => BlockRecord | undefined,
  options: TransclusionOptions = {},
): string {
  const maxDepth = Math.max(1, options.maxDepth ?? 8);
  const cycleText = options.cycleText ?? ((id) => `[Circular block reference: ${id}]`);
  const missingText = options.missingText ?? ((id) => `[Missing block: ${id}]`);

  const expand = (value: string, stack: string[], depth: number): string =>
    value.replace(EMBED, (_whole, id: string) => {
      if (stack.includes(id)) return cycleText(id);
      if (depth >= maxDepth) return `[Block embed depth limit: ${id}]`;
      const block = resolve(id);
      if (!block) return missingText(id);
      return expand(block.text, [...stack, id], depth + 1);
    });

  return expand(content, [], 0);
}
