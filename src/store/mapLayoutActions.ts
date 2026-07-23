import type { AppActions, GetState, SetState } from "./storeTypes";
import { recordMapChange, scheduleMapSave } from "./storeServices";
import type { MindMapDocument, RadialDir } from "../mindmap/types";
import { createEmptyNode } from "../vault/vaultFs";
import { commitSubtreeMove, resolveLayout } from "../mindmap/layout";
import { collectDescendantIdsInDoc, createMapLink, placeNodeAsSiblingInDoc, reparentNodeInDoc } from "../mindmap/mapDoc";
import { usesSpatialNavigation, normalizeLayoutStyle } from "../mindmap/layoutCatalog";
import { pickSpatialNeighbor } from "../mindmap/spatialNav";

export type MapLayoutActions = Pick<AppActions, "reparentSelectedTo" | "reparentNodeTo" | "applyDropIntent" | "moveSubtree" | "resetLayoutPositions" | "setMapLayoutStyle" | "setFlowDir" | "navigate" | "addFloatingNode" | "beginLinkFrom" | "cancelLinking" | "completeLinkTo" | "confirmPendingLink" | "cancelPendingLink" | "removeLink" | "removeLinksForNode" | "setMinimapVisible" | "toggleMinimap" | "setPanZoom">;

export function createMapLayoutActions(set: SetState, get: GetState): MapLayoutActions {
  return {
  reparentSelectedTo: (parentId) => {
    const { activeMap, selectedNodeId } = get();
    if (!activeMap || !selectedNodeId) return;
    get().reparentNodeTo(selectedNodeId, parentId);
  },

  reparentNodeTo: (nodeId, parentId) => {
    const { activeMap } = get();
    if (!activeMap) return;
    if (nodeId === parentId) return;
    const movedMap = reparentNodeInDoc(activeMap, nodeId, parentId);
    if (movedMap === activeMap) return;
    recordMapChange(get, set, "Reparent node");
    // Clear manual positions for the moved subtree so it attaches under the new parent
    const movedIds = new Set(
      collectDescendantIdsInDoc(activeMap, nodeId),
    );
    let positions = activeMap.positions;
    if (positions) {
      const next = { ...positions };
      for (const id of movedIds) delete next[id];
      positions = Object.keys(next).length ? next : undefined;
    }
    let radialDirs = activeMap.radialDirs
      ? { ...activeMap.radialDirs }
      : undefined;
    if (radialDirs) {
      for (const id of movedIds) delete radialDirs[id];
      if (Object.keys(radialDirs).length === 0) radialDirs = undefined;
    }
    set({
      activeMap: { ...movedMap, positions, radialDirs },
      selectedNodeId: nodeId,
      dirtyMap: true,
    });
    scheduleMapSave(get, set);
  },

  applyDropIntent: (nodeId, intent) => {
    const { activeMap } = get();
    if (!activeMap) return;
    if (nodeId === intent.targetId) return;
    if (nodeId === activeMap.root.id) return;

    const label =
      intent.kind === "child"
        ? intent.radialDir
          ? `Attach ${intent.radialDir} of root`
          : "Make child"
        : intent.kind === "sibling-before"
          ? "Place sibling before"
          : "Place sibling after";

    let movedMap: MindMapDocument;
    if (intent.kind === "child") {
      movedMap = reparentNodeInDoc(activeMap, nodeId, intent.targetId);
    } else {
      movedMap = placeNodeAsSiblingInDoc(
        activeMap,
        nodeId,
        intent.targetId,
        intent.kind === "sibling-before" ? "before" : "after",
      );
    }
    if (movedMap === activeMap) return;
    recordMapChange(get, set, label);

    const movedIds = new Set(
      collectDescendantIdsInDoc(activeMap, nodeId),
    );
    let positions = activeMap.positions;
    if (positions) {
      const next = { ...positions };
      for (const id of movedIds) delete next[id];
      positions = Object.keys(next).length ? next : undefined;
    }

    const radialDirs: Record<string, RadialDir> = {
      ...(activeMap.radialDirs ?? {}),
    };
    for (const id of movedIds) delete radialDirs[id];
    if (
      intent.kind === "child" &&
      intent.radialDir &&
      intent.targetId === activeMap.root.id
    ) {
      radialDirs[nodeId] = intent.radialDir;
    }

    set({
      activeMap: {
        ...movedMap,
        positions,
        radialDirs: Object.keys(radialDirs).length ? radialDirs : undefined,
      },
      selectedNodeId: nodeId,
      dirtyMap: true,
    });
    scheduleMapSave(get, set);
  },

  moveSubtree: (nodeId, dx, dy) => {
    const { activeMap, vaultSettings } = get();
    if (!activeMap || (dx === 0 && dy === 0)) return;
    recordMapChange(get, set, "Move node");
    const style =
      activeMap.layoutStyle ?? vaultSettings.defaultLayoutStyle ?? "right";
    // Use the same positioned base as the live drag preview (no collision),
    // so commit coords match what the user saw under the cursor.
    const auto = resolveLayout(
      activeMap.root,
      vaultSettings.defaultNodeStyle,
      style,
      activeMap.positions,
      null,
      activeMap.radialDirs,
      activeMap.floatingNodes,
      activeMap.links,
      activeMap.flowDir,
    );
    const positions = commitSubtreeMove(
      activeMap.root,
      auto,
      activeMap.positions,
      nodeId,
      dx,
      dy,
      activeMap.floatingNodes,
    );
    set({
      activeMap: { ...activeMap, positions },
      dirtyMap: true,
    });
    scheduleMapSave(get, set);
  },

  resetLayoutPositions: () => {
    const { activeMap } = get();
    if (!activeMap) return;
    recordMapChange(get, set, "Reset layout");
    const { positions: _removed, radialDirs: _dirs, ...rest } = activeMap;
    set({
      activeMap: { ...rest, positions: undefined, radialDirs: undefined },
      dirtyMap: true,
    });
    scheduleMapSave(get, set);
  },

  setMapLayoutStyle: (style) => {
    const { activeMap } = get();
    if (!activeMap) return;
    recordMapChange(get, set, "Change layout style");
    const next: typeof activeMap = {
      ...activeMap,
      layoutStyle: style,
    };
    if (style === "flowchart" && !next.flowDir) {
      next.flowDir = "down";
    }
    // Radial/concept need clean auto geometry — drop free-form coords from
    // other layouts so arms aren't forced into the wrong places.
    if (style === "radial" || style === "concept") {
      next.positions = undefined;
    }
    set({
      activeMap: next,
      dirtyMap: true,
    });
    scheduleMapSave(get, set);
  },

  setFlowDir: (dir) => {
    const { activeMap } = get();
    if (!activeMap) return;
    recordMapChange(get, set, "Change flowchart direction");
    set({
      activeMap: {
        ...activeMap,
        layoutStyle: "flowchart",
        flowDir: dir,
        positions: undefined,
      },
      dirtyMap: true,
    });
    scheduleMapSave(get, set);
  },

  navigate: (dir) => {
    const { activeMap, selectedNodeId, vaultSettings } = get();
    if (!activeMap || !selectedNodeId) return;
    const style =
      normalizeLayoutStyle(
        activeMap.layoutStyle ?? vaultSettings.defaultLayoutStyle ?? "right",
      );
    const layout = resolveLayout(
      activeMap.root,
      vaultSettings.defaultNodeStyle,
      style,
      activeMap.positions,
      null,
      activeMap.radialDirs,
      activeMap.floatingNodes,
      activeMap.links,
      activeMap.flowDir,
    );
    const current = layout.nodes.find((n) => n.id === selectedNodeId);
    if (!current) return;

    let nextId: string | null = null;
    if (usesSpatialNavigation(style)) {
      nextId = pickSpatialNeighbor(layout.nodes, selectedNodeId, dir);
      // On radial/diagram, right into a collapsed node still expands when it's a child
      if (
        dir === "right" &&
        nextId &&
        current.collapsed &&
        current.hasChildren &&
        current.childIds.includes(nextId)
      ) {
        get().toggleCollapseSelected();
      }
    } else if (style === "left") {
      // Children grow leftward: Left = deeper, Right = parent.
      if (dir === "right") {
        nextId = current.parentId;
      } else if (dir === "left") {
        if (current.collapsed && current.hasChildren) get().toggleCollapseSelected();
        nextId = current.childIds[0] ?? null;
      } else if (dir === "up" || dir === "down") {
        if (!current.parentId) return;
        const parent = layout.nodes.find((n) => n.id === current.parentId);
        if (!parent) return;
        const siblings = parent.childIds;
        const idx = siblings.indexOf(current.id);
        if (dir === "up" && idx > 0) nextId = siblings[idx - 1];
        if (dir === "down" && idx < siblings.length - 1) {
          nextId = siblings[idx + 1];
        }
      }
    } else if (style === "down") {
      // Children grow downward: Up = parent, Down = child, Left/Right = siblings.
      if (dir === "up") {
        nextId = current.parentId;
      } else if (dir === "down") {
        if (current.collapsed && current.hasChildren) get().toggleCollapseSelected();
        nextId = current.childIds[0] ?? null;
      } else if (dir === "left" || dir === "right") {
        if (!current.parentId) return;
        const parent = layout.nodes.find((n) => n.id === current.parentId);
        if (!parent) return;
        const siblings = parent.childIds;
        const idx = siblings.indexOf(current.id);
        if (dir === "left" && idx > 0) nextId = siblings[idx - 1];
        if (dir === "right" && idx < siblings.length - 1) {
          nextId = siblings[idx + 1];
        }
      }
    } else if (dir === "left") {
      nextId = current.parentId;
    } else if (dir === "right") {
      if (current.collapsed && current.hasChildren) get().toggleCollapseSelected();
      nextId = current.childIds[0] ?? null;
    } else if (dir === "up" || dir === "down") {
      if (!current.parentId) return;
      const parent = layout.nodes.find((n) => n.id === current.parentId);
      if (!parent) return;
      const siblings = parent.childIds;
      const idx = siblings.indexOf(current.id);
      if (dir === "up" && idx > 0) nextId = siblings[idx - 1];
      if (dir === "down" && idx < siblings.length - 1) nextId = siblings[idx + 1];
    }
    if (nextId) set({ selectedNodeId: nextId, editingNodeId: null });
  },

  addFloatingNode: () => {
    const { activeMap, panX, panY, zoom } = get();
    if (!activeMap) return;
    recordMapChange(get, set, "Add floating node");
    const node = createEmptyNode("Floating");
    const x = (120 - panX) / zoom;
    const y = (120 - panY) / zoom;
    const floatingNodes = [...(activeMap.floatingNodes ?? []), node];
    const positions = {
      ...(activeMap.positions ?? {}),
      [node.id]: { x, y },
    };
    set({
      activeMap: { ...activeMap, floatingNodes, positions },
      selectedNodeId: node.id,
      editingNodeId: node.id,
      dirtyMap: true,
    });
    scheduleMapSave(get, set);
  },

  beginLinkFrom: (nodeId) => {
    set({
      linkingFromId: nodeId,
      selectedNodeId: nodeId,
      editingNodeId: null,
      pendingLink: null,
    });
  },

  cancelLinking: () => set({ linkingFromId: null }),

  completeLinkTo: (nodeId) => {
    const { activeMap, linkingFromId } = get();
    if (!activeMap || !linkingFromId) return;
    if (nodeId === linkingFromId) {
      set({ linkingFromId: null });
      return;
    }
    const exists = (activeMap.links ?? []).some(
      (l) =>
        (l.fromId === linkingFromId && l.toId === nodeId) ||
        (l.fromId === nodeId && l.toId === linkingFromId),
    );
    if (exists) {
      set({ linkingFromId: null, selectedNodeId: nodeId });
      return;
    }
    set({
      linkingFromId: null,
      pendingLink: { fromId: linkingFromId, toId: nodeId },
      selectedNodeId: nodeId,
    });
  },

  confirmPendingLink: (label) => {
    const { activeMap, pendingLink } = get();
    if (!activeMap || !pendingLink) return;
    recordMapChange(get, set, "Link nodes");
    const trimmed = label?.trim();
    const link = createMapLink(
      pendingLink.fromId,
      pendingLink.toId,
      trimmed || undefined,
    );
    const links = [...(activeMap.links ?? []), link];
    set({
      activeMap: { ...activeMap, links },
      pendingLink: null,
      dirtyMap: true,
    });
    scheduleMapSave(get, set);
  },

  cancelPendingLink: () => set({ pendingLink: null }),

  removeLink: (linkId) => {
    const { activeMap } = get();
    if (!activeMap?.links?.length) return;
    if (!activeMap.links.some((l) => l.id === linkId)) return;
    recordMapChange(get, set, "Remove link");
    const links = activeMap.links.filter((l) => l.id !== linkId);
    set({
      activeMap: {
        ...activeMap,
        links: links.length ? links : undefined,
      },
      dirtyMap: true,
    });
    scheduleMapSave(get, set);
  },

  removeLinksForNode: (nodeId) => {
    const { activeMap } = get();
    if (!activeMap?.links?.length) return;
    const links = activeMap.links.filter(
      (l) => l.fromId !== nodeId && l.toId !== nodeId,
    );
    if (links.length === activeMap.links.length) return;
    recordMapChange(get, set, "Remove links");
    set({
      activeMap: {
        ...activeMap,
        links: links.length ? links : undefined,
      },
      dirtyMap: true,
    });
    scheduleMapSave(get, set);
  },

  setMinimapVisible: (visible) => set({ minimapVisible: visible }),

  toggleMinimap: () => set((s) => ({ minimapVisible: !s.minimapVisible })),

  setPanZoom: (panX, panY, zoom) =>
    set((s) => ({ panX, panY, zoom: zoom ?? s.zoom }))
  };
}
