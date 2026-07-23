import type {
  FlowDir,
  LayoutEdge,
  LayoutNode,
  LayoutResult,
  MapLayoutStyle,
  MapLink,
  MindNode,
  NodeImage,
  NodeStyle,
  RadialDir,
} from "./types";
import {
  NODE_IMAGE_GAP,
  MIN_NODE_IMAGE,
  normalizeNodeImages,
  packNodeImages,
} from "./nodeImages";

const H_GAP = 56;
const V_GAP = 24;
/** Vertical gap between parent/child levels in top-down layout. */
const DOWN_DEPTH_GAP = 48;
/** Horizontal gap between sibling subtrees in top-down layout. */
const DOWN_SIBLING_GAP = 28;
const PAD_X = 16;
const PAD_Y = 10;
const MIN_W = 80;
/** Soft max width — long text wraps inside the node by default. */
const MAX_W = 320;

function charWidth(fontSize: number, scale: number) {
  return fontSize * 0.58 * scale;
}

/** Wrap node text to the measured content width (word-aware, then hard-break). */
export function wrapNodeTextLines(
  text: string,
  fontSize: number,
  scale: number,
  boxWidth: number,
): string[] {
  const contentW = Math.max(1, boxWidth - PAD_X * 2);
  const cw = charWidth(fontSize, scale);
  const lines: string[] = [];

  for (const para of (text || " ").split("\n")) {
    if (!para) {
      lines.push(" ");
      continue;
    }
    const words = para.split(/(\s+)/);
    let current = "";
    for (const word of words) {
      if (!word) continue;
      const test = current + word;
      if (current && test.length * cw > contentW) {
        lines.push(current.replace(/\s+$/, "") || " ");
        current = word.replace(/^\s+/, "");
        // Hard-break an oversized token.
        while (current.length * cw > contentW) {
          const fit = Math.max(1, Math.floor(contentW / cw));
          lines.push(current.slice(0, fit));
          current = current.slice(fit);
        }
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
  }

  return lines.length ? lines : [" "];
}

function measureText(text: string, fontSize: number, scale: number) {
  const paragraphs = (text || " ").split("\n");
  let width = MIN_W * scale;
  let totalLines = 0;
  const cw = charWidth(fontSize, scale);

  for (const para of paragraphs) {
    const chars = Math.max(para.length, 1);
    const natural = chars * cw;
    const lineWidth = Math.min(
      MAX_W * scale,
      Math.max(MIN_W * scale, natural + PAD_X * 2),
    );
    width = Math.max(width, lineWidth);
  }

  const wrapped = wrapNodeTextLines(text, fontSize, scale, width);
  totalLines = wrapped.length;

  const height = Math.max(
    32 * scale,
    totalLines * fontSize * 1.35 * scale + PAD_Y * 2,
  );
  return { width, height };
}

function measureNode(
  text: string,
  fontSize: number,
  scale: number,
  images: NodeImage[],
) {
  const textSize = measureText(text, fontSize, scale);
  if (images.length === 0) return textSize;
  // Pack against a row at least as wide as the largest image so oversized
  // images expand the node instead of being clipped to text width.
  const widestImage = images.reduce(
    (m, img) => Math.max(m, Math.max(MIN_NODE_IMAGE, img.width) * scale),
    0,
  );
  const maxRow = Math.max(
    textSize.width - PAD_X * 2,
    widestImage,
    MAX_W * scale * 0.55,
  );
  const block = packNodeImages(images, scale, maxRow);
  return {
    width: Math.max(textSize.width, block.width + PAD_X * 2, MIN_W * scale),
    height: textSize.height + block.height + NODE_IMAGE_GAP,
  };
}

/** Layout placements for images inside a sized node (centered strip above text). */
export function nodeImagesLayout(
  nodeWidth: number,
  scale: number,
  fontSize: number,
  text: string,
  images: NodeImage[],
) {
  const textSize = measureText(text, fontSize, scale);
  const maxRow = Math.max(nodeWidth - PAD_X * 2, 1);
  const block = packNodeImages(images, scale, maxRow);
  const offsetX = (nodeWidth - block.width) / 2;
  const imageY = PAD_Y * scale * 0.45;
  const placements = block.placements.map((p) => ({
    ...p,
    x: p.x + offsetX,
    y: p.y + imageY,
  }));
  const textCenterY =
    images.length === 0
      ? textSize.height / 2
      : imageY + block.height + NODE_IMAGE_GAP + textSize.height / 2;
  return {
    placements,
    textCenterY,
    imagesHeight: block.height,
  };
}

interface ContourNode {
  node: MindNode;
  depth: number;
  width: number;
  height: number;
  y: number;
  children: ContourNode[];
  style: NodeStyle;
}

function buildContour(
  node: MindNode,
  depth: number,
  defaults: NodeStyle,
): ContourNode {
  const style = { ...defaults, ...node.style };
  const fontSize = style.fontSize ?? 14;
  const scale = style.scale ?? 1;
  const images = normalizeNodeImages(node);
  const { width, height } = measureNode(
    node.text || " ",
    fontSize,
    scale,
    images,
  );
  const collapsed = !!node.collapsed;
  const children =
    collapsed || node.children.length === 0
      ? []
      : node.children.map((c) => buildContour(c, depth + 1, defaults));

  return {
    node,
    depth,
    width,
    height,
    y: 0,
    children,
    style,
  };
}

function subtreeHeight(n: ContourNode): number {
  if (n.children.length === 0) return n.height;
  const kids = n.children.reduce(
    (sum, c, i) => sum + subtreeHeight(c) + (i > 0 ? V_GAP : 0),
    0,
  );
  return Math.max(n.height, kids);
}

function assignY(n: ContourNode, top: number): void {
  if (n.children.length === 0) {
    n.y = top + n.height / 2;
    return;
  }
  const kidsH = n.children.reduce(
    (sum, c, i) => sum + subtreeHeight(c) + (i > 0 ? V_GAP : 0),
    0,
  );
  // Keep parent box inside [top, top+allocated] when it is taller than kids.
  const allocated = Math.max(n.height, kidsH);
  let cursor = top + (allocated - kidsH) / 2;
  for (let i = 0; i < n.children.length; i++) {
    const child = n.children[i];
    const h = subtreeHeight(child);
    assignY(child, cursor);
    cursor += h + V_GAP;
  }
  n.y = top + allocated / 2;
}

function flattenRight(
  n: ContourNode,
  x: number,
  parentId: string | null,
  nodes: LayoutNode[],
  edges: LayoutEdge[],
): void {
  const layoutNode: LayoutNode = {
    id: n.node.id,
    text: n.node.text,
    note: n.node.note,
    images: normalizeNodeImages(n.node),
    collapsed: !!n.node.collapsed,
    style: n.style,
    x,
    y: n.y - n.height / 2,
    width: n.width,
    height: n.height,
    depth: n.depth,
    parentId,
    childIds: n.node.children.map((c) => c.id),
    hasChildren: n.node.children.length > 0,
  };
  nodes.push(layoutNode);

  if (parentId) {
    const parent = nodes.find((p) => p.id === parentId);
    if (parent) {
      edges.push({
        fromId: parentId,
        toId: n.node.id,
        x1: parent.x + parent.width,
        y1: parent.y + parent.height / 2,
        x2: x,
        y2: n.y,
      });
    }
  }

  const childX = x + n.width + H_GAP;
  for (const child of n.children) {
    flattenRight(child, childX, n.node.id, nodes, edges);
  }
}

function layoutRight(root: MindNode, defaults: NodeStyle): LayoutResult {
  const contour = buildContour(root, 0, defaults);
  const totalH = subtreeHeight(contour);
  assignY(contour, 40);
  const nodes: LayoutNode[] = [];
  const edges: LayoutEdge[] = [];
  flattenRight(contour, 40, null, nodes, edges);
  const width = nodes.reduce((m, n) => Math.max(m, n.x + n.width), 0) + 80;
  const height = Math.max(
    totalH + 80,
    nodes.reduce((m, n) => Math.max(m, n.y + n.height), 0) + 80,
  );
  return { nodes, edges, width, height };
}

function transformLayout(
  base: LayoutResult,
  style: MapLayoutStyle,
): LayoutResult {
  if (style === "right") return base;

  if (style === "left") {
    const maxRight = base.nodes.reduce((m, n) => Math.max(m, n.x + n.width), 0);
    const nodes = base.nodes.map((n) => ({
      ...n,
      x: maxRight - n.x - n.width + 40,
    }));
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const edges = base.edges.map((e) => {
      const from = byId.get(e.fromId)!;
      const to = byId.get(e.toId)!;
      return {
        ...e,
        x1: from.x,
        y1: from.y + from.height / 2,
        x2: to.x + to.width,
        y2: to.y + to.height / 2,
      };
    });
    return {
      nodes,
      edges,
      width: base.width,
      height: base.height,
    };
  }

  return base;
}

const RADIAL_ROOT_GAP = 96;
const RADIAL_ARM_PAD = 48;
/** Gap between sibling subtrees packed into one radial arm. */
const RADIAL_SIBLING_GAP = 36;

function boundsOf(nodes: LayoutNode[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + n.width);
    maxY = Math.max(maxY, n.y + n.height);
  }
  return { minX, minY, maxX, maxY };
}

function translateNodes(
  nodes: LayoutNode[],
  dx: number,
  dy: number,
  depthAdd = 0,
): LayoutNode[] {
  return nodes.map((n) => ({
    ...n,
    x: n.x + dx,
    y: n.y + dy,
    depth: n.depth + depthAdd,
  }));
}

/** Stack subtree layouts into one block (normalized to 0,0). */
function stackSubtrees(
  subs: LayoutResult[],
  axis: "vertical" | "horizontal",
  gap: number,
): LayoutNode[] {
  const placed: LayoutNode[] = [];
  let cursor = 0;
  for (const sub of subs) {
    if (sub.nodes.length === 0) continue;
    const b = boundsOf(sub.nodes);
    if (axis === "vertical") {
      for (const n of sub.nodes) {
        placed.push({
          ...n,
          x: n.x - b.minX,
          y: n.y - b.minY + cursor,
        });
      }
      cursor += b.maxY - b.minY + gap;
    } else {
      for (const n of sub.nodes) {
        placed.push({
          ...n,
          x: n.x - b.minX + cursor,
          y: n.y - b.minY,
        });
      }
      cursor += b.maxX - b.minX + gap;
    }
  }
  return placed;
}

function mirrorNodesHorizontal(nodes: LayoutNode[]): LayoutNode[] {
  const b = boundsOf(nodes);
  return nodes.map((n) => ({
    ...n,
    x: b.maxX - (n.x + n.width) + b.minX,
  }));
}

function mirrorNodesVertical(nodes: LayoutNode[]): LayoutNode[] {
  const b = boundsOf(nodes);
  return nodes.map((n) => ({
    ...n,
    y: b.maxY - (n.y + n.height) + b.minY,
  }));
}

function partitionRadialChildren(
  children: MindNode[],
  radialDirs?: Record<string, RadialDir>,
): Record<RadialDir, MindNode[]> {
  const buckets: Record<RadialDir, MindNode[]> = {
    right: [],
    left: [],
    down: [],
    up: [],
  };
  if (children.length === 0) return buckets;

  const unassigned: MindNode[] = [];
  for (const child of children) {
    const hinted = radialDirs?.[child.id];
    if (hinted) buckets[hinted].push(child);
    else unassigned.push(child);
  }

  const order: RadialDir[] = ["right", "left", "down", "up"];
  for (const child of unassigned) {
    let best: RadialDir = order[0];
    let bestCount = buckets[best].length;
    for (const d of order) {
      if (buckets[d].length < bestCount) {
        best = d;
        bestCount = buckets[d].length;
      }
    }
    buckets[best].push(child);
  }
  return buckets;
}

function boxesOverlap(
  a: { minX: number; minY: number; maxX: number; maxY: number },
  b: { minX: number; minY: number; maxX: number; maxY: number },
  pad = 0,
): boolean {
  return !(
    a.maxX + pad <= b.minX ||
    b.maxX + pad <= a.minX ||
    a.maxY + pad <= b.minY ||
    b.maxY + pad <= a.minY
  );
}

/**
 * Place a pre-laid-out arm block against the root on the given side, then push
 * the block outward until it clears other already-placed arm boxes.
 */
function placeRadialArm(
  block: LayoutNode[],
  dir: RadialDir,
  rootNode: LayoutNode,
  cx: number,
  cy: number,
  occupied: { minX: number; minY: number; maxX: number; maxY: number }[],
): LayoutNode[] {
  const baseGap = RADIAL_ROOT_GAP;
  let gap = baseGap;

  for (let attempt = 0; attempt < 40; attempt++) {
    const b = boundsOf(block);
    let dx = 0;
    let dy = 0;
    if (dir === "right") {
      dx = rootNode.x + rootNode.width + gap - b.minX;
      dy = cy - (b.minY + b.maxY) / 2;
    } else if (dir === "left") {
      dx = rootNode.x - gap - b.maxX;
      dy = cy - (b.minY + b.maxY) / 2;
    } else if (dir === "down") {
      dx = cx - (b.minX + b.maxX) / 2;
      dy = rootNode.y + rootNode.height + gap - b.minY;
    } else {
      dx = cx - (b.minX + b.maxX) / 2;
      dy = rootNode.y - gap - b.maxY;
    }

    const placed = translateNodes(block, dx, dy);
    const box = boundsOf(placed);
    const hits = occupied.some((other) =>
      boxesOverlap(box, other, RADIAL_ARM_PAD),
    );
    if (!hits) {
      occupied.push(box);
      return placed;
    }
    gap += 44;
  }

  // Last resort: keep pushing outward until clear of occupied (no soft overlap).
  for (let extra = 0; extra < 20; extra++) {
    gap += 48;
    const b = boundsOf(block);
    let dx = 0;
    let dy = 0;
    if (dir === "right") {
      dx = rootNode.x + rootNode.width + gap - b.minX;
      dy = cy - (b.minY + b.maxY) / 2;
    } else if (dir === "left") {
      dx = rootNode.x - gap - b.maxX;
      dy = cy - (b.minY + b.maxY) / 2;
    } else if (dir === "down") {
      dx = cx - (b.minX + b.maxX) / 2;
      dy = rootNode.y + rootNode.height + gap - b.minY;
    } else {
      dx = cx - (b.minX + b.maxX) / 2;
      dy = rootNode.y - gap - b.maxY;
    }
    const placed = translateNodes(block, dx, dy);
    const box = boundsOf(placed);
    if (!occupied.some((other) => boxesOverlap(box, other, RADIAL_ARM_PAD))) {
      occupied.push(box);
      return placed;
    }
  }

  const b = boundsOf(block);
  let dx = 0;
  let dy = 0;
  if (dir === "right") {
    dx = rootNode.x + rootNode.width + gap - b.minX;
    dy = cy - (b.minY + b.maxY) / 2;
  } else if (dir === "left") {
    dx = rootNode.x - gap - b.maxX;
    dy = cy - (b.minY + b.maxY) / 2;
  } else if (dir === "down") {
    dx = cx - (b.minX + b.maxX) / 2;
    dy = rootNode.y + rootNode.height + gap - b.minY;
  } else {
    dx = cx - (b.minX + b.maxX) / 2;
    dy = rootNode.y - gap - b.maxY;
  }
  const placed = translateNodes(block, dx, dy);
  occupied.push(boundsOf(placed));
  return placed;
}

function layoutRadial(
  root: MindNode,
  defaults: NodeStyle,
  radialDirs?: Record<string, RadialDir>,
): LayoutResult {
  const baseScale = root.style?.scale ?? defaults.scale ?? 1;
  const baseFont = root.style?.fontSize ?? defaults.fontSize ?? 14;
  const rootStyle: NodeStyle = {
    ...defaults,
    ...root.style,
    scale: Math.max(baseScale, 1) * 1.45,
    fontSize: Math.max(baseFont, 15) * 1.2,
  };
  const rootSize = measureNode(
    root.text || " ",
    rootStyle.fontSize ?? 18,
    rootStyle.scale ?? 1.45,
    normalizeNodeImages(root),
  );

  const cx = 520;
  const cy = 420;
  const rootNode: LayoutNode = {
    id: root.id,
    text: root.text,
    note: root.note,
    images: normalizeNodeImages(root),
    collapsed: !!root.collapsed,
    style: rootStyle,
    x: cx - rootSize.width / 2,
    y: cy - rootSize.height / 2,
    width: rootSize.width,
    height: rootSize.height,
    depth: 0,
    parentId: null,
    childIds: root.children.map((c) => c.id),
    hasChildren: root.children.length > 0,
  };

  const nodes: LayoutNode[] = [rootNode];
  if (root.collapsed || root.children.length === 0) {
    return {
      nodes,
      edges: [],
      width: rootNode.x + rootNode.width + 80,
      height: rootNode.y + rootNode.height + 80,
    };
  }

  const buckets = partitionRadialChildren(root.children, radialDirs);
  const occupied: { minX: number; minY: number; maxX: number; maxY: number }[] =
    [
      {
        minX: rootNode.x,
        minY: rootNode.y,
        maxX: rootNode.x + rootNode.width,
        maxY: rootNode.y + rootNode.height,
      },
    ];
  // Larger arms first so smaller ones fit into remaining space more easily
  const dirs = (["right", "left", "down", "up"] as RadialDir[]).sort(
    (a, b) => buckets[b].length - buckets[a].length,
  );

  for (const dir of dirs) {
    const kids = buckets[dir];
    if (kids.length === 0) continue;

    const useDown = dir === "down" || dir === "up";
    const siblingGap = useDown
      ? Math.max(DOWN_SIBLING_GAP + 12, RADIAL_SIBLING_GAP)
      : RADIAL_SIBLING_GAP;
    const subs = kids.map((child) =>
      useDown ? layoutDown(child, defaults) : layoutRight(child, defaults),
    );
    let block = stackSubtrees(
      subs,
      useDown ? "horizontal" : "vertical",
      siblingGap,
    );
    if (block.length === 0) continue;

    if (dir === "left") block = mirrorNodesHorizontal(block);
    if (dir === "up") block = mirrorNodesVertical(block);

    // Branch roots were laid out as local roots (parentId null) — attach to map root.
    const kidIds = new Set(kids.map((k) => k.id));
    block = block.map((n) => ({
      ...n,
      depth: n.depth + 1,
      parentId: kidIds.has(n.id) ? root.id : n.parentId,
    }));

    nodes.push(...placeRadialArm(block, dir, rootNode, cx, cy, occupied));
  }

  const box = boundsOf(nodes);
  // Normalize so content isn't clipped at negative coords
  const pad = 80;
  const shiftX = pad - box.minX;
  const shiftY = pad - box.minY;
  const shifted = translateNodes(nodes, shiftX, shiftY);
  const shiftedEdges = rebuildEdges(shifted, "radial");
  const final = boundsOf(shifted);

  return {
    nodes: shifted,
    edges: shiftedEdges,
    width: final.maxX + pad,
    height: final.maxY + pad,
  };
}

function subtreeWidth(n: ContourNode): number {
  if (n.children.length === 0) return n.width;
  const kids = n.children.reduce(
    (sum, c, i) => sum + subtreeWidth(c) + (i > 0 ? DOWN_SIBLING_GAP : 0),
    0,
  );
  return Math.max(n.width, kids);
}

/** Pack siblings horizontally; ContourNode.y stores horizontal center. */
function assignX(n: ContourNode, left: number): void {
  if (n.children.length === 0) {
    n.y = left + n.width / 2;
    return;
  }
  const kidsW = n.children.reduce(
    (sum, c, i) => sum + subtreeWidth(c) + (i > 0 ? DOWN_SIBLING_GAP : 0),
    0,
  );
  const allocated = Math.max(n.width, kidsW);
  let cursor = left + (allocated - kidsW) / 2;
  for (let i = 0; i < n.children.length; i++) {
    const child = n.children[i];
    const w = subtreeWidth(child);
    assignX(child, cursor);
    cursor += w + DOWN_SIBLING_GAP;
  }
  n.y = left + allocated / 2;
}

function layoutDown(
  root: MindNode,
  defaults: NodeStyle,
  roomy = false,
): LayoutResult {
  const contour = buildContour(root, 0, defaults);
  const totalW = subtreeWidth(contour);
  assignX(contour, 40);
  const nodes: LayoutNode[] = [];
  const edges: LayoutEdge[] = [];
  // Temporarily widen gaps for flowchart via local constants in flatten
  const depthGap = roomy ? DOWN_DEPTH_GAP + 28 : DOWN_DEPTH_GAP;
  flattenDownSpaced(contour, 40, null, nodes, edges, depthGap);
  const width = Math.max(
    totalW + 80,
    nodes.reduce((m, n) => Math.max(m, n.x + n.width), 0) + 80,
  );
  const height = nodes.reduce((m, n) => Math.max(m, n.y + n.height), 0) + 80;
  return { nodes, edges, width, height };
}

function flattenDownSpaced(
  n: ContourNode,
  y: number,
  parentId: string | null,
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  depthGap: number,
): void {
  const x = n.y - n.width / 2;
  const layoutNode: LayoutNode = {
    id: n.node.id,
    text: n.node.text,
    note: n.node.note,
    images: normalizeNodeImages(n.node),
    collapsed: !!n.node.collapsed,
    style: n.style,
    x,
    y,
    width: n.width,
    height: n.height,
    depth: n.depth,
    parentId,
    childIds: n.node.children.map((c) => c.id),
    hasChildren: n.node.children.length > 0,
  };
  nodes.push(layoutNode);

  if (parentId) {
    const parent = nodes.find((p) => p.id === parentId);
    if (parent) {
      edges.push({
        fromId: parentId,
        toId: n.node.id,
        kind: "tree",
        x1: parent.x + parent.width / 2,
        y1: parent.y + parent.height,
        x2: x + n.width / 2,
        y2: y,
      });
    }
  }

  const childY = y + n.height + depthGap;
  for (const child of n.children) {
    flattenDownSpaced(child, childY, n.node.id, nodes, edges, depthGap);
  }
}

function layoutFlowRight(root: MindNode, defaults: NodeStyle): LayoutResult {
  // Roomier horizontal flowchart (same structure as right tree, wider gaps).
  const contour = buildContour(root, 0, defaults);
  const totalH = subtreeHeight(contour);
  assignY(contour, 40);
  const nodes: LayoutNode[] = [];
  const edges: LayoutEdge[] = [];
  flattenRightSpaced(contour, 40, null, nodes, edges, H_GAP + 24, V_GAP + 10);
  const width = nodes.reduce((m, n) => Math.max(m, n.x + n.width), 0) + 80;
  const height = Math.max(
    totalH + 80,
    nodes.reduce((m, n) => Math.max(m, n.y + n.height), 0) + 80,
  );
  return { nodes, edges, width, height };
}

function flattenRightSpaced(
  n: ContourNode,
  x: number,
  parentId: string | null,
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  hGap: number,
  vGap: number,
): void {
  const layoutNode: LayoutNode = {
    id: n.node.id,
    text: n.node.text,
    note: n.node.note,
    images: normalizeNodeImages(n.node),
    collapsed: !!n.node.collapsed,
    style: n.style,
    x,
    y: n.y - n.height / 2,
    width: n.width,
    height: n.height,
    depth: n.depth,
    parentId,
    childIds: n.node.children.map((c) => c.id),
    hasChildren: n.node.children.length > 0,
  };
  nodes.push(layoutNode);

  if (parentId) {
    const parent = nodes.find((p) => p.id === parentId);
    if (parent) {
      edges.push({
        fromId: parentId,
        toId: n.node.id,
        kind: "tree",
        x1: parent.x + parent.width,
        y1: parent.y + parent.height / 2,
        x2: x,
        y2: n.y,
      });
    }
  }

  if (n.children.length === 0) return;
  // Re-pack children with wider vertical gap by adjusting positions after standard assignY
  const childX = x + n.width + hGap;
  for (const child of n.children) {
    flattenRightSpaced(child, childX, n.node.id, nodes, edges, hGap, vGap);
  }
}

type SeparateAxis = "xy" | "x" | "y";

/**
 * Push apart hard-overlapping AABBs. Soft pad > sibling gap scrambles tidy
 * tree columns, so callers should use pad ≈ 0 for auto layouts.
 * Axis-constrained modes only nudge along the packing axis (trees).
 */
function separateOverlappingNodes(
  nodes: LayoutNode[],
  pad = 0,
  iterations = 48,
  axis: SeparateAxis = "xy",
): LayoutNode[] {
  const n = nodes.length;
  // Pairwise separation is O(iterations × n²). Cap work so large imports cannot
  // freeze or kill the webview when the map first opens.
  if (n <= 1) return nodes;
  if (n > 2_500) return nodes;
  const maxIter =
    n > 1_200 ? 4 : n > 600 ? 8 : n > 300 ? 16 : iterations;

  const next = nodes.map((node) => ({ ...node }));
  for (let iter = 0; iter < maxIter; iter++) {
    let moved = false;
    for (let i = 0; i < next.length; i++) {
      for (let j = i + 1; j < next.length; j++) {
        const a = next[i];
        const b = next[j];
        const ax2 = a.x + a.width + pad;
        const ay2 = a.y + a.height + pad;
        const bx2 = b.x + b.width + pad;
        const by2 = b.y + b.height + pad;
        if (a.x >= bx2 || b.x >= ax2 || a.y >= by2 || b.y >= ay2) continue;

        const acx = a.x + a.width / 2;
        const acy = a.y + a.height / 2;
        const bcx = b.x + b.width / 2;
        const bcy = b.y + b.height / 2;
        let dx = bcx - acx;
        let dy = bcy - acy;
        if (axis === "y") dx = 0;
        if (axis === "x") dy = 0;
        const dist = Math.hypot(dx, dy) || 1;
        dx /= dist;
        dy /= dist;

        const overlapX = Math.min(ax2, bx2) - Math.max(a.x, b.x);
        const overlapY = Math.min(ay2, by2) - Math.max(a.y, b.y);
        const push =
          (axis === "y"
            ? overlapY
            : axis === "x"
              ? overlapX
              : Math.max(overlapX, overlapY)) *
            0.55 +
          2;

        // Keep root (depth 0) more anchored
        const aW = a.depth === 0 ? 0.15 : 0.5;
        const bW = b.depth === 0 ? 0.15 : 0.5;
        a.x -= dx * push * aW;
        a.y -= dy * push * aW;
        b.x += dx * push * bW;
        b.y += dy * push * bW;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return next;
}

function layoutConcept(root: MindNode, defaults: NodeStyle): LayoutResult {
  const items: { node: MindNode; parentId: string | null; depth: number }[] = [];
  const walk = (n: MindNode, parentId: string | null, depth: number) => {
    items.push({ node: n, parentId, depth });
    if (n.collapsed) return;
    for (const c of n.children) walk(c, n.id, depth + 1);
  };
  walk(root, null, 0);

  const cx = 520;
  const cy = 420;
  const count = Math.max(items.length, 1);
  // Spread farther as node count grows
  const radius = Math.max(240, 110 * Math.sqrt(count));

  let nodes: LayoutNode[] = items.map((item, i) => {
    const style = { ...defaults, ...item.node.style };
    const fontSize = style.fontSize ?? 14;
    const scale = style.scale ?? 1;
    const size = measureNode(
      item.node.text || " ",
      fontSize,
      scale,
      normalizeNodeImages(item.node),
    );
    if (item.depth === 0) {
      return {
        id: item.node.id,
        text: item.node.text,
        note: item.node.note,
        images: normalizeNodeImages(item.node),
        collapsed: !!item.node.collapsed,
        style,
        x: cx - size.width / 2,
        y: cy - size.height / 2,
        width: size.width,
        height: size.height,
        depth: 0,
        parentId: null,
        childIds: item.node.children.map((c) => c.id),
        hasChildren: item.node.children.length > 0,
      };
    }
    // Ring by depth so siblings don't collapse onto the same radius
    const ring = radius * (0.45 + Math.min(item.depth, 4) * 0.22);
    const siblings = items.filter((x) => x.parentId === item.parentId);
    const sibIndex = siblings.findIndex((x) => x.node.id === item.node.id);
    const parentItem = items.find((x) => x.node.id === item.parentId);
    const parentAngle =
      parentItem && parentItem.depth > 0
        ? -Math.PI / 2 +
          (items.findIndex((x) => x.node.id === parentItem.node.id) / count) *
            Math.PI *
            2
        : -Math.PI / 2;
    const fan = Math.min(Math.PI * 0.85, 0.55 + siblings.length * 0.18);
    const angle =
      siblings.length <= 1
        ? parentAngle
        : parentAngle - fan / 2 + (sibIndex / Math.max(siblings.length - 1, 1)) * fan;
    // Outer nodes also get global index offset for uniqueness
    const jitter = ((i * 17) % 7) * 0.02;
    const x = cx + Math.cos(angle + jitter) * ring - size.width / 2;
    const y = cy + Math.sin(angle + jitter) * ring - size.height / 2;
    return {
      id: item.node.id,
      text: item.node.text,
      note: item.node.note,
      images: normalizeNodeImages(item.node),
      collapsed: !!item.node.collapsed,
      style,
      x,
      y,
      width: size.width,
      height: size.height,
      depth: item.depth,
      parentId: item.parentId,
      childIds: item.node.children.map((c) => c.id),
      hasChildren: item.node.children.length > 0,
    };
  });

  nodes = separateOverlappingNodes(nodes, 16, 56, "xy");

  const box = boundsOf(nodes);
  const pad = 100;
  const shifted = translateNodes(nodes, pad - box.minX, pad - box.minY);
  return {
    nodes: shifted,
    edges: rebuildEdges(shifted, "concept"),
    width: boundsOf(shifted).maxX + pad,
    height: boundsOf(shifted).maxY + pad,
  };
}

function layoutFloatingForest(
  forest: MindNode,
  defaults: NodeStyle,
  originX: number,
  originY: number,
): LayoutNode[] {
  const sub = layoutRight(forest, defaults);
  const b = boundsOf(sub.nodes);
  return translateNodes(
    sub.nodes.map((n) => ({ ...n, floating: true })),
    originX - b.minX,
    originY - b.minY,
  );
}

export function layoutTree(
  root: MindNode,
  defaults: NodeStyle = {},
  style: MapLayoutStyle = "right",
  radialDirs?: Record<string, RadialDir>,
  flowDir?: FlowDir,
): LayoutResult {
  if (style === "flowchart") {
    const dir = flowDir ?? "down";
    if (dir === "down") return layoutDown(root, defaults, true);
    if (dir === "left") {
      return transformLayout(layoutFlowRight(root, defaults), "left");
    }
    return layoutFlowRight(root, defaults);
  }
  if (style === "down") return layoutDown(root, defaults);
  if (style === "radial") return layoutRadial(root, defaults, radialDirs);
  if (style === "concept") return layoutConcept(root, defaults);
  return transformLayout(layoutRight(root, defaults), style);
}

export function collectDescendantIds(root: MindNode, id: string): string[] {
  const node = findNode(root, id);
  if (!node) return [];
  const ids: string[] = [];
  const walk = (n: MindNode) => {
    ids.push(n.id);
    n.children.forEach(walk);
  };
  walk(node);
  return ids;
}

function edgeEndpoints(
  from: LayoutNode,
  to: LayoutNode,
  style: MapLayoutStyle,
): Pick<LayoutEdge, "x1" | "y1" | "x2" | "y2"> {
  if (style === "down") {
    return {
      x1: from.x + from.width / 2,
      y1: from.y + from.height,
      x2: to.x + to.width / 2,
      y2: to.y,
    };
  }
  if (style === "flowchart") {
    // Prefer dominant axis like radial so right/left/down flowcharts all look right
    const fromCx = from.x + from.width / 2;
    const fromCy = from.y + from.height / 2;
    const toCx = to.x + to.width / 2;
    const toCy = to.y + to.height / 2;
    const dx = toCx - fromCx;
    const dy = toCy - fromCy;
    if (Math.abs(dx) >= Math.abs(dy)) {
      if (dx >= 0) {
        return {
          x1: from.x + from.width,
          y1: fromCy,
          x2: to.x,
          y2: toCy,
        };
      }
      return {
        x1: from.x,
        y1: fromCy,
        x2: to.x + to.width,
        y2: toCy,
      };
    }
    if (dy >= 0) {
      return {
        x1: fromCx,
        y1: from.y + from.height,
        x2: toCx,
        y2: to.y,
      };
    }
    return {
      x1: fromCx,
      y1: from.y,
      x2: toCx,
      y2: to.y + to.height,
    };
  }
  if (style === "left") {
    return {
      x1: from.x,
      y1: from.y + from.height / 2,
      x2: to.x + to.width,
      y2: to.y + to.height / 2,
    };
  }
  if (style === "radial" || style === "concept") {
    const fromCx = from.x + from.width / 2;
    const fromCy = from.y + from.height / 2;
    const toCx = to.x + to.width / 2;
    const toCy = to.y + to.height / 2;
    const dx = toCx - fromCx;
    const dy = toCy - fromCy;
    if (Math.abs(dx) >= Math.abs(dy)) {
      if (dx >= 0) {
        return {
          x1: from.x + from.width,
          y1: fromCy,
          x2: to.x,
          y2: toCy,
        };
      }
      return {
        x1: from.x,
        y1: fromCy,
        x2: to.x + to.width,
        y2: toCy,
      };
    }
    if (dy >= 0) {
      return {
        x1: fromCx,
        y1: from.y + from.height,
        x2: toCx,
        y2: to.y,
      };
    }
    return {
      x1: fromCx,
      y1: from.y,
      x2: toCx,
      y2: to.y + to.height,
    };
  }
  // right
  return {
    x1: from.x + from.width,
    y1: from.y + from.height / 2,
    x2: to.x,
    y2: to.y + to.height / 2,
  };
}

export function rebuildEdges(
  nodes: LayoutNode[],
  style: MapLayoutStyle,
): LayoutEdge[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges: LayoutEdge[] = [];
  for (const node of nodes) {
    if (!node.parentId) continue;
    const parent = byId.get(node.parentId);
    if (!parent) continue;
    edges.push({
      fromId: parent.id,
      toId: node.id,
      kind: "tree",
      ...edgeEndpoints(parent, node, style),
    });
  }
  return edges;
}

export function buildLinkEdges(
  nodes: LayoutNode[],
  links: MapLink[] | undefined,
  style: MapLayoutStyle,
): LayoutEdge[] {
  if (!links?.length) return [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges: LayoutEdge[] = [];
  for (const link of links) {
    const from = byId.get(link.fromId);
    const to = byId.get(link.toId);
    if (!from || !to) continue;
    edges.push({
      fromId: from.id,
      toId: to.id,
      kind: "link",
      label: link.label,
      linkId: link.id,
      ...edgeEndpoints(from, to, style === "left" ? "left" : "radial"),
    });
  }
  return edges;
}

/**
 * Auto-layout, then apply saved absolute positions, then optional live drag offset
 * for a subtree (node + descendants). Edges follow the final positions.
 */
export function resolveLayout(
  root: MindNode,
  defaults: NodeStyle = {},
  style: MapLayoutStyle = "right",
  positions?: Record<string, { x: number; y: number }>,
  drag?: { id: string; dx: number; dy: number } | null,
  radialDirs?: Record<string, RadialDir>,
  floatingNodes?: MindNode[],
  links?: MapLink[],
  flowDir?: FlowDir,
): LayoutResult {
  const base = layoutTree(root, defaults, style, radialDirs, flowDir);
  let nodes = [...base.nodes];

  if (floatingNodes?.length) {
    const box = boundsOf(nodes);
    let cursorX = box.maxX + 100;
    const baseY = box.minY;
    for (const forest of floatingNodes) {
      const placed = layoutFloatingForest(forest, defaults, cursorX, baseY);
      nodes.push(...placed);
      const fb = boundsOf(placed);
      cursorX = fb.maxX + 80;
    }
  }

  const dragIds = new Set<string>();
  if (drag?.id) {
    for (const id of collectDescendantIds(root, drag.id)) dragIds.add(id);
    for (const f of floatingNodes ?? []) {
      for (const id of collectDescendantIds(f, drag.id)) dragIds.add(id);
    }
  }

  // Apply saved positions first (without drag), then separate/shift so the
  // resting frame stays stable when a drag starts. Drag offset is applied last.
  nodes = nodes.map((n) => {
    const saved = positions?.[n.id];
    return {
      ...n,
      x: saved?.x ?? n.x,
      y: saved?.y ?? n.y,
    };
  });

  // Soft pad > sibling gap used to shove tidy trees into chaos (line-through
  // nodes, broken columns). Only resolve true hard overlaps, and for tree
  // styles only nudge along the packing axis so depth columns stay aligned.
  if (style === "radial" || style === "concept") {
    nodes = separateOverlappingNodes(nodes, 2, 32, "xy");
  } else if (style === "down" || (style === "flowchart" && flowDir === "down")) {
    nodes = separateOverlappingNodes(nodes, 0, 24, "x");
  } else {
    // right / left / flowchart left|right — siblings pack vertically
    nodes = separateOverlappingNodes(nodes, 0, 24, "y");
  }

  const box = boundsOf(nodes);
  const pad = 80;
  const shiftX = box.minX < pad ? pad - box.minX : 0;
  const shiftY = box.minY < pad ? pad - box.minY : 0;
  if (shiftX || shiftY) {
    nodes = translateNodes(nodes, shiftX, shiftY);
  }

  if (drag && dragIds.size > 0) {
    nodes = nodes.map((n) =>
      dragIds.has(n.id)
        ? { ...n, x: n.x + drag.dx, y: n.y + drag.dy }
        : n,
    );
  }

  const final = boundsOf(nodes);
  return {
    nodes,
    edges: [
      ...rebuildEdges(nodes, style),
      ...buildLinkEdges(nodes, links, style),
    ],
    width: Math.max(final.maxX + pad, pad * 2),
    height: Math.max(final.maxY + pad, pad * 2),
  };
}

/** Commit a free-form drag: snapshot absolute positions for the moved subtree. */
export function commitSubtreeMove(
  root: MindNode,
  auto: LayoutResult,
  positions: Record<string, { x: number; y: number }> | undefined,
  dragId: string,
  dx: number,
  dy: number,
  floatingNodes?: MindNode[],
): Record<string, { x: number; y: number }> {
  const next: Record<string, { x: number; y: number }> = {
    ...(positions ?? {}),
  };
  const ids = new Set(collectDescendantIds(root, dragId));
  for (const f of floatingNodes ?? []) {
    for (const id of collectDescendantIds(f, dragId)) ids.add(id);
  }
  const byId = new Map(auto.nodes.map((n) => [n.id, n]));
  for (const id of ids) {
    const node = byId.get(id);
    if (!node) continue;
    const baseX = positions?.[id]?.x ?? node.x;
    const baseY = positions?.[id]?.y ?? node.y;
    next[id] = { x: baseX + dx, y: baseY + dy };
  }
  return next;
}

export function findNode(root: MindNode, id: string): MindNode | null {
  if (root.id === id) return root;
  for (const child of root.children) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

export function findParent(root: MindNode, id: string): MindNode | null {
  for (const child of root.children) {
    if (child.id === id) return root;
    const found = findParent(child, id);
    if (found) return found;
  }
  return null;
}

export function updateNode(
  root: MindNode,
  id: string,
  updater: (node: MindNode) => MindNode,
): MindNode {
  if (root.id === id) return updater({ ...root, children: [...root.children] });
  return {
    ...root,
    children: root.children.map((c) => updateNode(c, id, updater)),
  };
}

export function removeNode(root: MindNode, id: string): MindNode {
  if (root.id === id) return root;
  return {
    ...root,
    children: root.children
      .filter((c) => c.id !== id)
      .map((c) => removeNode(c, id)),
  };
}

export function cloneNode(node: MindNode): MindNode {
  return {
    ...node,
    style: node.style ? { ...node.style } : undefined,
    children: node.children.map(cloneNode),
  };
}

export function isDescendant(root: MindNode, ancestorId: string, id: string): boolean {
  const ancestor = findNode(root, ancestorId);
  if (!ancestor) return false;
  return !!findNode(ancestor, id);
}

/** Move node under a new parent (like dropping into a folder). */
export function reparentNode(
  root: MindNode,
  nodeId: string,
  newParentId: string,
  index?: number,
): MindNode {
  if (nodeId === root.id || nodeId === newParentId) return root;
  if (isDescendant(root, nodeId, newParentId)) return root;
  const moving = findNode(root, nodeId);
  if (!moving) return root;
  const copy = cloneNode(moving);
  const without = removeNode(root, nodeId);
  return updateNode(without, newParentId, (parent) => {
    const children = [...parent.children];
    const at = index == null ? children.length : Math.max(0, Math.min(index, children.length));
    children.splice(at, 0, copy);
    return { ...parent, collapsed: false, children };
  });
}

/** Insert a node as a sibling of target, before or after it in the parent's child list. */
export function placeNodeAsSibling(
  root: MindNode,
  nodeId: string,
  targetId: string,
  where: "before" | "after",
): MindNode {
  if (nodeId === root.id || targetId === root.id || nodeId === targetId) {
    return root;
  }
  if (isDescendant(root, nodeId, targetId)) return root;
  const moving = findNode(root, nodeId);
  if (!moving) return root;
  if (!findParent(root, targetId)) return root;

  const copy = cloneNode(moving);
  const without = removeNode(root, nodeId);
  const parentAfter = findParent(without, targetId);
  if (!parentAfter) return root;

  return updateNode(without, parentAfter.id, (parent) => {
    const children = [...parent.children];
    let idx = children.findIndex((c) => c.id === targetId);
    if (idx < 0) return parent;
    if (where === "after") idx += 1;
    children.splice(idx, 0, copy);
    return { ...parent, children };
  });
}

export function mapTree(
  root: MindNode,
  fn: (node: MindNode) => MindNode,
): MindNode {
  const next = fn({ ...root });
  return {
    ...next,
    children: next.children.map((c) => mapTree(c, fn)),
  };
}

export function collectNodeNotes(root: MindNode): string[] {
  const notes: string[] = [];
  const walk = (n: MindNode) => {
    if (n.note) notes.push(n.note);
    n.children.forEach(walk);
  };
  walk(root);
  return notes;
}

export interface NodeNoteRef {
  nodeId: string;
  text: string;
  note: string;
}

export function collectNodeNoteRefs(root: MindNode): NodeNoteRef[] {
  const out: NodeNoteRef[] = [];
  const walk = (n: MindNode) => {
    if (n.note?.trim()) {
      out.push({ nodeId: n.id, text: n.text, note: n.note });
    }
    n.children.forEach(walk);
  };
  walk(root);
  return out;
}

export function collapseAll(root: MindNode): MindNode {
  return mapTree(root, (n) =>
    n.children.length > 0 ? { ...n, collapsed: true } : n,
  );
}

export function expandAll(root: MindNode): MindNode {
  return mapTree(root, (n) =>
    n.children.length > 0 ? { ...n, collapsed: false } : n,
  );
}

/** Collapse one deeper level under `focusId` (deepest expanded branches first). */
export function collapseOneLevel(root: MindNode, focusId: string): MindNode {
  const focus = findNode(root, focusId) ?? root;
  let maxDepth = -1;
  const walk = (n: MindNode, depth: number) => {
    if (n.children.length > 0 && !n.collapsed) {
      maxDepth = Math.max(maxDepth, depth);
      n.children.forEach((c) => walk(c, depth + 1));
    }
  };
  walk(focus, 0);
  if (maxDepth < 0) return root;

  const collapseAt = (n: MindNode, depth: number): MindNode => {
    const children = n.children.map((c) => collapseAt(c, depth + 1));
    const shouldCollapse =
      n.children.length > 0 && !n.collapsed && depth === maxDepth;
    return {
      ...n,
      collapsed: shouldCollapse ? true : n.collapsed,
      children,
    };
  };

  if (focusId === root.id) return collapseAt(root, 0);
  return updateNode(root, focusId, (n) => collapseAt(n, 0));
}

/** Expand one level under `focusId` (shallowest collapsed nodes first). */
export function expandOneLevel(root: MindNode, focusId: string): MindNode {
  const focus = findNode(root, focusId) ?? root;
  let minCollapsedDepth: number | null = null;
  const walk = (n: MindNode, depth: number) => {
    if (n.children.length > 0 && n.collapsed) {
      minCollapsedDepth =
        minCollapsedDepth == null
          ? depth
          : Math.min(minCollapsedDepth, depth);
      return;
    }
    n.children.forEach((c) => walk(c, depth + 1));
  };
  walk(focus, 0);
  if (minCollapsedDepth == null) return root;

  const expandAt = (n: MindNode, depth: number): MindNode => {
    const shouldExpand =
      n.children.length > 0 && n.collapsed && depth === minCollapsedDepth;
    const children = shouldExpand
      ? n.children
      : n.children.map((c) => expandAt(c, depth + 1));
    return {
      ...n,
      collapsed: shouldExpand ? false : n.collapsed,
      children,
    };
  };

  if (focusId === root.id) return expandAt(root, 0);
  return updateNode(root, focusId, (n) => expandAt(n, 0));
}
