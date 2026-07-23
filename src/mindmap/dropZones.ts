import type { FlowDir, LayoutNode, MapLayoutStyle, RadialDir } from "./types";

export type DropKind = "child" | "sibling-before" | "sibling-after";

export interface DropIntent {
  targetId: string;
  kind: DropKind;
  /** When becoming a child of the radial root, which arm to attach to. */
  radialDir?: RadialDir;
}

/** Halo around a node that still counts as a drop target (world units). */
export const DROP_HIT_MARGIN = 22;

export function dropIntentLabel(
  intent: DropIntent | null,
  layoutStyle?: MapLayoutStyle,
  flowDir?: FlowDir,
): string {
  if (!intent) return "Release to place · hover a node for drop zones";
  const style = effectiveDropStyle(layoutStyle ?? "right", flowDir);
  if (intent.kind === "sibling-before") {
    if (style === "down") return "Release to place as sibling to the left";
    return "Release to place as sibling above";
  }
  if (intent.kind === "sibling-after") {
    if (style === "down") return "Release to place as sibling to the right";
    return "Release to place as sibling below";
  }
  if (intent.radialDir) {
    return `Release to attach on the ${intent.radialDir} of root`;
  }
  return "Release to make a child of this node";
}

/** Dominant axis from a vector (screen y grows downward). */
export function radialDirFromDelta(dx: number, dy: number): RadialDir {
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? "right" : "left";
  }
  return dy >= 0 ? "down" : "up";
}

export function nodeCenter(node: LayoutNode): { x: number; y: number } {
  return { x: node.x + node.width / 2, y: node.y + node.height / 2 };
}

function rectsOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
  pad = 0,
): boolean {
  return !(
    a.x + a.width + pad <= b.x ||
    b.x + b.width + pad <= a.x ||
    a.y + a.height + pad <= b.y ||
    b.y + b.height + pad <= a.y
  );
}

function pointInRect(
  x: number,
  y: number,
  node: LayoutNode,
  margin = 0,
): boolean {
  return (
    x >= node.x - margin &&
    x <= node.x + node.width + margin &&
    y >= node.y - margin &&
    y <= node.y + node.height + margin
  );
}

function effectiveDropStyle(
  layoutStyle: MapLayoutStyle,
  flowDir?: FlowDir,
): MapLayoutStyle {
  if (layoutStyle === "flowchart") {
    return flowDir === "left" ? "left" : flowDir === "right" ? "right" : "down";
  }
  return layoutStyle;
}

/**
 * Pick the best drop target under the pointer / dragged body.
 * Prefers: pointer inside → pointer in halo → body overlap (closest center).
 */
export function findDropTarget(
  nodes: LayoutNode[],
  worldX: number,
  worldY: number,
  blocked: Set<string>,
  moving?: LayoutNode | null,
  margin = DROP_HIT_MARGIN,
): LayoutNode | null {
  let inside: LayoutNode | null = null;
  let halo: LayoutNode | null = null;
  let overlap: LayoutNode | null = null;
  let overlapDist = Infinity;

  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i];
    if (blocked.has(n.id)) continue;

    if (!inside && pointInRect(worldX, worldY, n, 0)) {
      inside = n;
    } else if (!halo && pointInRect(worldX, worldY, n, margin)) {
      halo = n;
    }

    if (moving && nodesOverlap(moving, n, margin)) {
      const c = nodeCenter(n);
      const m = nodeCenter(moving);
      const dist = Math.hypot(c.x - m.x, c.y - m.y);
      if (dist < overlapDist) {
        overlapDist = dist;
        overlap = n;
      }
    }
  }

  return inside ?? halo ?? overlap;
}

/**
 * Decide drop intent from pointer / anchor relative to a target node.
 * For radial root drops, prefer `anchor` (usually the dragged node center)
 * so placement matches where the floating node sits, not the grab offset.
 *
 * Zone model (internal partitions + exterior halo docks):
 * - Child strip on the layout's "outward" side
 * - Sibling-before / sibling-after on the orthogonal axis (above/below or left/right)
 */
export function resolveDropIntent(
  target: LayoutNode,
  worldX: number,
  worldY: number,
  layoutStyle: MapLayoutStyle,
  anchor?: { x: number; y: number } | null,
  flowDir?: FlowDir,
): DropIntent {
  const style = effectiveDropStyle(layoutStyle, flowDir);
  const lx = worldX - target.x;
  const ly = worldY - target.y;
  const isRoot = target.parentId == null && !target.floating;

  if (layoutStyle === "radial" && isRoot) {
    const center = nodeCenter(target);
    const ax = anchor?.x ?? worldX;
    const ay = anchor?.y ?? worldY;
    return {
      targetId: target.id,
      kind: "child",
      radialDir: radialDirFromDelta(ax - center.x, ay - center.y),
    };
  }

  if (isRoot) {
    return { targetId: target.id, kind: "child" };
  }

  // Clamp into the node (or exterior docks just outside) so halo hits still
  // resolve to the same zone geometry as interior hits.
  const cx = Math.min(Math.max(lx, -DROP_HIT_MARGIN), target.width + DROP_HIT_MARGIN);
  const cy = Math.min(Math.max(ly, -DROP_HIT_MARGIN), target.height + DROP_HIT_MARGIN);
  const nx = cx / Math.max(target.width, 1);
  const ny = cy / Math.max(target.height, 1);

  let childZone = false;
  if (style === "left") {
    childZone = nx < 0.42;
  } else if (style === "down") {
    childZone = ny > 0.58;
  } else if (style === "radial" || style === "concept") {
    // Match right-layout partitions for non-root nodes so dropping a body
    // onto the top/center yields siblings, not an invisible "child" zone.
    childZone = nx > 0.58;
  } else {
    childZone = nx > 0.58;
  }

  // Exterior docks: above / below / left / right of the target box map to
  // sibling placement when the pointer is outside the child strip.
  if (!childZone) {
    if (style === "down") {
      if (cx < 0) {
        return { targetId: target.id, kind: "sibling-before" };
      }
      if (cx > target.width) {
        return { targetId: target.id, kind: "sibling-after" };
      }
    } else {
      if (cy < 0) {
        return { targetId: target.id, kind: "sibling-before" };
      }
      if (cy > target.height) {
        return { targetId: target.id, kind: "sibling-after" };
      }
    }
  }

  if (childZone) {
    return { targetId: target.id, kind: "child" };
  }

  if (style === "down") {
    return {
      targetId: target.id,
      kind: nx < 0.5 ? "sibling-before" : "sibling-after",
    };
  }

  return {
    targetId: target.id,
    kind: ny < 0.5 ? "sibling-before" : "sibling-after",
  };
}

export function nodesOverlap(
  a: LayoutNode,
  b: LayoutNode,
  pad = 8,
): boolean {
  return rectsOverlap(a, b, pad);
}
