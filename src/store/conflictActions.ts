import type { AppActions, GetState, SetState } from "./storeTypes";
import { loadMap, loadNote } from "../vault/vaultFs";
import { resetHistoryCoalesce } from "../history/mapHistory";
import { flattenMapTags, upsertMapTagIndex, upsertNoteIndex } from "./indexing";
import { beginOwnWrite, endOwnWrite } from "./vaultWatcher";
import {
  cancelScheduledSave,
  drainSaveQueue,
  rememberSavedMap,
  rememberSavedNote,
  scheduleMapSave,
  scheduleNoteSave,
} from "./storeServices";

export type ConflictActions = Pick<AppActions, "clearError" | "reloadExternalDocument" | "keepLocalDocument">;

export function createConflictActions(set: SetState, get: GetState): ConflictActions {
  return {
  clearError: () => set({ error: null }),

  reloadExternalDocument: async () => {
    const conflict = get().externalConflict;
    if (!conflict) return;
    try {
      // Drop any in-flight save that could overwrite the reloaded disk version.
      if (conflict.kind === "map") {
        cancelScheduledSave("map");
        await drainSaveQueue("map");
        const map = await loadMap(conflict.path);
        const mapTagsByPath = upsertMapTagIndex(
          get().mapTagsByPath,
          conflict.path,
          map,
        );
        resetHistoryCoalesce();
        rememberSavedMap(conflict.path, map);
        set({
          activeMap: map,
          dirtyMap: false,
          mapHistory: [],
          mapFuture: [],
          mapTagsByPath,
          mapNodeTags: flattenMapTags(mapTagsByPath),
          externalConflict: null,
        });
      } else {
        cancelScheduledSave("note");
        await drainSaveQueue("note");
        const content = await loadNote(conflict.path);
        const meta = get().notes.find((note) => note.path === conflict.path);
        rememberSavedNote(conflict.path, content);
        set({
          activeNoteContent: content,
          dirtyNote: false,
          externalConflict: null,
          ...(meta
            ? { noteIndex: upsertNoteIndex(get().noteIndex, meta, content) }
            : {}),
        });
      }
    } catch (e) {
      set({
        error: `Could not reload external changes: ${
          e instanceof Error ? e.message : String(e)
        }`,
      });
    }
  },

  keepLocalDocument: async () => {
    const conflict = get().externalConflict;
    if (!conflict) return;
    try {
      // Clear conflict first so saves scheduled during/after keep can run.
      set({ externalConflict: null });
      beginOwnWrite(conflict.path);
      try {
        if (conflict.kind === "map") await get().saveActiveMap();
        else await get().saveActiveNote();
      } finally {
        endOwnWrite(conflict.path);
      }
      // Edits during the keep-save may have set dirty while schedule was blocked.
      if (get().dirtyMap) scheduleMapSave(get, set);
      if (get().dirtyNote) scheduleNoteSave(get, set);
    } catch (e) {
      set({
        error: `Could not keep local changes: ${
          e instanceof Error ? e.message : String(e)
        }`,
        externalConflict: conflict,
      });
    }
  }
  };
}
