import type { AppActions, GetState, SetState } from "./storeTypes";
import type { KeyAction, KeybindingOverrides, KeyChord } from "../mindmap/keymap";
import {
  DEFAULT_KEYBINDINGS,
  setKeybindingOverrides,
} from "../mindmap/keymap";
import { setStoredKeybindings } from "../vault/vaultFs";

export type UiActions = Pick<
  AppActions,
  | "openSettings"
  | "openAbout"
  | "setAboutOpen"
  | "openShortcuts"
  | "setShortcutsOpen"
  | "updateKeybindings"
  | "resetKeybindings"
  | "pushToast"
  | "dismissToast"
  | "requestConfirm"
  | "enterPresentationMode"
  | "exitPresentationMode"
  | "togglePresentationMode"
>;

async function readFullscreen(): Promise<boolean> {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    return await getCurrentWindow().isFullscreen();
  } catch {
    return false;
  }
}

async function writeFullscreen(fullscreen: boolean): Promise<void> {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().setFullscreen(fullscreen);
  } catch {
    /* Chrome-hide presentation still works without OS fullscreen. */
  }
}

function sanitizeOverrides(raw: Record<string, unknown>): KeybindingOverrides {
  const next: KeybindingOverrides = {};
  for (const action of Object.keys(DEFAULT_KEYBINDINGS) as KeyAction[]) {
    const value = raw[action];
    if (!Array.isArray(value) || value.length === 0) continue;
    const chords: KeyChord[] = [];
    for (const item of value) {
      if (!item || typeof item !== "object") continue;
      const chord = item as KeyChord;
      if (typeof chord.key !== "string" || !chord.key) continue;
      chords.push({
        key: chord.key,
        ...(chord.mod ? { mod: true } : {}),
        ...(chord.ctrl ? { ctrl: true } : {}),
        ...(chord.meta ? { meta: true } : {}),
        ...(chord.alt ? { alt: true } : {}),
        ...(chord.shift ? { shift: true } : {}),
      });
    }
    if (chords.length) next[action] = chords;
  }
  return next;
}

export function createUiActions(set: SetState, get: GetState): UiActions {
  return {
  openSettings: () => set({ view: "settings" }),

  openAbout: () => set({ aboutOpen: true }),

  setAboutOpen: (aboutOpen) => set({ aboutOpen }),

  openShortcuts: () => set({ shortcutsOpen: true }),

  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),

  updateKeybindings: async (overrides) => {
    const sanitized = sanitizeOverrides(overrides as Record<string, unknown>);
    setKeybindingOverrides(sanitized);
    set({ keybindings: sanitized });
    await setStoredKeybindings(sanitized);
  },

  resetKeybindings: async () => {
    setKeybindingOverrides({});
    set({ keybindings: {} });
    await setStoredKeybindings({});
  },

  pushToast: (message, tone = "info") => {
    const id = crypto.randomUUID();
    set((state) => ({ toasts: [...state.toasts, { id, message, tone }] }));
    return id;
  },

  dismissToast: (id) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },

  requestConfirm: ({ title, message, confirmLabel, danger }) =>
    new Promise<boolean>((resolve) => {
      set({ confirmDialog: { title, message, confirmLabel, danger, resolve } });
    }),

  enterPresentationMode: async () => {
    const { view, presentationMode } = get();
    if (presentationMode) return;
    if (view !== "map" && view !== "note") return;
    const fullscreen = await readFullscreen();
    set({
      presentationMode: true,
      presentationPrev: { fullscreen },
      editingNodeId: null,
      linkingFromId: null,
      pendingLink: null,
    });
    if (!fullscreen) await writeFullscreen(true);
  },

  exitPresentationMode: async () => {
    const { presentationMode, presentationPrev } = get();
    if (!presentationMode) return;
    set({ presentationMode: false, presentationPrev: null });
    const wasFullscreen = presentationPrev?.fullscreen ?? false;
    const nowFullscreen = await readFullscreen();
    if (nowFullscreen !== wasFullscreen) {
      await writeFullscreen(wasFullscreen);
    }
  },

  togglePresentationMode: async () => {
    if (get().presentationMode) await get().exitPresentationMode();
    else await get().enterPresentationMode();
  },
  };
}

export { sanitizeOverrides };
