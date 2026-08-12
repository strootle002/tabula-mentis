import { lazy, Suspense } from "react";
import { useAppStore } from "../store/appStore";
import {
  layoutLabel,
  FLOW_DIRS,
  normalizeLayoutStyle,
} from "../mindmap/layoutCatalog";

const MindmapCanvas = lazy(() =>
  import("../mindmap/MindmapCanvas").then((module) => ({
    default: module.MindmapCanvas,
  })),
);
const NodePanel = lazy(() =>
  import("../mindmap/NodePanel").then((module) => ({
    default: module.NodePanel,
  })),
);
const NoteEditor = lazy(() =>
  import("../notes/NoteEditor").then((module) => ({
    default: module.NoteEditor,
  })),
);
const TagPage = lazy(() =>
  import("../notes/TagPage").then((module) => ({ default: module.TagPage })),
);
const SettingsPanel = lazy(() =>
  import("../settings/SettingsPanel").then((module) => ({
    default: module.SettingsPanel,
  })),
);
const HistoryPage = lazy(() =>
  import("../history/HistoryPage").then((module) => ({
    default: module.HistoryPage,
  })),
);
const MindmapToolbar = lazy(() =>
  import("./MindmapToolbar").then((module) => ({
    default: module.MindmapToolbar,
  })),
);
const DataGridView = lazy(() =>
  import("./DataGridView").then((module) => ({
    default: module.DataGridView,
  })),
);

export function MainView() {
  const view = useAppStore((s) => s.view);
  const activeMap = useAppStore((s) => s.activeMap);
  const activeNoteName = useAppStore((s) => s.activeNoteName);
  const activeTag = useAppStore((s) => s.activeTag);
  const dirtyMap = useAppStore((s) => s.dirtyMap);
  const dirtyNote = useAppStore((s) => s.dirtyNote);
  const dirtyTagNote = useAppStore((s) => s.dirtyTagNote);
  const nodePanelOpen = useAppStore((s) => s.nodePanelOpen);
  const presentationMode = useAppStore((s) => s.presentationMode);
  const setFlowDir = useAppStore((s) => s.setFlowDir);
  const vaultSettings = useAppStore((s) => s.vaultSettings);

  const title =
    view === "map"
      ? activeMap?.title ?? "Map"
      : view === "note"
        ? (activeNoteName ?? "Note")
        : view === "tag"
          ? `#${activeTag}`
          : view === "data"
            ? "Data grid"
            : view === "history"
              ? "Edit history"
              : view === "settings"
                ? "Settings"
                : "Welcome";

  const mapStyle = normalizeLayoutStyle(
    activeMap?.layoutStyle ?? vaultSettings.defaultLayoutStyle ?? "right",
  );
  const flowDir = activeMap?.flowDir ?? "down";

  return (
    <div className={`main${presentationMode ? " is-presenting" : ""}`}>
      {!presentationMode && (
        <div className="toolbar">
          <h2>
            {title}
            {((view === "map" && dirtyMap) ||
              (view === "note" && dirtyNote) ||
              (view === "tag" && dirtyTagNote)) && (
              <span className="unsaved-pill">Unsaved</span>
            )}
          </h2>
        </div>
      )}

      {!presentationMode && view === "map" && activeMap && (
        <div className="map-mode-bar">
          <span className="map-mode-badge">
            {layoutLabel(mapStyle, activeMap.flowDir)}
          </span>
          {mapStyle === "flowchart" && (
            <div
              className="map-mode-flowdirs"
              role="group"
              aria-label="Flow direction"
            >
              {FLOW_DIRS.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className={`ghost-btn map-mode-chip ${flowDir === d.id ? "active" : ""}`}
                  onClick={() => setFlowDir(d.id)}
                >
                  {d.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <Suspense fallback={<div className="empty-state"><p>Loading view…</p></div>}>
        {!presentationMode && view === "map" && <MindmapToolbar />}

        {view === "map" && (
          <div
            className={`content-row ${presentationMode || !nodePanelOpen ? "full" : ""}`}
          >
            <MindmapCanvas />
            {!presentationMode && nodePanelOpen && <NodePanel />}
          </div>
        )}
        {view === "note" && <NoteEditor />}
        {view === "tag" && <TagPage />}
        {view === "data" && <DataGridView />}
        {view === "history" && <HistoryPage />}
        {view === "settings" && <SettingsPanel />}
      </Suspense>
      {view === "welcome" && (
        <div className="empty-state">
          <div>
            <h2>Your vault is ready</h2>
            <p>Open a map or note from the sidebar to get started.</p>
          </div>
        </div>
      )}
    </div>
  );
}
