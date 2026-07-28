import type { MapLink, MindMapDocument, MindNode } from "./types";
import {
  findNode,
  findParent,
  removeNode,
  updateNode,
  collectDescendantIds,
} from "./layout";

/** Search the root tree and any floating node forests. */
export function findNodeInDoc(
  doc: Pick<MindMapDocument, "root" | "floatingNodes">,
  id: string,
): MindNode | null {
  const inRoot = findNode(doc.root, id);
  if (inRoot) return inRoot;
  for (const f of doc.floatingNodes ?? []) {
    const found = findNode(f, id);
    if (found) return found;
  }
  return null;
}

export function findParentInDoc(
  doc: Pick<MindMapDocument, "root" | "floatingNodes">,
  id: string,
): MindNode | null {
  const inRoot = findParent(doc.root, id);
  if (inRoot) return inRoot;
  for (const f of doc.floatingNodes ?? []) {
    if (f.id === id) return null; // floating root has no parent
    const p = findParent(f, id);
    if (p) return p;
  }
  return null;
}

export function isFloatingRoot(
  doc: Pick<MindMapDocument, "floatingNodes">,
  id: string,
): boolean {
  return (doc.floatingNodes ?? []).some((f) => f.id === id);
}

/** Update a node wherever it lives (tree or floating forest). */
export function updateNodeInDoc(
  doc: MindMapDocument,
  id: string,
  updater: (node: MindNode) => MindNode,
): MindMapDocument {
  if (findNode(doc.root, id)) {
    return { ...doc, root: updateNode(doc.root, id, updater) };
  }
  const floatingNodes = (doc.floatingNodes ?? []).map((f) =>
    findNode(f, id) ? updateNode(f, id, updater) : f,
  );
  return { ...doc, floatingNodes };
}

export function removeNodeInDoc(
  doc: MindMapDocument,
  id: string,
): MindMapDocument {
  if (findNode(doc.root, id)) {
    return { ...doc, root: removeNode(doc.root, id) };
  }
  // Removing a floating forest root
  if ((doc.floatingNodes ?? []).some((f) => f.id === id)) {
    return {
      ...doc,
      floatingNodes: (doc.floatingNodes ?? []).filter((f) => f.id !== id),
    };
  }
  const floatingNodes = (doc.floatingNodes ?? []).map((f) =>
    findNode(f, id) ? removeNode(f, id) : f,
  );
  return { ...doc, floatingNodes };
}

/** Move a node between the root tree and floating forests. */
export function reparentNodeInDoc(
  doc: MindMapDocument,
  nodeId: string,
  newParentId: string,
  index?: number,
): MindMapDocument {
  if (nodeId === doc.root.id || nodeId === newParentId) return doc;
  const moving = findNodeInDoc(doc, nodeId);
  if (!moving || findNode(moving, newParentId)) return doc;

  const without = removeNodeInDoc(doc, nodeId);
  if (!findNodeInDoc(without, newParentId)) return doc;
  const copy = structuredClone(moving);
  return updateNodeInDoc(without, newParentId, (parent) => {
    const children = [...parent.children];
    const at =
      index == null
        ? children.length
        : Math.max(0, Math.min(index, children.length));
    children.splice(at, 0, copy);
    return { ...parent, collapsed: false, children };
  });
}

/** Place a node beside a target, including within floating forests. */
export function placeNodeAsSiblingInDoc(
  doc: MindMapDocument,
  nodeId: string,
  targetId: string,
  where: "before" | "after",
): MindMapDocument {
  if (
    nodeId === doc.root.id ||
    targetId === doc.root.id ||
    nodeId === targetId
  ) {
    return doc;
  }
  const moving = findNodeInDoc(doc, nodeId);
  const targetParent = findParentInDoc(doc, targetId);
  if (!moving || !targetParent || findNode(moving, targetId)) return doc;

  const without = removeNodeInDoc(doc, nodeId);
  if (!findNodeInDoc(without, targetId)) return doc;
  const copy = structuredClone(moving);
  return updateNodeInDoc(without, targetParent.id, (parent) => {
    const children = [...parent.children];
    let index = children.findIndex((child) => child.id === targetId);
    if (index < 0) return parent;
    if (where === "after") index += 1;
    children.splice(index, 0, copy);
    return { ...parent, children };
  });
}

export function collectDescendantIdsInDoc(
  doc: Pick<MindMapDocument, "root" | "floatingNodes">,
  id: string,
): string[] {
  const inRoot = findNode(doc.root, id);
  if (inRoot) return collectDescendantIds(doc.root, id);
  for (const f of doc.floatingNodes ?? []) {
    if (findNode(f, id)) return collectDescendantIds(f, id);
  }
  return [];
}

/**
 * Selected node plus its ancestors and descendants — used by presentation
 * mode to glow the active branch and dim everything else.
 */
export function focusPathIds(
  doc: Pick<MindMapDocument, "root" | "floatingNodes">,
  selectedId: string | null | undefined,
): Set<string> {
  const path = new Set<string>();
  if (!selectedId || !findNodeInDoc(doc, selectedId)) return path;

  path.add(selectedId);
  let walk: string | null = selectedId;
  while (walk) {
    const parent = findParentInDoc(doc, walk);
    if (!parent) break;
    path.add(parent.id);
    walk = parent.id;
  }
  for (const id of collectDescendantIdsInDoc(doc, selectedId)) {
    path.add(id);
  }
  return path;
}

export function createMapLink(
  fromId: string,
  toId: string,
  label?: string,
): MapLink {
  return {
    id: crypto.randomUUID(),
    fromId,
    toId,
    label,
  };
}

/** Deep-clone a node (and its subtree), assigning fresh ids throughout. */
export function cloneNodeWithNewIds(node: MindNode): MindNode {
  return {
    ...node,
    id: crypto.randomUUID(),
    images: node.images?.map((img) => ({ ...img, id: crypto.randomUUID() })),
    children: node.children.map(cloneNodeWithNewIds),
  };
}

/** Strip per-node notes and images recursively (used when saving templates). */
export function stripNodeContent(node: MindNode): MindNode {
  const { note: _note, images: _images, image: _image, ...rest } = node;
  return { ...rest, children: node.children.map(stripNodeContent) };
}

/** Drop links that reference missing nodes. */
export function pruneLinks(doc: MindMapDocument): MapLink[] | undefined {
  const links = doc.links;
  if (!links?.length) return undefined;
  const ids = new Set<string>();
  const walk = (n: MindNode) => {
    ids.add(n.id);
    n.children.forEach(walk);
  };
  walk(doc.root);
  (doc.floatingNodes ?? []).forEach(walk);
  const next = links.filter(
    (l) =>
      l.fromId !== l.toId && ids.has(l.fromId) && ids.has(l.toId),
  );
  return next.length ? next : undefined;
}
