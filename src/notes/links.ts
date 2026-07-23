export function extractWikiLinks(content: string): string[] {
  const links = new Set<string>();
  const re = /\[\[([^\]]+)\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) {
    links.add(m[1].trim());
  }
  return [...links];
}

/** Tags support slash hierarchy: #project/frontend */
export function extractTags(content: string): string[] {
  const tags = new Set<string>();
  const re = /(^|[\s([{])#([a-zA-Z][\w]*(?:\/[\w]+)*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) {
    tags.add(m[2].toLowerCase().replace(/\/+$/, ""));
  }
  return [...tags];
}

export interface NoteIndexEntry {
  name: string;
  path: string;
  content: string;
  links: string[];
  tags: string[];
  /** Relative folder path under notes/, empty for root */
  folder: string;
}

export interface TagLineHit {
  source: "note" | "node";
  noteName: string;
  notePath?: string;
  mapName?: string;
  mapPath?: string;
  nodeId?: string;
  line: string;
  lineNumber: number;
}

export function buildNoteIndex(
  notes: { name: string; path: string; content: string; folder?: string }[],
): NoteIndexEntry[] {
  return notes.map((n) => ({
    name: n.name,
    path: n.path,
    content: n.content,
    folder: n.folder ?? "",
    links: extractWikiLinks(n.content),
    tags: extractTags(n.content),
  }));
}

export function notesWithTag(
  index: NoteIndexEntry[],
  tag: string,
): NoteIndexEntry[] {
  const t = tag.toLowerCase().replace(/^#/, "");
  return index.filter((n) => n.tags.includes(t));
}

export function allTags(index: NoteIndexEntry[]): string[] {
  const set = new Set<string>();
  index.forEach((n) => n.tags.forEach((t) => set.add(t)));
  return [...set].sort();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function linesWithTag(
  content: string,
  tag: string,
): { line: string; lineNumber: number }[] {
  const t = tag.toLowerCase().replace(/^#/, "").replace(/\/+$/, "");
  const re = new RegExp(
    `(^|[\\s([{])#${escapeRegExp(t)}(?![\\w/-])`,
    "i",
  );
  return content
    .split(/\r?\n/)
    .map((line, i) => ({ line, lineNumber: i + 1 }))
    .filter((row) => re.test(row.line));
}

export function collectTagHitsFromNotes(
  index: NoteIndexEntry[],
  tag: string,
): TagLineHit[] {
  const hits: TagLineHit[] = [];
  for (const note of index) {
    for (const row of linesWithTag(note.content, tag)) {
      hits.push({
        source: "note",
        noteName: note.name,
        notePath: note.path,
        line: row.line,
        lineNumber: row.lineNumber,
      });
    }
  }
  return hits;
}

/**
 * Tags that co-occur with `tag` in the same note body, sorted by frequency.
 */
export function relatedTags(
  index: NoteIndexEntry[],
  tag: string,
  mapNodeTagSets: string[][] = [],
): { tag: string; count: number }[] {
  const t = tag.toLowerCase().replace(/^#/, "");
  const counts = new Map<string, number>();
  const bump = (other: string) => {
    if (other === t) return;
    counts.set(other, (counts.get(other) ?? 0) + 1);
  };
  for (const note of index) {
    if (!note.tags.includes(t)) continue;
    for (const other of note.tags) bump(other);
  }
  for (const tags of mapNodeTagSets) {
    if (!tags.includes(t)) continue;
    for (const other of tags) bump(other);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ tag: name, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

export interface TagTreeNode {
  tag: string;
  /** Display segment after the last slash */
  label: string;
  depth: number;
  children: TagTreeNode[];
}

/** Build a forest from slash-separated tags for indented browser lists. */
export function buildTagForest(tags: string[]): TagTreeNode[] {
  const sorted = [...new Set(tags.map((t) => t.toLowerCase().replace(/^#/, "")))].sort();
  const roots: TagTreeNode[] = [];
  const byPath = new Map<string, TagTreeNode>();

  for (const tag of sorted) {
    const parts = tag.split("/").filter(Boolean);
    let path = "";
    for (let i = 0; i < parts.length; i++) {
      const parentPath = path;
      path = path ? `${path}/${parts[i]}` : parts[i];
      if (byPath.has(path)) continue;
      const node: TagTreeNode = {
        tag: path,
        label: parts[i],
        depth: i,
        children: [],
      };
      byPath.set(path, node);
      if (i === 0) {
        roots.push(node);
      } else {
        byPath.get(parentPath)?.children.push(node);
      }
    }
  }
  return roots;
}

export function flattenTagForest(forest: TagTreeNode[]): TagTreeNode[] {
  const out: TagTreeNode[] = [];
  const walk = (nodes: TagTreeNode[]) => {
    for (const n of nodes) {
      out.push(n);
      walk(n.children);
    }
  };
  walk(forest);
  return out;
}
