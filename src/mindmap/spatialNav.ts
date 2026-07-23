import type { LayoutNode } from "./types";

/**
 * Pick the nearest node in a screen direction (arrow-key spatial nav).
 * Scores primarily by progress along the axis, with a penalty for offset.
 */
export function pickSpatialNeighbor(
  nodes: LayoutNode[],
  currentId: string,
  dir: "left" | "right" | "up" | "down",
): string | null {
  const current = nodes.find((n) => n.id === currentId);
  if (!current) return null;
  const cx = current.x + current.width / 2;
  const cy = current.y + current.height / 2;

  let bestId: string | null = null;
  let bestScore = Infinity;

  for (const n of nodes) {
    if (n.id === currentId) continue;
    const nx = n.x + n.width / 2;
    const ny = n.y + n.height / 2;
    const dx = nx - cx;
    const dy = ny - cy;

    // Require meaningful movement in the requested direction
    const eps = 6;
    if (dir === "left" && dx >= -eps) continue;
    if (dir === "right" && dx <= eps) continue;
    if (dir === "up" && dy >= -eps) continue;
    if (dir === "down" && dy <= eps) continue;

    const primary = dir === "left" || dir === "right" ? Math.abs(dx) : Math.abs(dy);
    const ortho = dir === "left" || dir === "right" ? Math.abs(dy) : Math.abs(dx);
    // Prefer mostly-aligned neighbors; still allow diagonals with penalty
    const score = primary + ortho * 1.75;
    if (score < bestScore) {
      bestScore = score;
      bestId = n.id;
    }
  }
  return bestId;
}
