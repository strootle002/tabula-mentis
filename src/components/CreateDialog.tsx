import { useEffect, useRef, useState } from "react";
import { useAppStore } from "../store/appStore";
import type { MapLayoutStyle } from "../mindmap/types";
import { ALL_LAYOUTS } from "../mindmap/layoutCatalog";
import { useAccessibleDialog } from "./useAccessibleDialog";

export function CreateDialog() {
  const createDialog = useAppStore((s) => s.createDialog);
  const closeCreateDialog = useAppStore((s) => s.closeCreateDialog);
  const openCreateDialog = useAppStore((s) => s.openCreateDialog);
  const createMap = useAppStore((s) => s.createMap);
  const createNote = useAppStore((s) => s.createNote);
  const createFolder = useAppStore((s) => s.createFolder);
  const noteFolders = useAppStore((s) => s.noteFolders);
  const mapFolders = useAppStore((s) => s.mapFolders);

  const [title, setTitle] = useState("");
  const [layout, setLayout] = useState<MapLayoutStyle>("right");
  const [folder, setFolder] = useState("");
  const titleInputRef = useRef<HTMLInputElement>(null);
  const { dialogProps, titleId } = useAccessibleDialog(
    !!createDialog,
    closeCreateDialog,
    titleInputRef,
  );

  useEffect(() => {
    if (!createDialog) return;
    setTitle(
      createDialog.kind === "map"
        ? "Untitled Map"
        : createDialog.kind === "note"
          ? "Untitled Note"
          : createDialog.kind === "folder"
            ? "Projects"
            : "",
    );
    setLayout("right");
    setFolder("");
  }, [createDialog]);

  if (!createDialog) return null;

  const kind = createDialog.kind;
  const folderOptions = [
    ...new Set([...mapFolders, ...noteFolders]),
  ].sort((a, b) => a.localeCompare(b));

  if (kind === "choose") {
    return (
      <div className="modal-backdrop" onClick={closeCreateDialog}>
        <div
          {...dialogProps}
          className="modal create-dialog"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 id={titleId}>Create new</h2>
          <p className="hint">What would you like to add to your library?</p>
          <div className="create-choice-grid">
            <button
              type="button"
              className="create-choice map"
              onClick={() => openCreateDialog("map")}
            >
              <span className="entry-badge map">Map</span>
              <strong>Map</strong>
              <span className="hint">Visual tree of ideas</span>
            </button>
            <button
              type="button"
              className="create-choice note"
              onClick={() => openCreateDialog("note")}
            >
              <span className="entry-badge note">Note</span>
              <strong>Note</strong>
              <span className="hint">Longform writing with links</span>
            </button>
          </div>
          <div className="modal-actions">
            <button
              type="button"
              className="ghost-btn"
              onClick={closeCreateDialog}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  const heading =
    kind === "map"
      ? "New mindmap"
      : kind === "note"
        ? "New note"
        : "New folder";

  const submit = () => {
    if (kind === "map")
      void createMap(title.trim() || "Untitled Map", layout, folder.trim());
    else if (kind === "note")
      void createNote(title.trim() || "Untitled Note", folder.trim());
    else void createFolder(title.trim());
  };

  return (
    <div className="modal-backdrop" onClick={closeCreateDialog}>
      <div
        {...dialogProps}
        className="modal create-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId}>{heading}</h2>
        <div className="field">
          <label htmlFor="create-title">
            {kind === "folder" ? "Folder path" : "Title"}
          </label>
          <input
            ref={titleInputRef}
            id="create-title"
            value={title}
            placeholder={
              kind === "folder" ? "Projects/Ideas" : "Give it a name"
            }
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
          />
        </div>

        {kind === "map" && (
          <div className="field">
            <label>Layout style</label>
            <div className="create-layout-grid">
              {ALL_LAYOUTS.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  className={`theme-card ${layout === l.id ? "active" : ""}`}
                  onClick={() => setLayout(l.id)}
                >
                  <strong>{l.label}</strong>
                </button>
              ))}
            </div>
          </div>
        )}

        {(kind === "map" || kind === "note") && (
          <div className="field">
            <label htmlFor="create-folder">Folder (optional)</label>
            <input
              id="create-folder"
              list="folder-options"
              value={folder}
              placeholder="e.g. Projects/Research"
              onChange={(e) => setFolder(e.target.value)}
            />
            <datalist id="folder-options">
              {folderOptions.map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
          </div>
        )}

        {kind === "folder" && (
          <p className="hint">
            Creates a shared library folder for both maps and notes. Nested
            paths like Projects/Ideas are supported.
          </p>
        )}

        <div className="modal-actions">
          <button
            type="button"
            className="ghost-btn"
            onClick={closeCreateDialog}
          >
            Cancel
          </button>
          <button type="button" className="primary-btn" onClick={submit}>
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
