import type { AppActions, GetState, SetState } from "./storeTypes";
import {
  flushPendingSaves,
  openVaultAt,
  rememberSavedMap,
  rememberSavedNote,
  clearSavedDocumentAcks,
} from "./storeServices";
import { isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  archiveEntry,
  collectFolderStats,
  createMapsFolder,
  createNotesFolder,
  createSampleMap,
  deleteEntry,
  deleteFolder as deleteVaultFolder,
  archiveFolder as archiveVaultFolder,
  getAppThemeId,
  getSavedVaultPath,
  getSidebarPrefs,
  getStoredKeybindings,
  isTagNotesPath,
  listMapFolders,
  listMaps,
  listMapTemplates,
  listNoteFolders,
  listNotes,
  loadMap,
  loadMapTemplate,
  loadNote,
  moveLibraryFolder as moveLibraryFolderFs,
  NODE_NOTES_ROOT,
  renameLibraryFolderFs,
  renameVaultItem,
  saveCorruptMapRecoveryCopy,
  saveMap,
  saveMapAtPath,
  saveMapTemplate,
  saveVaultSettings,
  setAppThemeId,
  uniqueMapFileName,
  moveVaultItem,
} from "../vault/vaultFs";
import { cloneNodeWithNewIds, stripNodeContent } from "../mindmap/mapDoc";
import type { MindMapDocument } from "../mindmap/types";
import {
  expandFolderAncestors,
  parentFolderPath,
  remapFolderOrderPaths,
  reorderSiblingFolders,
  withRecentPath,
} from "../notes/libraryTree";
import { isJournalFolder } from "../notes/journals";
import { MindMapFormatError } from "../mindmap/documentFormat";
import { reopenTrustedVault, trustSelectedVault } from "../vault/vaultAccess";
import { normalizeLayoutStyle } from "../mindmap/layoutCatalog";
import { applyTheme } from "../settings/themes";
import { buildNoteIndex } from "../notes/links";
import { resetHistoryCoalesce } from "../history/mapHistory";
import { extractMapNodeTags, flattenMapTags } from "./indexing";
import { setKeybindingOverrides } from "../mindmap/keymap";
import { sanitizeOverrides } from "./uiActions";

export type VaultActions = Pick<AppActions, "bootstrap" | "openVault" | "createVault" | "refreshVault" | "setTheme" | "updateVaultSettings" | "openMap" | "createMap" | "archiveItem" | "deleteItem" | "archiveFolder" | "deleteFolder" | "renameItem" | "renameFolder" | "createFolder" | "moveItem" | "reorderLibraryFolder" | "moveLibraryFolder" | "toggleFavoritePath" | "saveActiveMapAsTemplate" | "createMapFromTemplate">;

export function createVaultActions(set: SetState, get: GetState): VaultActions {
  return {
  bootstrap: async () => {
    try {
      const themeId = await getAppThemeId();
      applyTheme(themeId);
      const sidebar = await getSidebarPrefs();
      const keybindings = sanitizeOverrides(await getStoredKeybindings());
      setKeybindingOverrides(keybindings);
      set({
        themeId,
        sidebarWidth: sidebar.width,
        sidebarCollapsed: sidebar.collapsed,
        navMode: sidebar.navMode,
        minimapVisible: sidebar.minimapVisible,
        nodePanelOpen: sidebar.nodePanelOpen,
        noteAsideOpen: sidebar.noteAsideOpen,
        keybindings,
      });
      const trustedPath = await reopenTrustedVault();
      const path =
        trustedPath ?? (!isTauri() ? await getSavedVaultPath() : null);
      if (path) await openVaultAt(path, set, get);
    } catch (e) {
      set({ error: String(e) });
    } finally {
      set({ ready: true });
    }
  },

  openVault: async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        recursive: true,
        title: "Open vault folder",
      });
      if (selected == null) return;
      const selectedPath = Array.isArray(selected) ? selected[0] : selected;
      if (!selectedPath) return;
      const canonicalPath = await trustSelectedVault(selectedPath);
      await openVaultAt(canonicalPath, set, get);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      set({ error: `Open vault failed: ${message}` });
    }
  },

  createVault: async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        recursive: true,
        title: "Choose folder for new vault",
      });
      if (selected == null) return;
      const selectedPath = Array.isArray(selected) ? selected[0] : selected;
      if (!selectedPath) return;
      const canonicalPath = await trustSelectedVault(selectedPath);
      await openVaultAt(canonicalPath, set, get);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      set({ error: `Create vault failed: ${message}` });
    }
  },

  refreshVault: async () => {
    const { vaultPath, activeMap, activeMapPath } = get();
    if (!vaultPath) return;
    const maps = await listMaps(vaultPath);
    const noteList = await listNotes(vaultPath);
    const withContent = await Promise.all(
      noteList.map(async (n) => ({
        ...n,
        content: await loadNote(n.path).catch(() => ""),
      })),
    );
    const corruptMaps: { name: string; message: string }[] = [];
    const loadedOrNull = await Promise.all(
      maps.map(async (m) => {
        try {
          return await loadMap(m.path);
        } catch (e) {
          console.error(`Skipping corrupt map ${m.path}:`, e);
          corruptMaps.push({
            name: m.name,
            message: e instanceof Error ? e.message : String(e),
          });
          return null;
        }
      }),
    );
    const mapTagsByPath: Record<string, string[]> = {};
    for (let i = 0; i < maps.length; i++) {
      if (activeMap && maps[i]?.path === activeMapPath) {
        mapTagsByPath[maps[i]!.path] = extractMapNodeTags(activeMap);
      } else if (loadedOrNull[i]) {
        mapTagsByPath[maps[i]!.path] = extractMapNodeTags(loadedOrNull[i]!);
      }
    }
    if (activeMap && !maps.some((m) => m.path === activeMapPath)) {
      mapTagsByPath[activeMapPath!] = extractMapNodeTags(activeMap);
    }
    const noteFolders = await listNoteFolders(vaultPath);
    const mapFolders = await listMapFolders(vaultPath);
    const libraryFolders = expandFolderAncestors(
      [...mapFolders, ...noteFolders].filter((folder) => {
        if (
          folder === NODE_NOTES_ROOT ||
          folder.startsWith(`${NODE_NOTES_ROOT}/`)
        ) {
          return false;
        }
        if (isTagNotesPath(folder)) return false;
        if (isJournalFolder(folder)) return false;
        if (folder === "journals" || folder.startsWith("journals/")) return false;
        return true;
      }),
    );
    const folderStats = await collectFolderStats(vaultPath, libraryFolders);
    const mapTemplates = await listMapTemplates(vaultPath);
    const corruptSummary =
      corruptMaps.length > 0
        ? `${corruptMaps.length} map${corruptMaps.length === 1 ? "" : "s"} could not be read: ` +
          corruptMaps
            .slice(0, 3)
            .map(({ name, message }) => `${name} (${message})`)
            .join("; ") +
          (corruptMaps.length > 3 ? `; and ${corruptMaps.length - 3} more` : "") +
          ". The original files were left unchanged. Open a listed map to save a recovery copy."
        : undefined;
    set({
      maps,
      notes: noteList,
      noteFolders,
      mapFolders,
      folderStats,
      noteIndex: buildNoteIndex(withContent),
      mapTagsByPath,
      mapNodeTags: flattenMapTags(mapTagsByPath),
      mapTemplates,
      ...(corruptSummary ? { error: corruptSummary } : {}),
    });
  },

  setTheme: async (themeId) => {
    applyTheme(themeId);
    await setAppThemeId(themeId);
    const { vaultPath, vaultSettings } = get();
    const next = { ...vaultSettings, themeId };
    set({ themeId, vaultSettings: next });
    if (vaultPath) await saveVaultSettings(vaultPath, next);
  },

  updateVaultSettings: async (patch) => {
    const { vaultPath, vaultSettings } = get();
    const next = { ...vaultSettings, ...patch };
    set({ vaultSettings: next });
    if (patch.themeId) {
      applyTheme(patch.themeId);
      await setAppThemeId(patch.themeId);
      set({ themeId: patch.themeId });
    }
    if (vaultPath) await saveVaultSettings(vaultPath, next);
  },

  openMap: async (path) => {
    try {
      await flushPendingSaves(get);
      const doc = await loadMap(path);
      const layoutStyle = normalizeLayoutStyle(doc.layoutStyle);
      // Normalize in memory for the UI, but do not mark dirty: a dirty flag
      // without an immediate save makes own-write echoes look like conflicts.
      const normalized =
        layoutStyle !== doc.layoutStyle
          ? { ...doc, layoutStyle }
          : doc;
      resetHistoryCoalesce();
      rememberSavedMap(path, normalized);
      set({
        view: "map",
        activeMapPath: path,
        activeMap: normalized,
        selectedNodeId: normalized.root.id,
        editingNodeId: null,
        linkingFromId: null,
        pendingLink: null,
        panX: 40,
        panY: 40,
        zoom: 1,
        dirtyMap: false,
        mapHistory: [],
        mapFuture: [],
        error: null,
      });
      void get().updateVaultSettings({
        recentPaths: withRecentPath(get().vaultSettings.recentPaths, {
          kind: "map",
          path,
          name: normalized.title,
        }),
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (e instanceof MindMapFormatError) {
        const { vaultPath } = get();
        if (vaultPath) {
          try {
            const recoveryPath = await saveCorruptMapRecoveryCopy(
              vaultPath,
              path,
            );
            set({
              error:
                `Could not open map: ${message}. The original was not changed. ` +
                `A recovery copy was saved to ${recoveryPath}.`,
            });
            return;
          } catch (recoveryError) {
            const recoveryMessage =
              recoveryError instanceof Error
                ? recoveryError.message
                : String(recoveryError);
            set({
              error:
                `Could not open map: ${message}. The original was not changed, ` +
                `and a recovery copy could not be saved: ${recoveryMessage}`,
            });
            return;
          }
        }
      }
      set({ error: `Could not open map: ${message}` });
    }
  },

  createMap: async (title = "Untitled Map", layoutStyle = "right", folder = "") => {
    const { vaultPath } = get();
    if (!vaultPath) return;
    try {
      const doc = createSampleMap(title);
      doc.root.children = [];
      doc.root.text = title;
      doc.layoutStyle = layoutStyle;
      const fileName = await uniqueMapFileName(vaultPath, title, folder);
      const path = await saveMap(vaultPath, fileName, doc, folder);
      set({
        createDialog: null,
        expandedFolders: folder
          ? { ...get().expandedFolders, [`map:${folder}`]: true }
          : get().expandedFolders,
      });
      await get().refreshVault();
      await get().openMap(path);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      set({ error: `Could not create map: ${message}` });
    }
  },

  archiveItem: async (kind, path) => {
    const { vaultPath, activeMapPath, activeNotePath } = get();
    if (!vaultPath) return;
    try {
      await flushPendingSaves(get);
      await archiveEntry(vaultPath, path);
      if (kind === "map" && activeMapPath === path) {
        resetHistoryCoalesce();
        clearSavedDocumentAcks(path);
        set({
          activeMap: null,
          activeMapPath: null,
          dirtyMap: false,
          externalConflict: null,
          view: "welcome",
          mapHistory: [],
          mapFuture: [],
        });
      }
      if (kind === "note" && activeNotePath === path) {
        clearSavedDocumentAcks(path);
        set({
          activeNotePath: null,
          activeNoteContent: "",
          dirtyNote: false,
          externalConflict: null,
          view: "welcome",
        });
      }
      await get().refreshVault();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: `Could not archive item: ${message}` });
    }
  },

  deleteItem: async (kind, path) => {
    const { activeMapPath, activeNotePath } = get();
    try {
      await flushPendingSaves(get);
      await deleteEntry(path);
      if (kind === "map" && activeMapPath === path) {
        resetHistoryCoalesce();
        clearSavedDocumentAcks(path);
        set({
          activeMap: null,
          activeMapPath: null,
          dirtyMap: false,
          externalConflict: null,
          view: "welcome",
          mapHistory: [],
          mapFuture: [],
        });
      }
      if (kind === "note" && activeNotePath === path) {
        clearSavedDocumentAcks(path);
        set({
          activeNotePath: null,
          activeNoteContent: "",
          dirtyNote: false,
          externalConflict: null,
          view: "welcome",
        });
      }
      await get().refreshVault();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: `Could not delete item: ${message}` });
    }
  },

  archiveFolder: async (folder) => {
    const { vaultPath, activeMapPath, activeNotePath, maps, notes } = get();
    if (!vaultPath || !folder.trim()) return;
    await flushPendingSaves(get);
    const trimmed = folder.trim().replace(/^\/+|\/+$/g, "");
    try {
      await archiveVaultFolder(vaultPath, trimmed);
      const under = (itemFolder: string) =>
        itemFolder === trimmed || itemFolder.startsWith(`${trimmed}/`);
      const mapHit = maps.some(
        (m) => m.path === activeMapPath && under(m.folder),
      );
      const noteHit = notes.some(
        (n) => n.path === activeNotePath && under(n.folder),
      );
      if (mapHit) {
        resetHistoryCoalesce();
        set({
          activeMap: null,
          activeMapPath: null,
          view: "welcome",
          mapHistory: [],
          mapFuture: [],
        });
      }
      if (noteHit) {
        set({
          activeNotePath: null,
          activeNoteContent: "",
          view: mapHit ? "welcome" : get().view === "note" ? "welcome" : get().view,
        });
      }
      await get().refreshVault();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      set({ error: `Could not archive folder: ${message}` });
    }
  },

  deleteFolder: async (folder) => {
    const { vaultPath, activeMapPath, activeNotePath, maps, notes } = get();
    if (!vaultPath || !folder.trim()) return;
    await flushPendingSaves(get);
    const trimmed = folder.trim().replace(/^\/+|\/+$/g, "");
    try {
      await deleteVaultFolder(vaultPath, trimmed);
      const under = (itemFolder: string) =>
        itemFolder === trimmed || itemFolder.startsWith(`${trimmed}/`);
      const mapHit = maps.some(
        (m) => m.path === activeMapPath && under(m.folder),
      );
      const noteHit = notes.some(
        (n) => n.path === activeNotePath && under(n.folder),
      );
      if (mapHit) {
        resetHistoryCoalesce();
        set({
          activeMap: null,
          activeMapPath: null,
          view: "welcome",
          mapHistory: [],
          mapFuture: [],
        });
      }
      if (noteHit) {
        set({
          activeNotePath: null,
          activeNoteContent: "",
          view: "welcome",
        });
      }
      await get().refreshVault();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      set({ error: `Could not delete folder: ${message}` });
    }
  },

  renameItem: async (kind, path, newTitle) => {
    const { vaultPath, activeMapPath, activeNotePath, activeMap, activeNoteContent } =
      get();
    if (!vaultPath) return;
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    try {
      await flushPendingSaves(get);
      const newPath = await renameVaultItem(vaultPath, kind, path, trimmed);

      if (kind === "map") {
        if (activeMapPath === path && activeMap) {
          clearSavedDocumentAcks(path);
          set({
            activeMapPath: newPath,
            activeMap: { ...activeMap, title: trimmed },
            dirtyMap: true,
          });
          await get().saveActiveMap();
        } else if (newPath !== path) {
          const doc = await loadMap(newPath);
          if (doc.title !== trimmed) {
            await saveMapAtPath(newPath, { ...doc, title: trimmed });
          }
        }
      } else if (activeNotePath === path) {
        clearSavedDocumentAcks(path);
        rememberSavedNote(newPath, activeNoteContent);
        set({ activeNotePath: newPath, activeNoteName: trimmed });
      }
      set({ error: null });
      await get().refreshVault();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      set({ error: `Could not rename item: ${message}` });
    }
  },

  renameFolder: async (folderPath, newName) => {
    const { vaultPath, vaultSettings, activeMapPath, activeNotePath, maps, notes } =
      get();
    if (!vaultPath) return;
    const trimmedName = newName.trim();
    if (!trimmedName) return;
    try {
      await flushPendingSaves(get);
      const prevMap = maps.find((m) => m.path === activeMapPath) ?? null;
      const prevNote = notes.find((n) => n.path === activeNotePath) ?? null;
      const remapItemFolder = (itemFolder: string, from: string, to: string) => {
        if (itemFolder === from) return to;
        if (itemFolder.startsWith(`${from}/`)) {
          return `${to}${itemFolder.slice(from.length)}`;
        }
        return itemFolder;
      };

      const newPath = await renameLibraryFolderFs(
        vaultPath,
        folderPath,
        trimmedName,
      );
      if (newPath === folderPath) return;

      const nextOrder = remapFolderOrderPaths(
        vaultSettings.libraryFolderOrder ?? [],
        folderPath,
        newPath,
      );
      await get().updateVaultSettings({ libraryFolderOrder: nextOrder });
      set({
        expandedFolders: {
          ...get().expandedFolders,
          [newPath]: true,
        },
        error: null,
      });
      await get().refreshVault();

      if (prevMap) {
        const nextFolder = remapItemFolder(prevMap.folder, folderPath, newPath);
        if (nextFolder !== prevMap.folder) {
          const moved = get().maps.find(
            (m) => m.name === prevMap.name && m.folder === nextFolder,
          );
          if (moved) await get().openMap(moved.path);
        }
      }
      if (prevNote) {
        const nextFolder = remapItemFolder(
          prevNote.folder,
          folderPath,
          newPath,
        );
        if (nextFolder !== prevNote.folder) {
          const moved = get().notes.find(
            (n) => n.name === prevNote.name && n.folder === nextFolder,
          );
          if (moved) await get().openNote(moved.path);
        }
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      set({ error: `Could not rename folder: ${message}` });
    }
  },

  createFolder: async (folder) => {
    const { vaultPath } = get();
    if (!vaultPath || !folder.trim()) return;
    try {
      const trimmed = folder.trim().replace(/^\/+|\/+$/g, "");
      await createMapsFolder(vaultPath, trimmed);
      await createNotesFolder(vaultPath, trimmed);
      set({
        createDialog: null,
        expandedFolders: {
          ...get().expandedFolders,
          [trimmed]: true,
        },
        error: null,
      });
      await get().refreshVault();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      set({ error: `Could not create folder: ${message}` });
    }
  },

  moveItem: async (kind, path, destFolder) => {
    const { vaultPath, maps, notes, activeMapPath, activeNotePath } = get();
    if (!vaultPath) return;
    const trimmed = destFolder.trim().replace(/^\/+|\/+$/g, "");
    const current =
      kind === "map"
        ? maps.find((m) => m.path === path)
        : notes.find((n) => n.path === path);
    if (!current) return;
    if (current.folder === trimmed) return;

    try {
      await flushPendingSaves(get);
      const newPath = await moveVaultItem(vaultPath, kind, path, trimmed);
      const expandKey =
        kind === "map"
          ? trimmed
            ? `map:${trimmed}`
            : null
          : trimmed || null;
      if (kind === "map" && activeMapPath === path) {
        clearSavedDocumentAcks(path);
        const map = get().activeMap;
        if (map) rememberSavedMap(newPath, map);
      }
      if (kind === "note" && activeNotePath === path) {
        clearSavedDocumentAcks(path);
        rememberSavedNote(newPath, get().activeNoteContent);
      }
      set({
        ...(kind === "map" && activeMapPath === path
          ? { activeMapPath: newPath }
          : {}),
        ...(kind === "note" && activeNotePath === path
          ? { activeNotePath: newPath }
          : {}),
        ...(expandKey
          ? {
              expandedFolders: {
                ...get().expandedFolders,
                [expandKey]: true,
              },
            }
          : {}),
        error: null,
      });
      await get().refreshVault();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      set({ error: `Could not move item: ${message}` });
    }
  },

  reorderLibraryFolder: async (draggedPath, targetPath, place = "before") => {
    const { vaultSettings, mapFolders, noteFolders } = get();
    const allFolders = expandFolderAncestors(
      [...mapFolders, ...noteFolders].filter((folder) => {
        if (
          folder === NODE_NOTES_ROOT ||
          folder.startsWith(`${NODE_NOTES_ROOT}/`)
        ) {
          return false;
        }
        if (isTagNotesPath(folder)) return false;
        if (isJournalFolder(folder)) return false;
        if (folder === "journals" || folder.startsWith("journals/")) return false;
        return true;
      }),
    );
    const nextOrder = reorderSiblingFolders(
      vaultSettings.libraryFolderOrder ?? [],
      allFolders,
      draggedPath,
      targetPath,
      place,
    );
    if (!nextOrder) return;
    await get().updateVaultSettings({
      libraryFolderSort: "custom",
      libraryFolderOrder: nextOrder,
    });
  },

  moveLibraryFolder: async (folderPath, destParentPath) => {
    const { vaultPath, vaultSettings, activeMapPath, activeNotePath, maps, notes } =
      get();
    if (!vaultPath) return null;
    const trimmedParent = destParentPath.trim().replace(/^\/+|\/+$/g, "");
    if (parentFolderPath(folderPath) === trimmedParent) return folderPath;
    try {
      await flushPendingSaves(get);
      const prevMap = maps.find((m) => m.path === activeMapPath) ?? null;
      const prevNote = notes.find((n) => n.path === activeNotePath) ?? null;
      const remapItemFolder = (itemFolder: string, from: string, to: string) => {
        if (itemFolder === from) return to;
        if (itemFolder.startsWith(`${from}/`)) {
          return `${to}${itemFolder.slice(from.length)}`;
        }
        return itemFolder;
      };

      const newPath = await moveLibraryFolderFs(
        vaultPath,
        folderPath,
        trimmedParent,
      );
      if (newPath === folderPath) return folderPath;

      const nextOrder = remapFolderOrderPaths(
        vaultSettings.libraryFolderOrder ?? [],
        folderPath,
        newPath,
      );
      await get().updateVaultSettings({ libraryFolderOrder: nextOrder });
      set({
        expandedFolders: {
          ...get().expandedFolders,
          ...(trimmedParent ? { [trimmedParent]: true } : {}),
          [newPath]: true,
        },
        error: null,
      });
      await get().refreshVault();

      if (prevMap) {
        const nextFolder = remapItemFolder(prevMap.folder, folderPath, newPath);
        if (nextFolder !== prevMap.folder) {
          const moved = get().maps.find(
            (m) => m.name === prevMap.name && m.folder === nextFolder,
          );
          if (moved) await get().openMap(moved.path);
        }
      }
      if (prevNote) {
        const nextFolder = remapItemFolder(
          prevNote.folder,
          folderPath,
          newPath,
        );
        if (nextFolder !== prevNote.folder) {
          const moved = get().notes.find(
            (n) => n.name === prevNote.name && n.folder === nextFolder,
          );
          if (moved) await get().openNote(moved.path);
        }
      }
      return newPath;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      set({ error: `Could not move folder: ${message}` });
      return null;
    }
  },

  toggleFavoritePath: async (path) => {
    const favorites = new Set(get().vaultSettings.favoritePaths ?? []);
    if (favorites.has(path)) favorites.delete(path);
    else favorites.add(path);
    await get().updateVaultSettings({ favoritePaths: [...favorites] });
  },

  saveActiveMapAsTemplate: async (name) => {
    const { vaultPath, activeMap } = get();
    if (!vaultPath || !activeMap) return;
    try {
      const templateName = (name ?? activeMap.title).trim() || "Template";
      const now = new Date().toISOString();
      const floatingNodes = (activeMap.floatingNodes ?? []).map(
        stripNodeContent,
      );
      const doc: MindMapDocument = {
        version: 1,
        title: templateName,
        root: stripNodeContent(activeMap.root),
        layoutStyle: activeMap.layoutStyle,
        flowDir: activeMap.flowDir,
        positions: activeMap.positions,
        radialDirs: activeMap.radialDirs,
        floatingNodes: floatingNodes.length ? floatingNodes : undefined,
        createdAt: now,
        updatedAt: now,
      };
      await saveMapTemplate(vaultPath, templateName, doc);
      set({ mapTemplates: await listMapTemplates(vaultPath) });
      get().pushToast(`Saved template "${templateName}"`, "success");
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      set({ error: `Could not save template: ${message}` });
    }
  },

  createMapFromTemplate: async (templatePath, title, folder = "") => {
    const { vaultPath } = get();
    if (!vaultPath) return;
    try {
      const template = await loadMapTemplate(templatePath);
      const now = new Date().toISOString();
      const root = cloneNodeWithNewIds(template.root);
      root.text = title;
      const doc: MindMapDocument = {
        ...template,
        title,
        root,
        floatingNodes: template.floatingNodes?.map(cloneNodeWithNewIds),
        createdAt: now,
        updatedAt: now,
      };
      const fileName = await uniqueMapFileName(vaultPath, title, folder);
      const path = await saveMap(vaultPath, fileName, doc, folder);
      set({ createDialog: null });
      await get().refreshVault();
      await get().openMap(path);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      set({ error: `Could not create map from template: ${message}` });
    }
  },
  };
}
