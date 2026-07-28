import { useAppStore } from "../store/appStore";
import { mindMapToTable } from "../import-export/io";
import { findNodeInDoc } from "../mindmap/mapDoc";

export function MindmapToolbar() {
  const activeMap = useAppStore((s) => s.activeMap);
  const selectedNodeId = useAppStore((s) => s.selectedNodeId);
  const nodePanelOpen = useAppStore((s) => s.nodePanelOpen);
  const toggleNodePanel = useAppStore((s) => s.toggleNodePanel);
  const collapseAllNodes = useAppStore((s) => s.collapseAllNodes);
  const expandAllNodes = useAppStore((s) => s.expandAllNodes);
  const collapseOneLevelSelected = useAppStore(
    (s) => s.collapseOneLevelSelected,
  );
  const expandOneLevelSelected = useAppStore((s) => s.expandOneLevelSelected);
  const updateSelectedStyle = useAppStore((s) => s.updateSelectedStyle);
  const addChildToSelected = useAppStore((s) => s.addChildToSelected);
  const addSiblingToSelected = useAppStore((s) => s.addSiblingToSelected);
  const addFloatingNode = useAppStore((s) => s.addFloatingNode);
  const beginLinkFrom = useAppStore((s) => s.beginLinkFrom);
  const openDataGrid = useAppStore((s) => s.openDataGrid);
  const resetLayoutPositions = useAppStore((s) => s.resetLayoutPositions);
  const undo = useAppStore((s) => s.undo);
  const redo = useAppStore((s) => s.redo);
  const openHistory = useAppStore((s) => s.openHistory);
  const mapHistory = useAppStore((s) => s.mapHistory);
  const mapFuture = useAppStore((s) => s.mapFuture);
  const zoom = useAppStore((s) => s.zoom);
  const panX = useAppStore((s) => s.panX);
  const panY = useAppStore((s) => s.panY);
  const setPanZoom = useAppStore((s) => s.setPanZoom);
  const minimapVisible = useAppStore((s) => s.minimapVisible);
  const toggleMinimap = useAppStore((s) => s.toggleMinimap);
  const focusSelectedNode = useAppStore((s) => s.focusSelectedNode);
  const snapToGrid = useAppStore((s) => s.snapToGrid);
  const toggleSnapToGrid = useAppStore((s) => s.toggleSnapToGrid);
  const copySelectedSubtree = useAppStore((s) => s.copySelectedSubtree);
  const pasteSubtreeFromClipboard = useAppStore(
    (s) => s.pasteSubtreeFromClipboard,
  );
  const pushToast = useAppStore((s) => s.pushToast);

  if (!activeMap) return null;

  const node = selectedNodeId
    ? findNodeInDoc(activeMap, selectedNodeId)
    : null;
  const style = node?.style ?? {};
  const fontSize = style.fontSize ?? 14;
  const scale = style.scale ?? 1;

  const showGrid = () => {
    const { headers, rows } = mindMapToTable(activeMap);
    openDataGrid(activeMap.title, headers, rows);
  };

  return (
    <div className="map-toolbar">
      <div className="map-toolbar-group">
        <button
          type="button"
          className="ghost-btn"
          disabled={mapHistory.length === 0}
          onClick={undo}
          title="Undo (Ctrl+Z)"
        >
          Undo
        </button>
        <button
          type="button"
          className="ghost-btn"
          disabled={mapFuture.length === 0}
          onClick={redo}
          title="Redo (Ctrl+Shift+Z)"
        >
          Redo
        </button>
        <button type="button" className="ghost-btn" onClick={openHistory}>
          History
        </button>
      </div>
      <div className="map-toolbar-group">
        <button
          type="button"
          className="ghost-btn"
          onClick={collapseAllNodes}
          title="Collapse all"
        >
          Collapse
        </button>
        <button
          type="button"
          className="ghost-btn"
          onClick={expandAllNodes}
          title="Expand all"
        >
          Expand
        </button>
        <button
          type="button"
          className="ghost-btn"
          onClick={collapseOneLevelSelected}
          title="Collapse one level"
        >
          − Level
        </button>
        <button
          type="button"
          className="ghost-btn"
          onClick={expandOneLevelSelected}
          title="Expand one level"
        >
          + Level
        </button>
        <button
          type="button"
          className="ghost-btn"
          onClick={resetLayoutPositions}
          title="Clear positions and radial arms; restore automatic layout"
        >
          Reset
        </button>
      </div>

      <div className="map-toolbar-group">
        <button
          type="button"
          className="ghost-btn"
          onClick={addSiblingToSelected}
          title="Add sibling (Enter)"
        >
          + Sib
        </button>
        <button
          type="button"
          className="ghost-btn"
          onClick={addChildToSelected}
          title="Add child (Tab)"
        >
          + Child
        </button>
        <button
          type="button"
          className="ghost-btn"
          onClick={addFloatingNode}
          title="Add a floating node (not attached to the tree)"
        >
          + Float
        </button>
        <button
          type="button"
          className="ghost-btn"
          disabled={!selectedNodeId}
          onClick={() => selectedNodeId && beginLinkFrom(selectedNodeId)}
          title="Link selected node to another node"
        >
          Link
        </button>
      </div>

      <div className="map-toolbar-group">
        <label className="toolbar-color" title="Fill">
          <span>Fill</span>
          <input
            type="color"
            value={normalize(style.fill, "#f4f1ea")}
            disabled={!node}
            onChange={(e) => updateSelectedStyle({ fill: e.target.value })}
          />
        </label>
        <label className="toolbar-color" title="Stroke">
          <span>Line</span>
          <input
            type="color"
            value={normalize(style.stroke, "#5a5348")}
            disabled={!node}
            onChange={(e) => updateSelectedStyle({ stroke: e.target.value })}
          />
        </label>
        <label className="toolbar-color" title="Text">
          <span>Text</span>
          <input
            type="color"
            value={normalize(style.textColor, "#3a342c")}
            disabled={!node}
            onChange={(e) => updateSelectedStyle({ textColor: e.target.value })}
          />
        </label>
      </div>

      <div className="map-toolbar-group toolbar-stepper-group">
        <span className="hint" title="Font size">Aa</span>
        <button
          type="button"
          className="ghost-btn"
          disabled={!node}
          onClick={() =>
            updateSelectedStyle({ fontSize: Math.max(10, fontSize - 1) })
          }
        >
          −
        </button>
        <span className="hint">{fontSize}</span>
        <button
          type="button"
          className="ghost-btn"
          disabled={!node}
          onClick={() =>
            updateSelectedStyle({ fontSize: Math.min(28, fontSize + 1) })
          }
        >
          +
        </button>
        <span className="hint" title="Scale">Size</span>
        <button
          type="button"
          className="ghost-btn"
          disabled={!node}
          onClick={() =>
            updateSelectedStyle({ scale: Math.max(0.7, +(scale - 0.1).toFixed(2)) })
          }
        >
          −
        </button>
        <span className="hint">{scale.toFixed(2)}</span>
        <button
          type="button"
          className="ghost-btn"
          disabled={!node}
          onClick={() =>
            updateSelectedStyle({ scale: Math.min(2, +(scale + 0.1).toFixed(2)) })
          }
        >
          +
        </button>
      </div>

      <div className="map-toolbar-group">
        <button
          type="button"
          className="ghost-btn"
          disabled={!selectedNodeId}
          onClick={focusSelectedNode}
          title="Center the selected node in view (F)"
        >
          Focus
        </button>
        <button
          type="button"
          className="ghost-btn"
          disabled={!selectedNodeId}
          onClick={() =>
            void copySelectedSubtree().then((ok) => {
              if (ok) pushToast("Copied subtree", "success");
            })
          }
          title="Copy selected node + subtree (Ctrl+C)"
        >
          Copy
        </button>
        <button
          type="button"
          className="ghost-btn"
          onClick={() =>
            void pasteSubtreeFromClipboard().then((ok) => {
              if (ok) pushToast("Pasted subtree", "success");
            })
          }
          title="Paste subtree as child of selected node (Ctrl+V)"
        >
          Paste
        </button>
        <button
          type="button"
          className={`ghost-btn ${snapToGrid ? "is-active" : ""}`}
          onClick={toggleSnapToGrid}
          title="Snap dragged nodes to a 20px grid (hold Shift to snap once)"
        >
          Snap
        </button>
      </div>

      <div className="map-toolbar-group">
        <button
          type="button"
          className="ghost-btn"
          onClick={() => setPanZoom(panX, panY, Math.max(0.35, zoom - 0.1))}
        >
          −
        </button>
        <span className="hint">{Math.round(zoom * 100)}%</span>
        <button
          type="button"
          className="ghost-btn"
          onClick={() => setPanZoom(panX, panY, Math.min(2.5, zoom + 0.1))}
        >
          +
        </button>
        <button
          type="button"
          className="ghost-btn"
          onClick={showGrid}
          title="Open data grid"
        >
          Grid
        </button>
        <button
          type="button"
          className={`ghost-btn ${minimapVisible ? "is-active" : ""}`}
          onClick={toggleMinimap}
          title={minimapVisible ? "Hide map overview" : "Show map overview"}
        >
          Overview
        </button>
      </div>

      <div className="map-toolbar-group map-toolbar-panel-toggle">
        <button
          type="button"
          className={`panel-toggle-btn ${nodePanelOpen ? "is-open" : ""}`}
          onClick={toggleNodePanel}
          title={
            nodePanelOpen
              ? "Hide the right node panel (Ctrl+N)"
              : "Show the right node panel (Ctrl+N)"
          }
        >
          {nodePanelOpen ? "Hide panel ›" : "‹ Show panel"}
        </button>
      </div>
    </div>
  );
}

function normalize(value: string | undefined, fallback: string) {
  if (!value || !value.startsWith("#")) return fallback;
  return value;
}
