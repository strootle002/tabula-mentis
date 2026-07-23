import { useState } from "react";
import { THEMES } from "./themes";
import { useAppStore } from "../store/appStore";
import { ALL_LAYOUTS } from "../mindmap/layoutCatalog";
import {
  DEFAULT_KEYBINDINGS,
  KEY_ACTION_LABELS,
  effectiveKeybindings,
  eventToChord,
  formatChord,
  type KeyAction,
  type KeyChord,
} from "../mindmap/keymap";

const EDITABLE_ACTIONS: KeyAction[] = [
  "add-child",
  "add-sibling",
  "edit",
  "delete",
  "toggle-collapse",
  "toggle-node-panel",
  "undo",
  "redo",
  "nav-left",
  "nav-right",
  "nav-up",
  "nav-down",
];

export function SettingsPanel() {
  const themeId = useAppStore((s) => s.themeId);
  const vaultSettings = useAppStore((s) => s.vaultSettings);
  const setTheme = useAppStore((s) => s.setTheme);
  const updateVaultSettings = useAppStore((s) => s.updateVaultSettings);
  const vaultPath = useAppStore((s) => s.vaultPath);
  const keybindings = useAppStore((s) => s.keybindings);
  const updateKeybindings = useAppStore((s) => s.updateKeybindings);
  const resetKeybindings = useAppStore((s) => s.resetKeybindings);
  const [capturing, setCapturing] = useState<KeyAction | null>(null);

  const defaults = vaultSettings.defaultNodeStyle;
  const layoutStyle = vaultSettings.defaultLayoutStyle ?? "right";
  const effective = effectiveKeybindings(keybindings);

  const onCapture = (action: KeyAction, e: React.KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const chord = eventToChord(e.nativeEvent);
    if (!chord) return;
    const next = { ...keybindings, [action]: [chord] };
    void updateKeybindings(next);
    setCapturing(null);
  };

  const chordLabel = (chords: KeyChord[]) =>
    chords.map((c) => formatChord(c)).join(" or ");

  return (
    <div className="settings-view">
      <h2 style={{ fontFamily: "var(--font-display)", marginTop: 0 }}>
        Settings
      </h2>
      <p className="hint">
        Layout defaults apply across the vault. Per-node colors still override
        defaults on the canvas. Use Style for the open map’s layout, and Themes
        for color schemes.
      </p>
      {vaultPath && (
        <p className="hint">
          Vault: <code>{vaultPath}</code>
        </p>
      )}

      <h3 style={{ fontFamily: "var(--font-display)" }}>Default mindmap layout</h3>
      <div className="settings-grid">
        {ALL_LAYOUTS.map((l) => (
          <button
            key={l.id}
            type="button"
            className={`theme-card ${layoutStyle === l.id ? "active" : ""}`}
            onClick={() =>
              void updateVaultSettings({ defaultLayoutStyle: l.id })
            }
          >
            <strong>{l.label}</strong>
          </button>
        ))}
      </div>

      <h3 style={{ fontFamily: "var(--font-display)", marginTop: "1.5rem" }}>
        Light themes
      </h3>
      <div className="settings-grid">
        {THEMES.filter((t) => t.group === "light").map((theme) => (
          <button
            key={theme.id}
            type="button"
            className={`theme-card ${themeId === theme.id ? "active" : ""}`}
            onClick={() => void setTheme(theme.id)}
          >
            <strong>{theme.name}</strong>
            <div className="theme-swatches">
              <span style={{ background: theme.vars["--bg"] }} />
              <span style={{ background: theme.vars["--accent"] }} />
              <span style={{ background: theme.vars["--canvas"] }} />
              <span style={{ background: theme.vars["--node-fill"] }} />
            </div>
          </button>
        ))}
      </div>

      <h3 style={{ fontFamily: "var(--font-display)", marginTop: "1.5rem" }}>
        Dark themes
      </h3>
      <div className="settings-grid">
        {THEMES.filter((t) => t.group === "dark").map((theme) => (
          <button
            key={theme.id}
            type="button"
            className={`theme-card ${themeId === theme.id ? "active" : ""}`}
            onClick={() => void setTheme(theme.id)}
          >
            <strong>{theme.name}</strong>
            <div className="theme-swatches">
              <span style={{ background: theme.vars["--bg"] }} />
              <span style={{ background: theme.vars["--accent"] }} />
              <span style={{ background: theme.vars["--canvas"] }} />
              <span style={{ background: theme.vars["--node-fill"] }} />
            </div>
          </button>
        ))}
      </div>

      <h3 style={{ fontFamily: "var(--font-display)", marginTop: "1.5rem" }}>
        Default node style
      </h3>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
          gap: "0.75rem",
          maxWidth: 640,
        }}
      >
        <div className="field">
          <label>Fill</label>
          <input
            type="color"
            value={defaults.fill ?? "#f4f1ea"}
            onChange={(e) =>
              void updateVaultSettings({
                defaultNodeStyle: { ...defaults, fill: e.target.value },
              })
            }
          />
        </div>
        <div className="field">
          <label>Stroke</label>
          <input
            type="color"
            value={defaults.stroke ?? "#5a5348"}
            onChange={(e) =>
              void updateVaultSettings({
                defaultNodeStyle: { ...defaults, stroke: e.target.value },
              })
            }
          />
        </div>
        <div className="field">
          <label>Text</label>
          <input
            type="color"
            value={defaults.textColor ?? "#3a342c"}
            onChange={(e) =>
              void updateVaultSettings({
                defaultNodeStyle: { ...defaults, textColor: e.target.value },
              })
            }
          />
        </div>
        <div className="field">
          <label>Font size</label>
          <input
            type="number"
            min={10}
            max={28}
            value={defaults.fontSize ?? 14}
            onChange={(e) =>
              void updateVaultSettings({
                defaultNodeStyle: {
                  ...defaults,
                  fontSize: Number(e.target.value),
                },
              })
            }
          />
        </div>
      </div>

      <h3 style={{ fontFamily: "var(--font-display)", marginTop: "1.5rem" }}>
        Keyboard shortcuts
      </h3>
      <p className="hint">
        Click a shortcut, then press the new key combination. Stored on this
        device (not in the vault). Defaults: Tab = child, Enter = sibling, F2 =
        edit.
      </p>
      <table className="shortcuts-table" style={{ maxWidth: 560 }}>
        <tbody>
          {EDITABLE_ACTIONS.map((action) => (
            <tr key={action}>
              <td>{KEY_ACTION_LABELS[action]}</td>
              <td>
                <button
                  type="button"
                  className={`ghost-btn ${capturing === action ? "active" : ""}`}
                  onClick={() =>
                    setCapturing((current) =>
                      current === action ? null : action,
                    )
                  }
                  onKeyDown={(e) => {
                    if (capturing === action) onCapture(action, e);
                  }}
                >
                  {capturing === action
                    ? "Press keys…"
                    : chordLabel(
                        effective[action] ?? DEFAULT_KEYBINDINGS[action],
                      )}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ marginTop: "0.75rem" }}>
        <button
          type="button"
          className="ghost-btn"
          onClick={() => void resetKeybindings()}
        >
          Reset shortcuts to defaults
        </button>
      </p>
    </div>
  );
}
