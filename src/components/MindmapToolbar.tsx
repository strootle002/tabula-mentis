import { useRef, type ReactNode } from "react";
import { useAppStore } from "../store/appStore";
import { mindMapToTable } from "../import-export/io";
import { findNodeInDoc } from "../mindmap/mapDoc";
import { ContextMenu, useContextMenu } from "./ContextMenu";
import {
  UndoIcon,
  RedoIcon,
  HistoryIcon,
  SiblingIcon,
  ChildIcon,
  FloatIcon,
  LinkIcon,
  CollapseAllIcon,
  ExpandAllIcon,
  FocusIcon,
  SnapIcon,
  GridIcon,
  OverviewIcon,
  ZoomInIcon,
  ZoomOutIcon,
  MoreIcon,
} from "./toolbarIcons";

type ToolBtnProps = {
  label: string;
  title?: string;
  disabled?: boolean;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
};

function ToolBtn({ label, title, disabled, active, onClick, children }: ToolBtnProps) {
  return (
    <button
      type="button"
      className={`ghost-btn toolbar-icon-btn ${active ? "is-active" : ""}`}
      disabled={disabled}
      onClick={onClick}
      title={title ?? label}
      aria-label={label}
    >
      {children}
    </button>
  );
}

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
  const expandOneLevelSelected = useAppStore(
    (s) => s.expandOneLevelSelected,
  );
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

  const moreMenu = useContextMenu();
  const moreBtnRef = useRef<HTMLButtonElement>(null);

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

  const openMoreMenu = () => {
    const rect = moreBtnRef.current?.getBoundingClientRect();
    moreMenu.openMenu(rect?.left ?? 0, (rect?.bottom ?? 0) + 4, [
      {
        label: "Copy subtree",
        disabled: !selectedNodeId,
        onClick: () =>
          void copySelectedSubtree().then((ok) => {
            if (ok) pushToast("Copied subtree", "success");
          }),
      },
      {
        label: "Paste subtree",
        onClick: () =>
          void pasteSubtreeFromClipboard().then((ok) => {
            if (ok) pushToast("Pasted subtree", "success");
          }),
      },
      { separator: true, label: "", onClick: () => {} },
      {
        label: "Collapse one level",
        onClick: collapseOneLevelSelected,
      },
      {
        label: "Expand one level",
        onClick: expandOneLevelSelected,
      },
      {
        label: "Reset layout",
        onClick: resetLayoutPositions,
      },
    ]);
  };

  return (
    <div className="map-toolbar">
      <div className="map-toolbar-group">
        <ToolBtn
          label="Undo"
          title="Undo (Ctrl+Z)"
          disabled={mapHistory.length === 0}
          onClick={undo}
        >
          <UndoIcon />
        </ToolBtn>
        <ToolBtn
          label="Redo"
          title="Redo (Ctrl+Shift+Z)"
          disabled={mapFuture.length === 0}
          onClick={redo}
        >
          <RedoIcon />
        </ToolBtn>
        <ToolBtn label="History" title="Map history" onClick={openHistory}>
          <HistoryIcon />
        </ToolBtn>
      </div>

      <div className="map-toolbar-group">
        <ToolBtn
          label="Add sibling"
          title="Add sibling (Enter)"
          onClick={addSiblingToSelected}
        >
          <SiblingIcon />
        </ToolBtn>
        <ToolBtn
          label="Add child"
          title="Add child (Tab)"
          onClick={addChildToSelected}
        >
          <ChildIcon />
        </ToolBtn>
        <ToolBtn
          label="Add floating node"
          title="Add a floating node (not attached to the tree)"
          onClick={addFloatingNode}
        >
          <FloatIcon />
        </ToolBtn>
        <ToolBtn
          label="Link node"
          title="Link selected node to another node"
          disabled={!selectedNodeId}
          onClick={() => selectedNodeId && beginLinkFrom(selectedNodeId)}
        >
          <LinkIcon />
        </ToolBtn>
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
          className="ghost-btn toolbar-icon-btn"
          disabled={!node}
          aria-label="Decrease font size"
          onClick={() =>
            updateSelectedStyle({ fontSize: Math.max(10, fontSize - 1) })
          }
        >
          −
        </button>
        <span className="hint">{fontSize}</span>
        <button
          type="button"
          className="ghost-btn toolbar-icon-btn"
          disabled={!node}
          aria-label="Increase font size"
          onClick={() =>
            updateSelectedStyle({ fontSize: Math.min(28, fontSize + 1) })
          }
        >
          +
        </button>
        <span className="hint" title="Scale">Size</span>
        <button
          type="button"
          className="ghost-btn toolbar-icon-btn"
          disabled={!node}
          aria-label="Decrease node size"
          onClick={() =>
            updateSelectedStyle({ scale: Math.max(0.7, +(scale - 0.1).toFixed(2)) })
          }
        >
          −
        </button>
        <span className="hint">{scale.toFixed(2)}</span>
        <button
          type="button"
          className="ghost-btn toolbar-icon-btn"
          disabled={!node}
          aria-label="Increase node size"
          onClick={() =>
            updateSelectedStyle({ scale: Math.min(2, +(scale + 0.1).toFixed(2)) })
          }
        >
          +
        </button>
      </div>

      <div className="map-toolbar-group">
        <ToolBtn label="Collapse all" onClick={collapseAllNodes}>
          <CollapseAllIcon />
        </ToolBtn>
        <ToolBtn label="Expand all" onClick={expandAllNodes}>
          <ExpandAllIcon />
        </ToolBtn>
        <ToolBtn
          label="Zoom out"
          onClick={() => setPanZoom(panX, panY, Math.max(0.35, zoom - 0.1))}
        >
          <ZoomOutIcon />
        </ToolBtn>
        <span className="hint">{Math.round(zoom * 100)}%</span>
        <ToolBtn
          label="Zoom in"
          onClick={() => setPanZoom(panX, panY, Math.min(2.5, zoom + 0.1))}
        >
          <ZoomInIcon />
        </ToolBtn>
        <ToolBtn
          label="Focus node"
          title="Center the selected node in view (F)"
          disabled={!selectedNodeId}
          onClick={focusSelectedNode}
        >
          <FocusIcon />
        </ToolBtn>
        <ToolBtn
          label="Snap to grid"
          title="Snap dragged nodes to a 20px grid (hold Shift to snap once)"
          active={snapToGrid}
          onClick={toggleSnapToGrid}
        >
          <SnapIcon />
        </ToolBtn>
        <ToolBtn
          label="Map overview"
          title={minimapVisible ? "Hide map overview" : "Show map overview"}
          active={minimapVisible}
          onClick={toggleMinimap}
        >
          <OverviewIcon />
        </ToolBtn>
        <ToolBtn label="Data grid" title="Open data grid" onClick={showGrid}>
          <GridIcon />
        </ToolBtn>
        <button
          ref={moreBtnRef}
          type="button"
          className="ghost-btn toolbar-icon-btn"
          onClick={openMoreMenu}
          title="More actions"
          aria-label="More actions"
        >
          <MoreIcon />
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

      {moreMenu.menu && (
        <ContextMenu
          x={moreMenu.menu.x}
          y={moreMenu.menu.y}
          items={moreMenu.menu.items}
          onClose={moreMenu.closeMenu}
        />
      )}
    </div>
  );
}

function normalize(value: string | undefined, fallback: string) {
  if (!value || !value.startsWith("#")) return fallback;
  return value;
}
