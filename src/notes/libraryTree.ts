import type { LibraryFolderSort, RecentPathEntry } from "../mindmap/types";

export type { LibraryFolderSort, RecentPathEntry };

export type FolderStats = {
  mtime: number;
  birthtime: number;
};

export type LibraryEntry = {
  kind: "map" | "note";
  name: string;
  path: string;
  folder: string;
};

export type MapNoteBundle = {
  map: LibraryEntry;
  notes: LibraryEntry[];
  expandKey: string;
};

export type FolderNode = {
  name: string;
  path: string;
  children: FolderNode[];
  items: LibraryEntry[];
  bundles: MapNoteBundle[];
};

export function parentFolderPath(folder: string): string {
  const i = folder.lastIndexOf("/");
  return i === -1 ? "" : folder.slice(0, i);
}

export function folderSegmentName(folder: string): string {
  const i = folder.lastIndexOf("/");
  return i === -1 ? folder : folder.slice(i + 1);
}

/** True if `folder` is `ancestor` or nested under it. */
export function isFolderUnder(folder: string, ancestor: string): boolean {
  if (!ancestor) return true;
  return folder === ancestor || folder.startsWith(`${ancestor}/`);
}

/** Remap a moved folder path (and descendants) in a custom-order list. */
export function remapFolderOrderPaths(
  order: string[],
  fromPath: string,
  toPath: string,
): string[] {
  return order.map((path) => {
    if (path === fromPath) return toPath;
    if (path.startsWith(`${fromPath}/`)) {
      return `${toPath}${path.slice(fromPath.length)}`;
    }
    return path;
  });
}

export function childFolderPath(parent: string, name: string): string {
  return parent ? `${parent}/${name}` : name;
}

/** Ensure every path and its ancestors are present. */
export function expandFolderAncestors(paths: Iterable<string>): string[] {
  const set = new Set<string>();
  for (const raw of paths) {
    const parts = raw.split("/").filter(Boolean);
    let acc = "";
    for (const part of parts) {
      acc = acc ? `${acc}/${part}` : part;
      set.add(acc);
    }
  }
  return [...set];
}

export function buildFolderTree(
  folderPaths: Iterable<string>,
  itemsByFolder: Map<string, LibraryEntry[]>,
  bundlesByFolder: Map<string, MapNoteBundle[]>,
): FolderNode[] {
  const paths = expandFolderAncestors([
    ...folderPaths,
    ...itemsByFolder.keys(),
    ...bundlesByFolder.keys(),
  ].filter(Boolean));

  const nodes = new Map<string, FolderNode>();
  for (const path of paths) {
    nodes.set(path, {
      name: folderSegmentName(path),
      path,
      children: [],
      items: itemsByFolder.get(path) ?? [],
      bundles: bundlesByFolder.get(path) ?? [],
    });
  }

  const roots: FolderNode[] = [];
  for (const path of paths) {
    const node = nodes.get(path)!;
    const parent = parentFolderPath(path);
    if (!parent) roots.push(node);
    else nodes.get(parent)?.children.push(node);
  }
  return roots;
}

function orderIndex(order: string[], path: string): number {
  const i = order.indexOf(path);
  return i === -1 ? Number.POSITIVE_INFINITY : i;
}

export function compareFolderPaths(
  aPath: string,
  bPath: string,
  aName: string,
  bName: string,
  mode: LibraryFolderSort,
  stats: Record<string, FolderStats>,
  order: string[],
): number {
  if (mode === "alpha") return aName.localeCompare(bName);
  if (mode === "custom") {
    const ai = orderIndex(order, aPath);
    const bi = orderIndex(order, bPath);
    if (ai !== bi) return ai - bi;
    return aName.localeCompare(bName);
  }
  const aStat = stats[aPath];
  const bStat = stats[bPath];
  if (mode === "modified") {
    const am = aStat?.mtime ?? -1;
    const bm = bStat?.mtime ?? -1;
    if (am !== bm) return bm - am; // newest first
    return aName.localeCompare(bName);
  }
  // created
  const ac = aStat?.birthtime ?? aStat?.mtime ?? -1;
  const bc = bStat?.birthtime ?? bStat?.mtime ?? -1;
  if (ac !== bc) return bc - ac; // newest first
  return aName.localeCompare(bName);
}

export function sortFolderNodes(
  nodes: FolderNode[],
  mode: LibraryFolderSort,
  stats: Record<string, FolderStats>,
  order: string[],
): FolderNode[] {
  const sorted = [...nodes].sort((a, b) =>
    compareFolderPaths(a.path, b.path, a.name, b.name, mode, stats, order),
  );
  return sorted.map((node) => ({
    ...node,
    children: sortFolderNodes(node.children, mode, stats, order),
  }));
}

/**
 * Reorder `dragged` among siblings relative to `target`.
 * Returns an updated flat `libraryFolderOrder` list.
 */
export function reorderSiblingFolders(
  order: string[],
  allFolderPaths: string[],
  dragged: string,
  target: string,
  place: "before" | "after" = "before",
): string[] | null {
  if (dragged === target) return null;
  if (parentFolderPath(dragged) !== parentFolderPath(target)) return null;

  const parent = parentFolderPath(dragged);
  const siblings = allFolderPaths.filter((p) => parentFolderPath(p) === parent);
  if (!siblings.includes(dragged) || !siblings.includes(target)) return null;

  const siblingSet = new Set(siblings);
  const orderedSiblings = [...siblings].sort((a, b) =>
    compareFolderPaths(
      a,
      b,
      folderSegmentName(a),
      folderSegmentName(b),
      "custom",
      {},
      order,
    ),
  );
  const without = orderedSiblings.filter((p) => p !== dragged);
  const idx = without.indexOf(target);
  let nextSiblings: string[];
  if (idx === -1) {
    nextSiblings = [...without, dragged];
  } else if (place === "before") {
    nextSiblings = [
      ...without.slice(0, idx),
      dragged,
      ...without.slice(idx),
    ];
  } else {
    nextSiblings = [
      ...without.slice(0, idx + 1),
      dragged,
      ...without.slice(idx + 1),
    ];
  }

  // No-op if order among siblings is unchanged.
  if (
    nextSiblings.length === orderedSiblings.length &&
    nextSiblings.every((p, i) => p === orderedSiblings[i])
  ) {
    return null;
  }

  const known = new Set(allFolderPaths);
  const baseOrder = [
    ...order.filter((p) => known.has(p)),
    ...allFolderPaths.filter((p) => !order.includes(p)),
  ];

  const result: string[] = [];
  let emitted = false;
  for (const path of baseOrder) {
    if (siblingSet.has(path)) {
      if (!emitted) {
        result.push(...nextSiblings);
        emitted = true;
      }
      continue;
    }
    result.push(path);
  }
  if (!emitted) result.push(...nextSiblings);
  return result;
}

function entryMatches(entry: LibraryEntry, query: string): boolean {
  return entry.name.toLowerCase().includes(query);
}

function bundleMatches(bundle: MapNoteBundle, query: string): boolean {
  return (
    entryMatches(bundle.map, query) ||
    bundle.notes.some((note) => entryMatches(note, query))
  );
}

export function filterLibraryEntries(
  entries: LibraryEntry[],
  query: string,
): LibraryEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  return entries.filter((entry) => entryMatches(entry, q));
}

export function filterLibraryBundles(
  bundles: MapNoteBundle[],
  query: string,
): MapNoteBundle[] {
  const q = query.trim().toLowerCase();
  if (!q) return bundles;
  return bundles.filter((bundle) => bundleMatches(bundle, q));
}

/**
 * Keep a folder if its own name matches, or any descendant item/bundle/child
 * folder matches. A folder whose own name matches keeps its full subtree.
 */
function filterFolderNode(node: FolderNode, query: string): FolderNode | null {
  if (node.name.toLowerCase().includes(query)) return node;

  const children = node.children
    .map((child) => filterFolderNode(child, query))
    .filter((child): child is FolderNode => child !== null);
  const items = node.items.filter((entry) => entryMatches(entry, query));
  const bundles = node.bundles.filter((bundle) => bundleMatches(bundle, query));

  if (children.length === 0 && items.length === 0 && bundles.length === 0) {
    return null;
  }
  return { ...node, children, items, bundles };
}

export function filterFolderTree(
  nodes: FolderNode[],
  query: string,
): FolderNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return nodes;
  return nodes
    .map((node) => filterFolderNode(node, q))
    .filter((node): node is FolderNode => node !== null);
}

/** Max recent maps/notes kept in vault settings and shown in the library pane. */
export const RECENT_PATHS_MAX = 5;

/** Push a recently opened map/note to the front, deduped, capped at `max`. */
export function withRecentPath(
  recentPaths: RecentPathEntry[] | undefined,
  entry: RecentPathEntry,
  max = RECENT_PATHS_MAX,
): RecentPathEntry[] {
  const rest = (recentPaths ?? []).filter((r) => r.path !== entry.path);
  return [entry, ...rest].slice(0, max);
}
