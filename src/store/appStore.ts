import { create, type StateCreator } from "zustand";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import type { MindNode } from "../mindmap/types";
import { findNode } from "../mindmap/layout";
import type { AppState } from "./storeTypes";
import { createVaultActions } from "./vaultActions";
import { createMapActions } from "./mapActions";
import { createMapMediaActions } from "./mapMediaActions";
import { createMapLayoutActions } from "./mapLayoutActions";
import { createMapHistoryActions } from "./mapHistoryActions";
import { createNoteActions } from "./noteActions";
import { createImportActions } from "./importActions";
import { createConflictActions } from "./conflictActions";
import { createUiActions } from "./uiActions";
import { createUiNavigationActions } from "./uiSlice";
import { flushPendingSaves } from "./storeServices";

export type { AppState, AppActions, AppDataState } from "./storeTypes";

/** Composes domain action groups without exposing their implementation modules. */
export const createAppState: StateCreator<AppState> = (set, get) => ({
  ready: false,
  vaultPath: null,
  themeId: "paper",
  vaultSettings: {
    themeId: "paper",
    defaultLayoutStyle: "right",
    defaultNodeStyle: {
      fill: "#f4f1ea",
      stroke: "#5a5348",
      textColor: "#3a342c",
      fontSize: 14,
      scale: 1,
    },
  },
  maps: [],
  notes: [],
  noteFolders: [],
  mapFolders: [],
  folderStats: {},
  noteIndex: [],
  mapNodeTags: [],
  mapTagsByPath: {},
  activeTag: null,
  tagHits: [],
  activeTagNoteContent: "",
  activeTagNotePath: null,
  dirtyTagNote: false,
  view: "welcome",
  activeMapPath: null,
  activeMap: null,
  selectedNodeId: null,
  selectedNodeIds: [],
  editingNodeId: null,
  linkingFromId: null,
  pendingLink: null,
  minimapVisible: true,
  snapToGrid: false,
  journalFocusDate: null,
  mapTemplates: [],
  activeNotePath: null,
  activeNoteName: null,
  activeNoteContent: "",
  panX: 40,
  panY: 40,
  zoom: 1,
  dirtyMap: false,
  dirtyNote: false,
  importOpen: false,
  nodePanelOpen: true,
  noteAsideOpen: true,
  aboutOpen: false,
  shortcutsOpen: false,
  createDialog: null,
  dataGrid: null,
  expandedFolders: {},
  mapHistory: [],
  mapFuture: [],
  sidebarWidth: 300,
  sidebarCollapsed: false,
  navMode: "library",
  keybindings: {},
  error: null,
  externalConflict: null,
  toasts: [],
  confirmDialog: null,
  presentationMode: false,
  presentationPrev: null,
  ...createVaultActions(set, get),
  ...createMapActions(set, get),
  ...createMapMediaActions(set, get),
  ...createMapLayoutActions(set, get),
  ...createMapHistoryActions(set, get),
  ...createNoteActions(set, get),
  ...createImportActions(set, get),
  ...createConflictActions(set, get),
  ...createUiActions(set, get),
  ...createUiNavigationActions(set, get),
});

export const useAppStore = create<AppState>(createAppState);


export async function pickAndReadTextFile(): Promise<{
  name: string;
  content: string;
} | null> {
  const selected = await open({
    multiple: false,
    filters: [
      {
        name: "Importable",
        extensions: ["csv", "txt", "json", "md", "mm", "opml", "xml"],
      },
    ],
  });
  if (!selected || Array.isArray(selected)) return null;
  try {
    const content = await readTextFile(selected);
    const name = selected.split(/[/\\]/).pop() ?? "import";
    return { name, content };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    throw new Error(
      `Could not read file. Pick a file under Home, Documents, Desktop, or Downloads. (${detail})`,
    );
  }
}

export function getSelectedMindNode(): MindNode | null {
  const { activeMap, selectedNodeId } = useAppStore.getState();
  if (!activeMap || !selectedNodeId) return null;
  return findNode(activeMap.root, selectedNodeId);
}

/** Flush debounced and queued writes before the desktop window is destroyed. */
export async function flushPendingAppSaves(): Promise<void> {
  await flushPendingSaves(() => useAppStore.getState());
}
