import { useAppStore } from "../store/appStore";
import { useAccessibleDialog } from "./useAccessibleDialog";
import {
  DEFAULT_KEYBINDINGS,
  KEY_ACTION_LABELS,
  effectiveKeybindings,
  formatChord,
  type KeyAction,
} from "../mindmap/keymap";

const MIND_ACTIONS: KeyAction[] = [
  "nav-left",
  "nav-right",
  "nav-up",
  "nav-down",
  "add-child",
  "add-sibling",
  "edit",
  "toggle-collapse",
  "toggle-node-panel",
  "delete",
  "escape",
  "undo",
  "redo",
];

export function ShortcutsModal() {
  const open = useAppStore((s) => s.shortcutsOpen);
  const setShortcutsOpen = useAppStore((s) => s.setShortcutsOpen);
  const keybindings = useAppStore((s) => s.keybindings);
  const close = () => setShortcutsOpen(false);
  const { dialogProps, titleId } = useAccessibleDialog(open, close);
  const bindings = effectiveKeybindings(keybindings);
  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={close}>
      <div
        {...dialogProps}
        className="modal modal-wide shortcuts-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId}>Keyboard shortcuts</h2>
        <p className="hint">
          On Mac, use ⌘ in place of Ctrl where shown. Customize bindings in
          Settings.
        </p>
        <div className="shortcuts-sections">
          <section className="shortcuts-section">
            <h3>Map</h3>
            <table className="shortcuts-table">
              <tbody>
                {MIND_ACTIONS.map((action) => (
                  <tr key={action}>
                    <td>
                      <kbd>
                        {(bindings[action] ?? DEFAULT_KEYBINDINGS[action])
                          .map((c) => formatChord(c))
                          .join(" / ")}
                      </kbd>
                    </td>
                    <td>{KEY_ACTION_LABELS[action]}</td>
                  </tr>
                ))}
                <tr>
                  <td>
                    <kbd>F2 / Double-click</kbd>
                  </td>
                  <td>Edit selected node text</td>
                </tr>
                <tr>
                  <td>
                    <kbd>Shift+Enter</kbd>
                  </td>
                  <td>New line while editing node text</td>
                </tr>
              </tbody>
            </table>
          </section>
          <section className="shortcuts-section">
            <h3>Canvas</h3>
            <table className="shortcuts-table">
              <tbody>
                <tr>
                  <td>
                    <kbd>Scroll</kbd>
                  </td>
                  <td>Pan vertically</td>
                </tr>
                <tr>
                  <td>
                    <kbd>Shift+Scroll</kbd>
                  </td>
                  <td>Pan horizontally</td>
                </tr>
                <tr>
                  <td>
                    <kbd>Ctrl+Scroll</kbd>
                  </td>
                  <td>Zoom</td>
                </tr>
                <tr>
                  <td>
                    <kbd>Alt+Scroll</kbd>
                  </td>
                  <td>Collapse (up) / expand (down) one level</td>
                </tr>
                <tr>
                  <td>
                    <kbd>Drag node</kbd>
                  </td>
                  <td>Move node (drop on another to reparent)</td>
                </tr>
                <tr>
                  <td>
                    <kbd>Drag empty canvas</kbd>
                  </td>
                  <td>Pan the map</td>
                </tr>
              </tbody>
            </table>
          </section>
        </div>
        <div className="modal-actions">
          <button
            type="button"
            className="primary-btn"
            onClick={close}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
