export type KeyAction =
  | "nav-left"
  | "nav-right"
  | "nav-up"
  | "nav-down"
  | "add-child"
  | "add-sibling"
  | "delete"
  | "edit"
  | "toggle-collapse"
  | "toggle-node-panel"
  | "focus-node"
  | "escape"
  | "undo"
  | "redo";

/** Serializable chord used for defaults and user overrides. */
export interface KeyChord {
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  alt?: boolean;
  shift?: boolean;
  /** Match either Ctrl or Meta (Command). */
  mod?: boolean;
}

export const KEY_ACTION_LABELS: Record<KeyAction, string> = {
  "nav-left": "Navigate left",
  "nav-right": "Navigate right",
  "nav-up": "Navigate up",
  "nav-down": "Navigate down",
  "add-child": "Add child",
  "add-sibling": "Add sibling",
  delete: "Delete node",
  edit: "Edit node",
  "toggle-collapse": "Collapse / expand",
  "toggle-node-panel": "Toggle node notes panel",
  "focus-node": "Center selected node",
  escape: "Cancel / close",
  undo: "Undo",
  redo: "Redo",
};

/** Built-in shortcuts. User overrides replace individual actions. */
export const DEFAULT_KEYBINDINGS: Record<KeyAction, KeyChord[]> = {
  "nav-left": [{ key: "ArrowLeft" }],
  "nav-right": [{ key: "ArrowRight" }],
  "nav-up": [{ key: "ArrowUp" }],
  "nav-down": [{ key: "ArrowDown" }],
  "add-child": [{ key: "Tab" }, { key: "t", mod: true }],
  "add-sibling": [{ key: "Enter" }, { key: "Enter", mod: true }],
  delete: [{ key: "Delete" }, { key: "Backspace" }],
  edit: [{ key: "F2" }],
  "toggle-collapse": [{ key: " " }],
  "toggle-node-panel": [{ key: "n", mod: true }],
  "focus-node": [{ key: "f" }],
  escape: [{ key: "Escape" }],
  undo: [{ key: "z", mod: true }],
  redo: [
    { key: "z", mod: true, shift: true },
    { key: "y", mod: true },
  ],
};

export type KeybindingOverrides = Partial<Record<KeyAction, KeyChord[]>>;

let activeOverrides: KeybindingOverrides = {};

export function setKeybindingOverrides(overrides: KeybindingOverrides): void {
  activeOverrides = overrides ?? {};
}

export function getKeybindingOverrides(): KeybindingOverrides {
  return activeOverrides;
}

export function effectiveKeybindings(
  overrides: KeybindingOverrides = activeOverrides,
): Record<KeyAction, KeyChord[]> {
  const next = { ...DEFAULT_KEYBINDINGS };
  for (const [action, chords] of Object.entries(overrides) as [
    KeyAction,
    KeyChord[],
  ][]) {
    if (chords?.length) next[action] = chords;
  }
  return next;
}

function chordMatches(e: KeyboardEvent, chord: KeyChord): boolean {
  const eventKey = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const chordKey = chord.key.length === 1 ? chord.key.toLowerCase() : chord.key;
  const keyOk =
    eventKey === chordKey ||
    e.code === chord.key ||
    (chord.key.length === 1 && e.code === `Key${chord.key.toUpperCase()}`);
  if (!keyOk) return false;

  if (chord.mod) {
    if (!(e.ctrlKey || e.metaKey)) return false;
  } else {
    if (!!chord.ctrl !== e.ctrlKey) return false;
    if (!!chord.meta !== e.metaKey) return false;
  }
  if (!!chord.alt !== e.altKey) return false;
  if (!!chord.shift !== e.shiftKey) return false;
  return true;
}

export function formatChord(chord: KeyChord): string {
  const parts: string[] = [];
  if (chord.mod) parts.push("Ctrl/⌘");
  else {
    if (chord.ctrl) parts.push("Ctrl");
    if (chord.meta) parts.push("⌘");
  }
  if (chord.alt) parts.push("Alt");
  if (chord.shift) parts.push("Shift");
  const keyLabel =
    chord.key === " " ? "Space" : chord.key.length === 1 ? chord.key.toUpperCase() : chord.key;
  parts.push(keyLabel);
  return parts.join("+");
}

export function eventToChord(e: KeyboardEvent): KeyChord | null {
  if (e.key === "Shift" || e.key === "Control" || e.key === "Meta" || e.key === "Alt") {
    return null;
  }
  const chord: KeyChord = {
    key: e.key.length === 1 ? e.key.toLowerCase() : e.key,
  };
  if (e.ctrlKey || e.metaKey) chord.mod = true;
  if (e.altKey) chord.alt = true;
  if (e.shiftKey) chord.shift = true;
  return chord;
}

export function resolveKeyAction(
  e: KeyboardEvent,
  overrides: KeybindingOverrides = activeOverrides,
): KeyAction | null {
  if (e.target instanceof HTMLElement) {
    const tag = e.target.tagName;
    if (
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      e.target.isContentEditable ||
      e.target.closest(".ProseMirror")
    ) {
      if (e.key === "Escape") return "escape";
      return null;
    }
  }

  const bindings = effectiveKeybindings(overrides);
  // Prefer more specific chords (with modifiers) before plain keys.
  const actions = Object.keys(bindings) as KeyAction[];
  const ranked = actions.flatMap((action) =>
    bindings[action].map((chord) => ({
      action,
      chord,
      score:
        (chord.mod || chord.ctrl || chord.meta ? 4 : 0) +
        (chord.alt ? 2 : 0) +
        (chord.shift ? 1 : 0),
    })),
  );
  ranked.sort((a, b) => b.score - a.score);
  for (const { action, chord } of ranked) {
    if (chordMatches(e, chord)) return action;
  }
  return null;
}
