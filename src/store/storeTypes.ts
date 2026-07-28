import type { FlowDir, MapLayoutStyle, MindMapDocument, NodeStyle, VaultSettings, ViewKind } from "../mindmap/types";
import type { DropIntent } from "../mindmap/dropZones";
import type { KeybindingOverrides } from "../mindmap/keymap";
import { type NoteIndexEntry, type TagLineHit } from "../notes/links";
import type { FolderStats } from "../notes/libraryTree";
import { type CsvImportOptions, type TxtImportOptions } from "../import-export/io";
import { type MapHistoryEntry } from "../history/mapHistory";
import { type ExternalConflict } from "./conflicts";
import type { NavMode } from "./uiSlice";

export type { NavMode };

export interface AppDataState {
  ready: boolean;
  vaultPath: string | null;
  themeId: string;
  vaultSettings: VaultSettings;
  maps: { name: string; path: string; folder: string }[];
  notes: { name: string; path: string; folder: string }[];
  noteFolders: string[];
  mapFolders: string[];
  /** Library folder fs times (maps/ + notes/ twins), keyed by relative path. */
  folderStats: Record<string, FolderStats>;
  noteIndex: NoteIndexEntry[];
  mapNodeTags: string[];
  mapTagsByPath: Record<string, string[]>;
  activeTag: string | null;
  tagHits: TagLineHit[];
  /** Markdown body for the dedicated tag page note (not a library note). */
  activeTagNoteContent: string;
  activeTagNotePath: string | null;
  dirtyTagNote: boolean;
  view: ViewKind;
  activeMapPath: string | null;
  activeMap: MindMapDocument | null;
  selectedNodeId: string | null;
  /** Additional nodes selected via Shift+click, for bulk operations. */
  selectedNodeIds: string[];
  editingNodeId: string | null;
  /** When set, next node click completes a free link from this node. */
  linkingFromId: string | null;
  /** After choosing link target, optional label dialog before committing. */
  pendingLink: { fromId: string; toId: string } | null;
  minimapVisible: boolean;
  snapToGrid: boolean;
  /** Journal day heading to scroll to next time the journal note mounts. */
  journalFocusDate: string | null;
  mapTemplates: { name: string; path: string }[];
  activeNotePath: string | null;
  activeNoteName: string | null;
  activeNoteContent: string;
  panX: number;
  panY: number;
  zoom: number;
  dirtyMap: boolean;
  dirtyNote: boolean;
  importOpen: boolean;
  nodePanelOpen: boolean;
  noteAsideOpen: boolean;
  aboutOpen: boolean;
  shortcutsOpen: boolean;
  createDialog: null | {
    kind: "map" | "note" | "folder" | "choose";
    folderKind?: "notes" | "maps";
  };
  dataGrid: null | { title: string; headers: string[]; rows: string[][] };
  expandedFolders: Record<string, boolean>;
  mapHistory: MapHistoryEntry[];
  mapFuture: MapHistoryEntry[];
  sidebarWidth: number;
  sidebarCollapsed: boolean;
  navMode: NavMode;
  keybindings: KeybindingOverrides;
  error: string | null;
  externalConflict: ExternalConflict | null;
  toasts: { id: string; message: string; tone?: "info" | "success" | "error" }[];
  confirmDialog: null | {
    title: string;
    message: string;
    confirmLabel?: string;
    danger?: boolean;
    resolve: (ok: boolean) => void;
  };
  /** Session-only distraction-free presenting; not persisted. */
  presentationMode: boolean;
  /** Fullscreen flag captured when entering presentation, for restore. */
  presentationPrev: { fullscreen: boolean } | null;
}

export interface AppActions {
  bootstrap: () => Promise<void>;
  openVault: () => Promise<void>;
  createVault: () => Promise<void>;
  refreshVault: () => Promise<void>;
  setTheme: (themeId: string) => Promise<void>;
  updateVaultSettings: (patch: Partial<VaultSettings>) => Promise<void>;
  openMap: (path: string) => Promise<void>;
  createMap: (
    title?: string,
    layoutStyle?: MapLayoutStyle,
    folder?: string,
  ) => Promise<void>;
  archiveItem: (kind: "map" | "note", path: string) => Promise<void>;
  deleteItem: (kind: "map" | "note", path: string) => Promise<void>;
  archiveFolder: (folder: string) => Promise<void>;
  deleteFolder: (folder: string) => Promise<void>;
  renameItem: (
    kind: "map" | "note",
    path: string,
    newTitle: string,
  ) => Promise<void>;
  renameFolder: (folderPath: string, newName: string) => Promise<void>;
  setSelectedNode: (id: string | null) => void;
  toggleNodeSelection: (id: string) => void;
  clearNodeSelection: () => void;
  deleteSelectedNodes: () => void;
  setEditingNode: (id: string | null) => void;
  updateSelectedText: (text: string) => void;
  updateSelectedNote: (note: string) => void;
  updateNodeNote: (nodeId: string, note: string) => void;
  addImagesToSelected: (files: File[]) => Promise<void>;
  addImagesFromPaths: (paths: string[]) => Promise<void>;
  removeNodeImage: (imageId: string) => void;
  resizeNodeImage: (
    nodeId: string,
    imageId: string,
    width: number,
    height: number,
    opts?: { coalesce?: boolean },
  ) => void;
  updateSelectedStyle: (style: Partial<NodeStyle>) => void;
  addChildToSelected: () => void;
  addSiblingToSelected: () => void;
  deleteSelected: () => void;
  copySelectedSubtree: () => Promise<boolean>;
  pasteSubtreeFromClipboard: () => Promise<boolean>;
  toggleCollapseSelected: () => void;
  setCollapseSelected: (collapsed: boolean) => void;
  collapseOneLevelSelected: () => void;
  expandOneLevelSelected: () => void;
  collapseAllNodes: () => void;
  expandAllNodes: () => void;
  reparentSelectedTo: (parentId: string) => void;
  reparentNodeTo: (nodeId: string, parentId: string) => void;
  applyDropIntent: (nodeId: string, intent: DropIntent) => void;
  moveSubtree: (
    nodeId: string,
    dx: number,
    dy: number,
    opts?: { snap?: boolean },
  ) => void;
  resetLayoutPositions: () => void;
  focusSelectedNode: () => void;
  setSnapToGrid: (snap: boolean) => void;
  toggleSnapToGrid: () => void;
  setMapLayoutStyle: (style: MapLayoutStyle) => void;
  setFlowDir: (dir: FlowDir) => void;
  navigate: (dir: "left" | "right" | "up" | "down") => void;
  addFloatingNode: () => void;
  beginLinkFrom: (nodeId: string) => void;
  cancelLinking: () => void;
  completeLinkTo: (nodeId: string) => void;
  confirmPendingLink: (label?: string) => void;
  cancelPendingLink: () => void;
  removeLink: (linkId: string) => void;
  removeLinksForNode: (nodeId: string) => void;
  setMinimapVisible: (visible: boolean) => void;
  toggleMinimap: () => void;
  setPanZoom: (panX: number, panY: number, zoom?: number) => void;
  saveActiveMap: () => Promise<void>;
  openNote: (path: string) => Promise<void>;
  createNote: (title?: string, folder?: string, content?: string) => Promise<void>;
  openTodayJournal: () => Promise<void>;
  setJournalFocusDate: (dateKey: string | null) => void;
  openConceptGraph: () => Promise<void>;
  syncConceptGraphFromJournals: () => Promise<void>;
  createFolder: (folder: string) => Promise<void>;
  moveItem: (
    kind: "map" | "note",
    path: string,
    destFolder: string,
  ) => Promise<void>;
  /** Reorder a library folder before/after another sibling (custom sort). */
  reorderLibraryFolder: (
    draggedPath: string,
    targetPath: string,
    place?: "before" | "after",
  ) => Promise<void>;
  /** Move a library folder under a new parent ("" = root). Returns new path. */
  moveLibraryFolder: (
    folderPath: string,
    destParentPath: string,
  ) => Promise<string | null>;
  toggleFavoritePath: (path: string) => Promise<void>;
  saveActiveMapAsTemplate: (name?: string) => Promise<void>;
  createMapFromTemplate: (
    templatePath: string,
    title: string,
    folder?: string,
  ) => Promise<void>;
  setNoteContent: (content: string) => void;
  saveActiveNote: () => Promise<void>;
  openSettings: () => void;
  openAbout: () => void;
  setAboutOpen: (open: boolean) => void;
  openShortcuts: () => void;
  setShortcutsOpen: (open: boolean) => void;
  updateKeybindings: (overrides: KeybindingOverrides) => Promise<void>;
  resetKeybindings: () => Promise<void>;
  openTag: (tag: string) => Promise<void>;
  setTagNoteContent: (content: string) => void;
  saveActiveTagNote: () => Promise<void>;
  openHistory: () => void;
  backToMap: () => void;
  undo: () => void;
  redo: () => void;
  restoreHistoryEntry: (id: string) => void;
  setImportOpen: (open: boolean) => void;
  setNodePanelOpen: (open: boolean) => void;
  toggleNodePanel: () => void;
  setNoteAsideOpen: (open: boolean) => void;
  toggleNoteAside: () => void;
  openCreateDialog: (
    kind: "map" | "note" | "folder" | "choose",
    folderKind?: "notes" | "maps",
  ) => void;
  closeCreateDialog: () => void;
  openDataGrid: (title: string, headers: string[], rows: string[][]) => void;
  closeDataGrid: () => void;
  applyTableToActiveMap: (rows: string[][]) => void;
  toggleFolder: (folder: string) => void;
  setNavMode: (mode: NavMode) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
  setSidebarWidth: (width: number) => void;
  clearError: () => void;
  pushToast: (message: string, tone?: "info" | "success" | "error") => string;
  dismissToast: (id: string) => void;
  requestConfirm: (opts: {
    title: string;
    message: string;
    confirmLabel?: string;
    danger?: boolean;
  }) => Promise<boolean>;
  enterPresentationMode: () => Promise<void>;
  exitPresentationMode: () => Promise<void>;
  togglePresentationMode: () => Promise<void>;
  reloadExternalDocument: () => Promise<void>;
  keepLocalDocument: () => Promise<void>;
  importFile: (
    kind: "csv" | "txt" | "json",
    content: string,
    options: CsvImportOptions | TxtImportOptions,
    source?: { name: string; content: string },
  ) => Promise<boolean>;
  importMindMapDocument: (
    doc: MindMapDocument,
    source?: { name: string; content: string },
  ) => Promise<boolean>;
  getRelatedTags: (tag: string) => { tag: string; count: number }[];
  getAllTags: () => string[];
}

export type AppState = AppDataState & AppActions;
export type SetState = (partial: Partial<AppState> | ((state: AppState) => Partial<AppState>)) => void;
export type GetState = () => AppState;
