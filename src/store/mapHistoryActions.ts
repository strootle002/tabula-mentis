import type { AppActions, GetState, SetState } from "./storeTypes";
import { scheduleMapSave } from "./storeServices";
import { appendHistory, makeHistoryEntry, resetHistoryCoalesce } from "../history/mapHistory";

export type MapHistoryActions = Pick<AppActions, "openHistory" | "backToMap" | "undo" | "redo" | "restoreHistoryEntry">;

export function createMapHistoryActions(set: SetState, get: GetState): MapHistoryActions {
  return {
  openHistory: () => {
    if (!get().activeMap) return;
    set({ view: "history" });
  },

  backToMap: () => {
    if (get().activeMapPath) set({ view: "map" });
  },

  undo: () => {
    const { activeMap, mapHistory, mapFuture, selectedNodeId } = get();
    if (!activeMap || mapHistory.length === 0) return;
    resetHistoryCoalesce();
    const prev = mapHistory[mapHistory.length - 1];
    const current = makeHistoryEntry(
      "Current state",
      activeMap,
      selectedNodeId,
    );
    set({
      activeMap: prev.map,
      selectedNodeId: prev.selectedNodeId,
      editingNodeId: null,
      mapHistory: mapHistory.slice(0, -1),
      mapFuture: [current, ...mapFuture],
      dirtyMap: true,
    });
    scheduleMapSave(get, set);
  },

  redo: () => {
    const { activeMap, mapHistory, mapFuture, selectedNodeId } = get();
    if (!activeMap || mapFuture.length === 0) return;
    resetHistoryCoalesce();
    const next = mapFuture[0];
    const current = makeHistoryEntry(
      "Current state",
      activeMap,
      selectedNodeId,
    );
    set({
      activeMap: next.map,
      selectedNodeId: next.selectedNodeId,
      editingNodeId: null,
      mapHistory: appendHistory(mapHistory, current),
      mapFuture: mapFuture.slice(1),
      dirtyMap: true,
    });
    scheduleMapSave(get, set);
  },

  restoreHistoryEntry: (id) => {
    const { activeMap, mapHistory, mapFuture, selectedNodeId } = get();
    if (!activeMap) return;
    const pastIdx = mapHistory.findIndex((e) => e.id === id);
    const futureIdx = mapFuture.findIndex((e) => e.id === id);
    if (pastIdx < 0 && futureIdx < 0) return;
    resetHistoryCoalesce();
    const current = makeHistoryEntry(
      "Current state",
      activeMap,
      selectedNodeId,
    );

    if (pastIdx >= 0) {
      const target = mapHistory[pastIdx];
      set({
        activeMap: target.map,
        selectedNodeId: target.selectedNodeId,
        editingNodeId: null,
        mapHistory: mapHistory.slice(0, pastIdx),
        mapFuture: [
          ...mapHistory.slice(pastIdx + 1),
          current,
          ...mapFuture,
        ],
        dirtyMap: true,
        view: "map",
      });
      scheduleMapSave(get, set);
      return;
    }

    const target = mapFuture[futureIdx];
    set({
      activeMap: target.map,
      selectedNodeId: target.selectedNodeId,
      editingNodeId: null,
      mapHistory: [
        ...mapHistory,
        current,
        ...mapFuture.slice(0, futureIdx),
      ],
      mapFuture: mapFuture.slice(futureIdx + 1),
      dirtyMap: true,
      view: "map",
    });
    scheduleMapSave(get, set);
  }
  };
}
