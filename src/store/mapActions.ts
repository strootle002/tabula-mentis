import type { AppActions, GetState, SetState } from "./storeTypes";
import { recordMapChange, queueMapSave, scheduleMapSave } from "./storeServices";
import type { RadialDir } from "../mindmap/types";
import { createEmptyNode, loadNote, syncNodeNoteToVault, nodeNoteMirrorPath, nodeNotesFolderForMap } from "../vault/vaultFs";
import { collapseAll, collapseOneLevel, expandAll, expandOneLevel } from "../mindmap/layout";
import { collectDescendantIdsInDoc, findNodeInDoc, findParentInDoc, isFloatingRoot, pruneLinks, removeNodeInDoc, updateNodeInDoc } from "../mindmap/mapDoc";
import { flattenMapTags, upsertMapTagIndex, upsertNoteIndex } from "./indexing";
import { beginOwnWrite, endOwnWrite } from "./vaultWatcher";
import { rememberSavedNote } from "./storeServices";

export type MapActions = Pick<AppActions, "setSelectedNode" | "setEditingNode" | "updateSelectedText" | "updateSelectedNote" | "updateNodeNote" | "updateSelectedStyle" | "addChildToSelected" | "addSiblingToSelected" | "deleteSelected" | "toggleCollapseSelected" | "setCollapseSelected" | "collapseOneLevelSelected" | "expandOneLevelSelected" | "collapseAllNodes" | "expandAllNodes" | "saveActiveMap">;

export function createMapActions(set: SetState, get: GetState): MapActions {
  return {
  setSelectedNode: (id) =>
    set((s) => ({
      selectedNodeId: id,
      // Keep editing when re-selecting the node being edited (focus sync).
      editingNodeId: s.editingNodeId === id ? id : null,
    })),

  setEditingNode: (id) => set({ editingNodeId: id }),

  updateSelectedText: (text) => {
    const { activeMap, selectedNodeId } = get();
    if (!activeMap || !selectedNodeId) return;
    recordMapChange(get, set, "Edit node text", { coalesce: true });
    const next = updateNodeInDoc(activeMap, selectedNodeId, (n) => ({
      ...n,
      text,
    }));
    set({ activeMap: next, dirtyMap: true });
    scheduleMapSave(get, set);
  },

  updateSelectedNote: (note) => {
    const { selectedNodeId } = get();
    if (!selectedNodeId) return;
    get().updateNodeNote(selectedNodeId, note);
  },

  updateNodeNote: (nodeId, note) => {
    const { activeMap, activeMapPath, vaultPath } = get();
    if (!activeMap) return;
    const node = findNodeInDoc(activeMap, nodeId);
    if (!node) return;
    recordMapChange(get, set, "Edit node note", { coalesce: true });
    const nextMap = updateNodeInDoc(activeMap, nodeId, (n) => ({
      ...n,
      note,
    }));
    const mapTagsByPath = activeMapPath
      ? upsertMapTagIndex(get().mapTagsByPath, activeMapPath, nextMap)
      : get().mapTagsByPath;
    set({
      activeMap: nextMap,
      dirtyMap: true,
      mapTagsByPath,
      mapNodeTags: flattenMapTags(mapTagsByPath),
    });
    scheduleMapSave(get, set);
    if (vaultPath && node) {
      const mirrorPath = nodeNoteMirrorPath(
        vaultPath,
        activeMap.title,
        nodeId,
      );
      beginOwnWrite(mirrorPath);
      void syncNodeNoteToVault(
        vaultPath,
        activeMap.title,
        nodeId,
        node.text,
        note,
      )
        .then(async (path) => {
          const savedPath = path ?? mirrorPath;
          rememberSavedNote(savedPath, note);
          endOwnWrite(savedPath);
          const folder = nodeNotesFolderForMap(activeMap.title);
          if (!path) {
            set((state) => ({
              notes: state.notes.filter(
                (item) =>
                  !(item.folder === folder && item.path.includes(nodeId)),
              ),
              noteIndex: state.noteIndex.filter(
                (item) =>
                  !(item.folder === folder && item.path.includes(nodeId)),
              ),
            }));
            return;
          }
          const content = await loadNote(path);
          const meta = {
            name: node.text.trim() || `node-${nodeId}`,
            path,
            folder,
          };
          set((state) => ({
            notes: state.notes.some((item) => item.path === path)
              ? state.notes.map((item) =>
                  item.path === path ? meta : item,
                )
              : [...state.notes, meta],
            noteIndex: upsertNoteIndex(state.noteIndex, meta, content),
          }));
        })
        .catch((e) => {
          endOwnWrite(mirrorPath);
          const message = e instanceof Error ? e.message : String(e);
          set({ error: `Could not sync node note: ${message}` });
        });
    }
  },

  updateSelectedStyle: (style) => {
    const { activeMap, selectedNodeId } = get();
    if (!activeMap || !selectedNodeId) return;
    recordMapChange(get, set, "Change node style", { coalesce: true });
    const next = updateNodeInDoc(activeMap, selectedNodeId, (n) => ({
      ...n,
      style: { ...n.style, ...style },
    }));
    set({ activeMap: next, dirtyMap: true });
    scheduleMapSave(get, set);
  },

  addChildToSelected: () => {
    const { activeMap, selectedNodeId } = get();
    if (!activeMap || !selectedNodeId) return;
    recordMapChange(get, set, "Add child");
    const child = createEmptyNode("New node");
    let next = updateNodeInDoc(activeMap, selectedNodeId, (n) => ({
      ...n,
      collapsed: false,
      children: [...n.children, child],
    }));

    let radialDirs = next.radialDirs ? { ...next.radialDirs } : undefined;
    if (
      (next.layoutStyle ?? "right") === "radial" &&
      selectedNodeId === next.root.id
    ) {
      const counts: Record<RadialDir, number> = {
        right: 0,
        left: 0,
        down: 0,
        up: 0,
      };
      for (const existing of next.root.children) {
        if (existing.id === child.id) continue;
        const d = radialDirs?.[existing.id];
        if (d) counts[d] += 1;
      }
      const order: RadialDir[] = ["right", "left", "down", "up"];
      let best: RadialDir = order[0];
      for (const d of order) {
        if (counts[d] < counts[best]) best = d;
      }
      radialDirs = { ...(radialDirs ?? {}), [child.id]: best };
      next = { ...next, radialDirs };
    }

    set({
      activeMap: { ...next, positions: undefined },
      selectedNodeId: child.id,
      editingNodeId: child.id,
      dirtyMap: true,
    });
    scheduleMapSave(get, set);
  },

  addSiblingToSelected: () => {
    const { activeMap, selectedNodeId } = get();
    if (!activeMap || !selectedNodeId) return;
    if (selectedNodeId === activeMap.root.id || isFloatingRoot(activeMap, selectedNodeId)) {
      get().addChildToSelected();
      return;
    }
    const parent = findParentInDoc(activeMap, selectedNodeId);
    if (!parent) return;
    recordMapChange(get, set, "Add sibling");
    const sibling = createEmptyNode("New node");
    let next = updateNodeInDoc(activeMap, parent.id, (n) => {
      const idx = n.children.findIndex((c) => c.id === selectedNodeId);
      const children = [...n.children];
      children.splice(idx + 1, 0, sibling);
      return { ...n, children };
    });

    let radialDirs = next.radialDirs ? { ...next.radialDirs } : undefined;
    if (
      (next.layoutStyle ?? "right") === "radial" &&
      parent.id === next.root.id
    ) {
      const dir = radialDirs?.[selectedNodeId];
      if (dir) {
        radialDirs = { ...(radialDirs ?? {}), [sibling.id]: dir };
        next = { ...next, radialDirs };
      }
    }

    set({
      activeMap: { ...next, positions: undefined },
      selectedNodeId: sibling.id,
      editingNodeId: sibling.id,
      dirtyMap: true,
    });
    scheduleMapSave(get, set);
  },

  deleteSelected: () => {
    const { activeMap, selectedNodeId } = get();
    if (!activeMap || !selectedNodeId) return;
    if (selectedNodeId === activeMap.root.id) return;
    const parent = findParentInDoc(activeMap, selectedNodeId);
    recordMapChange(get, set, "Delete node");
    const deletedIds = new Set(
      collectDescendantIdsInDoc(activeMap, selectedNodeId),
    );
    let positions = activeMap.positions;
    if (positions) {
      const nextPos = { ...positions };
      for (const id of deletedIds) delete nextPos[id];
      positions = Object.keys(nextPos).length ? nextPos : undefined;
    }
    let next = removeNodeInDoc(activeMap, selectedNodeId);
    next = {
      ...next,
      positions,
      links: pruneLinks({ ...next, positions }),
    };
    let radialDirs = next.radialDirs ? { ...next.radialDirs } : undefined;
    if (radialDirs) {
      for (const id of deletedIds) delete radialDirs[id];
      if (Object.keys(radialDirs).length === 0) radialDirs = undefined;
      next = { ...next, radialDirs };
    }
    set({
      activeMap: next,
      selectedNodeId: parent?.id ?? activeMap.root.id,
      editingNodeId: null,
      dirtyMap: true,
    });
    scheduleMapSave(get, set);
  },

  toggleCollapseSelected: () => {
    const { activeMap, selectedNodeId } = get();
    if (!activeMap || !selectedNodeId) return;
    const node = findNodeInDoc(activeMap, selectedNodeId);
    if (!node || node.children.length === 0) return;
    get().setCollapseSelected(!node.collapsed);
  },

  setCollapseSelected: (collapsed) => {
    const { activeMap, selectedNodeId } = get();
    if (!activeMap || !selectedNodeId) return;
    const node = findNodeInDoc(activeMap, selectedNodeId);
    if (!node || node.children.length === 0) return;
    recordMapChange(get, set, collapsed ? "Collapse node" : "Expand node");
    const next = updateNodeInDoc(activeMap, selectedNodeId, (n) => ({
      ...n,
      collapsed,
    }));
    set({ activeMap: next, dirtyMap: true });
    scheduleMapSave(get, set);
  },

  collapseOneLevelSelected: () => {
    const { activeMap, selectedNodeId } = get();
    if (!activeMap || !selectedNodeId) return;
    recordMapChange(get, set, "Collapse one level");
    const root = collapseOneLevel(activeMap.root, selectedNodeId);
    set({ activeMap: { ...activeMap, root }, dirtyMap: true });
    scheduleMapSave(get, set);
  },

  expandOneLevelSelected: () => {
    const { activeMap, selectedNodeId } = get();
    if (!activeMap || !selectedNodeId) return;
    recordMapChange(get, set, "Expand one level");
    const root = expandOneLevel(activeMap.root, selectedNodeId);
    set({ activeMap: { ...activeMap, root }, dirtyMap: true });
    scheduleMapSave(get, set);
  },

  collapseAllNodes: () => {
    const { activeMap } = get();
    if (!activeMap) return;
    recordMapChange(get, set, "Collapse all");
    set({
      activeMap: { ...activeMap, root: collapseAll(activeMap.root) },
      dirtyMap: true,
    });
    scheduleMapSave(get, set);
  },

  expandAllNodes: () => {
    const { activeMap } = get();
    if (!activeMap) return;
    recordMapChange(get, set, "Expand all");
    set({
      activeMap: { ...activeMap, root: expandAll(activeMap.root) },
      dirtyMap: true,
    });
    scheduleMapSave(get, set);
  },

  saveActiveMap: async () => {
    const { activeMapPath, activeMap } = get();
    if (!activeMapPath || !activeMap) return;
    await queueMapSave(activeMapPath, activeMap);
    const mapTagsByPath = upsertMapTagIndex(
      get().mapTagsByPath,
      activeMapPath,
      activeMap,
    );
    set({
      mapTagsByPath,
      mapNodeTags: flattenMapTags(mapTagsByPath),
    });
    const latest = get();
    if (
      latest.activeMapPath === activeMapPath &&
      latest.activeMap === activeMap
    ) {
      set({ dirtyMap: false });
    }
  }
  };
}
