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
>;

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

export function createUiActions(set: SetState, _get: GetState): UiActions {
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
  };
}

export { sanitizeOverrides };
