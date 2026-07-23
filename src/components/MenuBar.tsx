import { useEffect, useRef, useState } from "react";
import { writeFile } from "@tauri-apps/plugin-fs";
import { save } from "@tauri-apps/plugin-dialog";
import { useAppStore } from "../store/appStore";
import { THEMES } from "../settings/themes";
import { DIAGRAM_LAYOUTS, TREE_LAYOUTS } from "../mindmap/layoutCatalog";
import { resolveLayout } from "../mindmap/layout";
import { normalizeLayoutStyle } from "../mindmap/layoutCatalog";
import {
  downloadBlob,
  exportMapToCsv,
  mindMapToTable,
} from "../import-export/io";
import {
  exportLayoutToPng,
  exportThemeColors,
} from "../import-export/exportPng";
import {
  previewOrphanImages,
  removeOrphanImages,
} from "../vault/orphanImages";
import { OPEN_SEARCH_EVENT } from "../search/SearchPalette";
import { exportFreeplane, exportOpml } from "../import-export/xmlInterchange";

type MenuKey =
  | "file"
  | "edit"
  | "view"
  | "style"
  | "theme"
  | "settings"
  | "about"
  | null;

export function MenuBar() {
  const [open, setOpen] = useState<MenuKey>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const openCreateDialog = useAppStore((s) => s.openCreateDialog);
  const setImportOpen = useAppStore((s) => s.setImportOpen);
  const openVault = useAppStore((s) => s.openVault);
  const openSettings = useAppStore((s) => s.openSettings);
  const openAbout = useAppStore((s) => s.openAbout);
  const openShortcuts = useAppStore((s) => s.openShortcuts);
  const addChildToSelected = useAppStore((s) => s.addChildToSelected);
  const addSiblingToSelected = useAppStore((s) => s.addSiblingToSelected);
  const deleteSelected = useAppStore((s) => s.deleteSelected);
  const setEditingNode = useAppStore((s) => s.setEditingNode);
  const selectedNodeId = useAppStore((s) => s.selectedNodeId);
  const toggleCollapseSelected = useAppStore((s) => s.toggleCollapseSelected);
  const setMapLayoutStyle = useAppStore((s) => s.setMapLayoutStyle);
  const setTheme = useAppStore((s) => s.setTheme);
  const themeId = useAppStore((s) => s.themeId);
  const activeMap = useAppStore((s) => s.activeMap);
  const vaultSettings = useAppStore((s) => s.vaultSettings);
  const view = useAppStore((s) => s.view);
  const toggleNodePanel = useAppStore((s) => s.toggleNodePanel);
  const toggleNoteAside = useAppStore((s) => s.toggleNoteAside);
  const undo = useAppStore((s) => s.undo);
  const redo = useAppStore((s) => s.redo);
  const openHistory = useAppStore((s) => s.openHistory);
  const mapHistory = useAppStore((s) => s.mapHistory);
  const mapFuture = useAppStore((s) => s.mapFuture);
  const openDataGrid = useAppStore((s) => s.openDataGrid);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed);
  const vaultPath = useAppStore((s) => s.vaultPath);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!barRef.current?.contains(e.target as Node)) setOpen(null);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, []);

  const runExport = async (format: string, operation: () => Promise<void>) => {
    try {
      await operation();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      useAppStore.setState({ error: `${format} export failed: ${message}` });
    }
  };

  const exportJson = () => runExport("JSON", async () => {
    if (!activeMap) return;
    const path = await save({
      defaultPath: `${activeMap.title || "map"}.json`,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    const payload = JSON.stringify(activeMap, null, 2);
    if (path) await writeFile(path, new TextEncoder().encode(payload));
    else {
      downloadBlob(
        new Blob([payload], { type: "application/json" }),
        `${activeMap.title || "map"}.json`,
      );
    }
  });

  const exportCsv = () => runExport("CSV", async () => {
    if (!activeMap) return;
    const csv = exportMapToCsv(activeMap);
    const path = await save({
      defaultPath: `${activeMap.title || "map"}.csv`,
      filters: [{ name: "CSV", extensions: ["csv"] }],
    });
    if (path) await writeFile(path, new TextEncoder().encode(csv));
    else {
      downloadBlob(
        new Blob([csv], { type: "text/csv" }),
        `${activeMap.title || "map"}.csv`,
      );
    }
  });

  const exportXml = (
    format: "Freeplane" | "OPML",
    extension: "mm" | "opml",
    serialize: typeof exportFreeplane,
  ) => runExport(format, async () => {
    if (!activeMap) return;
    const payload = serialize(activeMap);
    const path = await save({
      defaultPath: `${activeMap.title || "map"}.${extension}`,
      filters: [{ name: format, extensions: [extension] }],
    });
    if (path) await writeFile(path, new TextEncoder().encode(payload));
    else {
      downloadBlob(
        new Blob([payload], { type: "application/xml" }),
        `${activeMap.title || "map"}.${extension}`,
      );
    }
  });

  const showDataGrid = () => {
    if (!activeMap) return;
    const { headers, rows } = mindMapToTable(activeMap);
    openDataGrid(activeMap.title, headers, rows);
  };

  const exportPng = () => runExport("PNG", async () => {
    if (!activeMap) return;
    const layoutStyle = normalizeLayoutStyle(
      activeMap.layoutStyle ?? vaultSettings.defaultLayoutStyle ?? "right",
    );
    const layout = resolveLayout(
      activeMap.root,
      vaultSettings.defaultNodeStyle,
      layoutStyle,
      activeMap.positions,
      null,
      activeMap.radialDirs,
      activeMap.floatingNodes,
      activeMap.links,
      activeMap.flowDir,
    );
    // Draw via Canvas2D from layout geometry — SVG→Image crashes WebKitGTK.
    const blob = await exportLayoutToPng(layout, {
      layoutStyle,
      flowDir: activeMap.flowDir,
      colors: exportThemeColors(),
      vaultPath,
    });
    const path = await save({
      defaultPath: `${activeMap.title || "map"}.png`,
      filters: [{ name: "PNG", extensions: ["png"] }],
    });
    if (path) await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
    else downloadBlob(blob, `${activeMap.title || "map"}.png`);
  });

  const cleanupOrphanImages = async () => {
    if (!vaultPath) return;
    try {
      const preview = await previewOrphanImages(vaultPath);
      if (preview.uncertain) {
        window.alert(
          "Cleanup was cancelled because at least one Markdown image reference could not be parsed. Fix that image markup and try again.",
        );
        return;
      }
      if (preview.orphanPaths.length === 0) {
        window.alert("No unused app-managed images were found.");
        return;
      }
      const confirmed = window.confirm(
        `Delete ${preview.orphanPaths.length} unused app-managed image${preview.orphanPaths.length === 1 ? "" : "s"}?\n\nImported source files and other files in assets are never included.`,
      );
      if (!confirmed) return;
      const removed = await removeOrphanImages(vaultPath);
      window.alert(`Removed ${removed} unused image${removed === 1 ? "" : "s"}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      useAppStore.setState({ error: `Image cleanup failed: ${message}` });
    }
  };

  const layoutStyle = activeMap?.layoutStyle ?? "right";

  return (
    <div className="menu-bar" ref={barRef}>
      <MenuDropdown
        label="File"
        open={open === "file"}
        onOpen={() => setOpen(open === "file" ? null : "file")}
        items={[
          {
            label: "New mindmap",
            onClick: () => openCreateDialog("map"),
          },
          {
            label: "New note",
            onClick: () => openCreateDialog("note"),
          },
          {
            label: "New…",
            onClick: () => openCreateDialog("choose"),
          },
          { separator: true, label: "", onClick: () => undefined },
          { label: "Import…", onClick: () => setImportOpen(true) },
          {
            label: "Export CSV",
            onClick: () => void exportCsv(),
            disabled: !activeMap,
          },
          {
            label: "Export JSON",
            onClick: () => void exportJson(),
            disabled: !activeMap,
          },
          {
            label: "Export Freeplane (.mm)",
            onClick: () => void exportXml("Freeplane", "mm", exportFreeplane),
            disabled: !activeMap,
          },
          {
            label: "Export OPML",
            onClick: () => void exportXml("OPML", "opml", exportOpml),
            disabled: !activeMap,
          },
          {
            label: "Export PNG",
            onClick: () => void exportPng(),
            disabled: view !== "map" || !activeMap,
          },
          {
            label: "Open data grid…",
            onClick: showDataGrid,
            disabled: !activeMap,
          },
          { separator: true, label: "", onClick: () => undefined },
          {
            label: "Clean up unused images…",
            onClick: () => void cleanupOrphanImages(),
            disabled: !vaultPath,
          },
          { label: "Switch vault…", onClick: () => void openVault() },
        ]}
      />
      <MenuDropdown
        label="Edit"
        open={open === "edit"}
        onOpen={() => setOpen(open === "edit" ? null : "edit")}
        items={[
          {
            label: "Undo (Ctrl+Z)",
            onClick: undo,
            disabled: !activeMap || mapHistory.length === 0,
          },
          {
            label: "Redo (Ctrl+Shift+Z)",
            onClick: redo,
            disabled: !activeMap || mapFuture.length === 0,
          },
          {
            label: "Edit history…",
            onClick: openHistory,
            disabled: !activeMap,
          },
          { separator: true, label: "", onClick: () => undefined },
          {
            label: "Add child (Ctrl+T)",
            onClick: addChildToSelected,
            disabled: view !== "map",
          },
          {
            label: "Add sibling (Ctrl+Enter)",
            onClick: addSiblingToSelected,
            disabled: view !== "map",
          },
          {
            label: "Edit node (F2)",
            onClick: () => selectedNodeId && setEditingNode(selectedNodeId),
            disabled: view !== "map" || !selectedNodeId,
          },
          {
            label: "Collapse / expand (Space)",
            onClick: toggleCollapseSelected,
            disabled: view !== "map",
          },
          {
            label: "Delete node",
            onClick: deleteSelected,
            disabled: view !== "map",
            danger: true,
          },
          { separator: true, label: "", onClick: () => undefined },
          {
            label: "Toggle node panel (Ctrl+N)",
            onClick: toggleNodePanel,
            disabled: view !== "map",
          },
          {
            label: "Toggle note panel",
            onClick: toggleNoteAside,
            disabled: view !== "note",
          },
        ]}
      />
      <MenuDropdown
        label="View"
        open={open === "view"}
        onOpen={() => setOpen(open === "view" ? null : "view")}
        items={[
          {
            label: "Search vault… (Ctrl+K)",
            onClick: () => window.dispatchEvent(new Event(OPEN_SEARCH_EVENT)),
          },
          { separator: true, label: "", onClick: () => undefined },
          {
            label: sidebarCollapsed
              ? "Show navigation"
              : "Hide navigation",
            onClick: toggleSidebar,
          },
          {
            label: "Toggle node panel (Ctrl+N)",
            onClick: toggleNodePanel,
            disabled: view !== "map",
          },
          {
            label: "Toggle note panel",
            onClick: toggleNoteAside,
            disabled: view !== "note",
          },
        ]}
      />
      <MenuDropdown
        label="Style"
        open={open === "style"}
        onOpen={() => setOpen(open === "style" ? null : "style")}
        items={[
          ...TREE_LAYOUTS.map((l) => ({
            label: `${layoutStyle === l.id ? "✓ " : ""}${l.label}`,
            onClick: () => setMapLayoutStyle(l.id),
            disabled: view !== "map",
          })),
          { separator: true, label: "", onClick: () => undefined },
          {
            label: "Diagrams",
            onClick: () => undefined,
            disabled: true,
          },
          ...DIAGRAM_LAYOUTS.map((l) => ({
            label: `${layoutStyle === l.id ? "✓ " : ""}${l.label}`,
            onClick: () => setMapLayoutStyle(l.id),
            disabled: view !== "map",
          })),
        ]}
      />
      <MenuDropdown
        label="Themes"
        open={open === "theme"}
        onOpen={() => setOpen(open === "theme" ? null : "theme")}
        items={[
          ...THEMES.filter((t) => t.group === "light").map((t) => ({
            label: `${themeId === t.id ? "✓ " : ""}${t.name}`,
            onClick: () => void setTheme(t.id),
          })),
          { separator: true, label: "", onClick: () => undefined },
          ...THEMES.filter((t) => t.group === "dark").map((t) => ({
            label: `${themeId === t.id ? "✓ " : ""}${t.name}`,
            onClick: () => void setTheme(t.id),
          })),
        ]}
      />
      <MenuDropdown
        label="Settings"
        open={open === "settings"}
        onOpen={() => setOpen(open === "settings" ? null : "settings")}
        items={[
          {
            label: "Preferences…",
            onClick: openSettings,
          },
          {
            label: "Keyboard shortcuts…",
            onClick: openShortcuts,
          },
        ]}
      />
      <button
        type="button"
        className="menu-bar-btn"
        onClick={() => {
          setOpen(null);
          openAbout();
        }}
      >
        About
      </button>
    </div>
  );
}

function MenuDropdown({
  label,
  open,
  onOpen,
  items,
}: {
  label: string;
  open: boolean;
  onOpen: () => void;
  items: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
    danger?: boolean;
    separator?: boolean;
  }[];
}) {
  return (
    <div className="menu-dropdown">
      <button
        type="button"
        className={`menu-bar-btn ${open ? "open" : ""}`}
        onClick={onOpen}
      >
        {label}
      </button>
      {open && (
        <div className="menu-dropdown-panel">
          {items.map((item, i) =>
            item.separator ? (
              <div key={`sep-${i}`} className="context-menu-sep" />
            ) : (
              <button
                key={`${item.label}-${i}`}
                type="button"
                className={`context-menu-item ${item.danger ? "danger" : ""}`}
                disabled={item.disabled}
                onClick={() => {
                  if (item.disabled) return;
                  item.onClick();
                  onOpen();
                }}
              >
                {item.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
