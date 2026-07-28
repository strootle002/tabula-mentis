import type { FlowDir, MapLayoutStyle } from "./types";

export interface LayoutOption {
  id: MapLayoutStyle;
  label: string;
  group: "tree" | "diagram";
  hint?: string;
}

/** Hierarchical mindmap layouts offered in Style / settings / create. */
export const TREE_LAYOUTS: LayoutOption[] = [
  { id: "right", label: "Rightward tree", group: "tree" },
  { id: "left", label: "Leftward tree", group: "tree" },
  { id: "down", label: "Top-down tree", group: "tree" },
  { id: "radial", label: "Radial", group: "tree" },
];

/**
 * Legacy diagram layouts. Still renderable for existing maps, but not offered
 * as choices in the UI (flowchart / concept map were retired from pickers).
 */
export const DIAGRAM_LAYOUTS: LayoutOption[] = [
  {
    id: "flowchart",
    label: "Flowchart",
    group: "diagram",
    hint: "Sequential process / decision flow",
  },
  {
    id: "concept",
    label: "Concept map",
    group: "diagram",
    hint: "Network of linked ideas",
  },
];

/** Layouts the user can pick for new maps and Style menu changes. */
export const SELECTABLE_LAYOUTS: LayoutOption[] = [...TREE_LAYOUTS];

/** All known layouts, including legacy ones kept for open/render. */
export const ALL_LAYOUTS: LayoutOption[] = [...TREE_LAYOUTS, ...DIAGRAM_LAYOUTS];

export const FLOW_DIRS: { id: FlowDir; label: string }[] = [
  { id: "right", label: "Right" },
  { id: "left", label: "Left" },
  { id: "down", label: "Down" },
];

export function layoutLabel(style: MapLayoutStyle, flowDir?: FlowDir): string {
  const base = ALL_LAYOUTS.find((l) => l.id === style)?.label ?? style;
  if (style === "flowchart") {
    const dir = flowDir ?? "down";
    const dirLabel = FLOW_DIRS.find((d) => d.id === dir)?.label ?? dir;
    return `${base} · ${dirLabel}`;
  }
  return base;
}

/** Layouts where arrow keys should follow screen geometry, not tree depth. */
export function usesSpatialNavigation(style: MapLayoutStyle): boolean {
  return style === "radial" || style === "flowchart" || style === "concept";
}

export function isDiagramLayout(style: MapLayoutStyle): boolean {
  return DIAGRAM_LAYOUTS.some((l) => l.id === style);
}

/** Normalize legacy layout ids (e.g. removed fishbone). */
export function normalizeLayoutStyle(style: string | undefined): MapLayoutStyle {
  if (style === "fishbone") return "right";
  if (
    style === "right" ||
    style === "left" ||
    style === "down" ||
    style === "radial" ||
    style === "flowchart" ||
    style === "concept"
  ) {
    return style;
  }
  return "right";
}
