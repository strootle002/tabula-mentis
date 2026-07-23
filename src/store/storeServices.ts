import { SaveCoordinator, type SaveKind } from "./saveCoordinator";
import type { GetState, SetState } from "./storeTypes";
import type { MindMapDocument } from "../mindmap/types";
import { ensureVaultStructure, getAppThemeId, loadMap, loadNote, loadVaultSettings, saveMapAtPath, saveNoteAtPath, setSavedVaultPath } from "../vault/vaultFs";
import { collectNodeNoteRefs } from "../mindmap/layout";
import { applyTheme } from "../settings/themes";
import { appendHistory, makeHistoryEntry, resetHistoryCoalesce, shouldRecordChange } from "../history/mapHistory";
import { flattenMapTags, upsertMapTagIndex, upsertNoteIndex } from "./indexing";
import { decideExternalChange, mapsMatchIgnoringUpdatedAt } from "./conflicts";
import { beginOwnWrite, endOwnWrite, startVaultWatcher, stopVaultWatcher } from "./vaultWatcher";

export function recordMapChange(
  get: GetState,
  set: SetState,
  label: string,
  opts?: { coalesce?: boolean; coalesceKey?: string | null },
) {
  const { activeMap, selectedNodeId, mapHistory } = get();
  if (!activeMap) return;
  const key = opts?.coalesceKey ?? selectedNodeId;
  if (!shouldRecordChange(label, { ...opts, coalesceKey: key })) {
    // Still clear redo when coalesced typing continues after an undo.
    if (get().mapFuture.length) set({ mapFuture: [] });
    return;
  }
  set({
    mapHistory: appendHistory(
      mapHistory,
      makeHistoryEntry(label, activeMap, selectedNodeId),
    ),
    mapFuture: [],
  });
}

const saveCoordinator = new SaveCoordinator();

/** Last content this process successfully wrote — used to ignore save echoes. */
const lastSavedMaps = new Map<string, MindMapDocument>();
const lastSavedNotes = new Map<string, string>();

const normalizePath = (path: string) => path.replaceAll("\\", "/");

export function rememberSavedMap(path: string, map: MindMapDocument): void {
  lastSavedMaps.set(normalizePath(path), map);
}

export function rememberSavedNote(path: string, content: string): void {
  lastSavedNotes.set(normalizePath(path), content);
}

export function clearSavedDocumentAcks(path?: string): void {
  if (!path) {
    lastSavedMaps.clear();
    lastSavedNotes.clear();
    return;
  }
  const key = normalizePath(path);
  lastSavedMaps.delete(key);
  lastSavedNotes.delete(key);
}

export function queueMapSave(path: string, map: MindMapDocument): Promise<void> {
  return saveCoordinator.enqueue("map", async () => {
    beginOwnWrite(path);
    try {
      await saveMapAtPath(path, map);
      rememberSavedMap(path, map);
    } finally {
      // Grace window covers debounced watcher delivery after the rename.
      endOwnWrite(path);
    }
  });
}

export function queueNoteSave(path: string, content: string): Promise<void> {
  return saveCoordinator.enqueue("note", async () => {
    beginOwnWrite(path);
    try {
      await saveNoteAtPath(path, content);
      rememberSavedNote(path, content);
    } finally {
      endOwnWrite(path);
    }
  });
}

export function queueTagNoteSave(path: string, content: string): Promise<void> {
  return saveCoordinator.enqueue("tagNote", async () => {
    beginOwnWrite(path);
    try {
      await saveNoteAtPath(path, content);
      rememberSavedNote(path, content);
    } finally {
      endOwnWrite(path);
    }
  });
}

export function collectDocumentNodeNoteRefs(map: MindMapDocument) {
  return [
    ...collectNodeNoteRefs(map.root),
    ...(map.floatingNodes ?? []).flatMap((node) =>
      collectNodeNoteRefs(node),
    ),
  ];
}

export function scheduleMapSave(get: GetState, set: SetState) {
  if (get().externalConflict?.kind === "map") return;
  saveCoordinator.schedule("map", () => get().saveActiveMap(), (e) => {
    const message = e instanceof Error ? e.message : String(e);
    set({ error: `Could not save map: ${message}` });
  });
}

export function scheduleNoteSave(get: GetState, set: SetState) {
  if (get().externalConflict?.kind === "note") return;
  saveCoordinator.schedule("note", () => get().saveActiveNote(), (e) => {
    const message = e instanceof Error ? e.message : String(e);
    set({ error: `Could not save note: ${message}` });
  });
}

export function scheduleTagNoteSave(get: GetState, set: SetState) {
  saveCoordinator.schedule("tagNote", () => get().saveActiveTagNote(), (e) => {
    const message = e instanceof Error ? e.message : String(e);
    set({ error: `Could not save tag note: ${message}` });
  });
}

/** Flush debounced saves so switching docs never drops unsaved edits. */
export async function flushPendingSaves(get: GetState) {
  const { externalConflict } = get();
  if (externalConflict) {
    throw new Error(
      "Resolve the external file conflict before closing or switching documents.",
    );
  }
  // Edits during an in-flight save re-dirty the doc; loop until stable.
  for (let attempt = 0; attempt < 8; attempt++) {
    const { dirtyMap, dirtyNote, dirtyTagNote } = get();
    if (!dirtyMap && !dirtyNote && !dirtyTagNote) {
      await Promise.all([
        saveCoordinator.drain("map"),
        saveCoordinator.drain("note"),
        saveCoordinator.drain("tagNote"),
      ]);
      if (!get().dirtyMap && !get().dirtyNote && !get().dirtyTagNote) return;
      continue;
    }
    await saveCoordinator.flush(
      { map: dirtyMap, note: dirtyNote, tagNote: dirtyTagNote },
      {
        map: () => get().saveActiveMap(),
        note: () => get().saveActiveNote(),
        tagNote: () => get().saveActiveTagNote(),
      },
    );
  }
  if (get().dirtyMap || get().dirtyNote || get().dirtyTagNote) {
    throw new Error("Could not flush all pending saves before continuing.");
  }
}

export function cancelScheduledSave(kind: SaveKind): void {
  saveCoordinator.cancel(kind);
}

export async function drainSaveQueue(kind: SaveKind): Promise<void> {
  await saveCoordinator.drain(kind);
}

export async function handleExternalPaths(
  paths: string[],
  set: SetState,
  get: GetState,
): Promise<void> {
  const state = get();
  const activeMapKey = state.activeMapPath
    ? normalizePath(state.activeMapPath)
    : null;
  const activeNoteKey = state.activeNotePath
    ? normalizePath(state.activeNotePath)
    : null;
  const mapChanged = !!activeMapKey && paths.includes(activeMapKey);
  const noteChanged = !!activeNoteKey && paths.includes(activeNoteKey);

  if (mapChanged && state.activeMapPath) {
    try {
      const diskMap = await loadMap(state.activeMapPath);
      const latest = get();
      if (latest.activeMapPath === state.activeMapPath) {
        const lastSaved = lastSavedMaps.get(normalizePath(state.activeMapPath));
        // Own-save echo: disk matches what we last wrote, even if the user has
        // already typed newer unsaved edits on top.
        if (lastSaved && mapsMatchIgnoringUpdatedAt(lastSaved, diskMap)) {
          rememberSavedMap(state.activeMapPath, diskMap);
          if (
            latest.activeMap &&
            mapsMatchIgnoringUpdatedAt(latest.activeMap, diskMap)
          ) {
            set({ dirtyMap: false, externalConflict: null });
          }
        } else if (
          latest.activeMap &&
          mapsMatchIgnoringUpdatedAt(latest.activeMap, diskMap)
        ) {
          rememberSavedMap(state.activeMapPath, diskMap);
          set({ dirtyMap: false, externalConflict: null });
        } else {
          const decision = decideExternalChange(
            "map",
            state.activeMapPath,
            latest.dirtyMap,
          );
          if (decision.type === "conflict") {
            saveCoordinator.cancel("map");
            set({ externalConflict: decision.conflict });
          } else {
            const mapTagsByPath = upsertMapTagIndex(
              get().mapTagsByPath,
              state.activeMapPath,
              diskMap,
            );
            resetHistoryCoalesce();
            rememberSavedMap(state.activeMapPath, diskMap);
            set({
              activeMap: diskMap,
              dirtyMap: false,
              mapHistory: [],
              mapFuture: [],
              mapTagsByPath,
              mapNodeTags: flattenMapTags(mapTagsByPath),
            });
          }
        }
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      set({
        error: `Could not read map from disk: ${message}`,
      });
    }
  }

  if (noteChanged && state.activeNotePath) {
    try {
      const diskContent = await loadNote(state.activeNotePath);
      const latest = get();
      if (latest.activeNotePath === state.activeNotePath) {
        const lastSaved = lastSavedNotes.get(
          normalizePath(state.activeNotePath),
        );
        if (lastSaved != null && lastSaved === diskContent) {
          rememberSavedNote(state.activeNotePath, diskContent);
          if (latest.activeNoteContent === diskContent) {
            set({ dirtyNote: false, externalConflict: null });
          }
        } else if (latest.activeNoteContent === diskContent) {
          rememberSavedNote(state.activeNotePath, diskContent);
          set({ dirtyNote: false, externalConflict: null });
        } else {
          const decision = decideExternalChange(
            "note",
            state.activeNotePath,
            latest.dirtyNote,
          );
          if (decision.type === "conflict") {
            saveCoordinator.cancel("note");
            set({ externalConflict: decision.conflict });
          } else {
            const meta = get().notes.find(
              (note) => note.path === state.activeNotePath,
            );
            rememberSavedNote(state.activeNotePath, diskContent);
            set({
              activeNoteContent: diskContent,
              dirtyNote: false,
              ...(meta
                ? {
                    noteIndex: upsertNoteIndex(
                      get().noteIndex,
                      meta,
                      diskContent,
                    ),
                  }
                : {}),
            });
          }
        }
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      set({
        error: `Could not read note from disk: ${message}`,
      });
    }
  }

  if (
    paths.some(
      (path) => path !== activeMapKey && path !== activeNoteKey,
    )
  ) {
    await get().refreshVault();
  }
}

export async function openVaultAt(
  path: string,
  set: SetState,
  get: GetState,
) {
  try {
    await flushPendingSaves(get);
    await ensureVaultStructure(path);
    await setSavedVaultPath(path);
    const vaultSettings = await loadVaultSettings(path);
    const themeId = vaultSettings.themeId || (await getAppThemeId());
    applyTheme(themeId);
    resetHistoryCoalesce();
    clearSavedDocumentAcks();
    set({
      vaultPath: path,
      vaultSettings,
      themeId,
      view: "welcome",
      activeMap: null,
      activeMapPath: null,
      activeNotePath: null,
      activeNoteContent: "",
      activeTag: null,
      tagHits: [],
      activeTagNoteContent: "",
      activeTagNotePath: null,
      dirtyMap: false,
      dirtyNote: false,
      dirtyTagNote: false,
      externalConflict: null,
      mapHistory: [],
      mapFuture: [],
      error: null,
    });
    await get().refreshVault();
    await startVaultWatcher(path, (paths) => handleExternalPaths(paths, set, get));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("Failed to open vault:", e);
    await stopVaultWatcher().catch(() => undefined);
    set({
      error: `Could not open vault at ${path}: ${message}`,
      vaultPath: null,
    });
    throw e;
  }
}
