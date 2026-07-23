import type { ViewKind } from "../mindmap/types";
import { setSidebarPrefs, type NavMode } from "../vault/vaultFs";

export type { NavMode };

type CreateDialogState = {
  kind: "map" | "note" | "folder" | "choose";
  folderKind?: "notes" | "maps";
};

export interface UiNavigationState {
  view: ViewKind;
  activeMapPath: string | null;
  activeNotePath: string | null;
  importOpen: boolean;
  nodePanelOpen: boolean;
  noteAsideOpen: boolean;
  createDialog: CreateDialogState | null;
  dataGrid: { title: string; headers: string[]; rows: string[][] } | null;
  expandedFolders: Record<string, boolean>;
  sidebarWidth: number;
  sidebarCollapsed: boolean;
  navMode: NavMode;
}

type SetUiState<T extends UiNavigationState> = (
  partial: Partial<T> | ((state: T) => Partial<T>),
) => void;

function clampSidebarWidth(width: number): number {
  return Math.min(520, Math.max(220, Math.round(width)));
}

/** UI/navigation slice kept independent from map, note, and vault actions. */
export function createUiNavigationActions<T extends UiNavigationState>(
  set: SetUiState<T>,
  get: () => T,
) {
  return {
    setImportOpen: (importOpen: boolean) => set({ importOpen } as Partial<T>),
    setNodePanelOpen: (nodePanelOpen: boolean) =>
      set({ nodePanelOpen } as Partial<T>),
    toggleNodePanel: () =>
      set((state) => ({ nodePanelOpen: !state.nodePanelOpen }) as Partial<T>),
    setNoteAsideOpen: (noteAsideOpen: boolean) =>
      set({ noteAsideOpen } as Partial<T>),
    toggleNoteAside: () =>
      set((state) => ({ noteAsideOpen: !state.noteAsideOpen }) as Partial<T>),
    openCreateDialog: (
      kind: CreateDialogState["kind"],
      folderKind?: CreateDialogState["folderKind"],
    ) => set({ createDialog: { kind, folderKind } } as Partial<T>),
    closeCreateDialog: () => set({ createDialog: null } as Partial<T>),
    openDataGrid: (title: string, headers: string[], rows: string[][]) =>
      set({ dataGrid: { title, headers, rows }, view: "data" } as Partial<T>),
    closeDataGrid: () =>
      set((state) => ({
        dataGrid: null,
        view: state.activeMapPath
          ? "map"
          : state.activeNotePath
            ? "note"
            : "welcome",
      }) as Partial<T>),
    toggleFolder: (folder: string) =>
      set((state) => ({
        expandedFolders: {
          ...state.expandedFolders,
          [folder]: state.expandedFolders[folder] === false,
        },
      }) as Partial<T>),
    setNavMode: (navMode: NavMode) => {
      set({ navMode } as Partial<T>);
      void setSidebarPrefs({ navMode });
    },
    setSidebarCollapsed: (sidebarCollapsed: boolean) => {
      set({ sidebarCollapsed } as Partial<T>);
      void setSidebarPrefs({ collapsed: sidebarCollapsed });
    },
    toggleSidebar: () => {
      const sidebarCollapsed = !get().sidebarCollapsed;
      set({ sidebarCollapsed } as Partial<T>);
      void setSidebarPrefs({ collapsed: sidebarCollapsed });
    },
    setSidebarWidth: (width: number) => {
      const sidebarWidth = clampSidebarWidth(width);
      set({ sidebarWidth } as Partial<T>);
      void setSidebarPrefs({ width: sidebarWidth });
    },
  };
}
