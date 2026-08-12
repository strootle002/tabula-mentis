import { writeFile } from "@tauri-apps/plugin-fs";
import { save } from "@tauri-apps/plugin-dialog";
import { useAppStore } from "../store/appStore";
import type { AppState } from "../store/storeTypes";
import {
  normalizeLayoutStyle,
} from "../mindmap/layoutCatalog";
import { resolveLayout } from "../mindmap/layout";
import { downloadBlob, exportMapToCsv } from "../import-export/io";
import {
  exportLayoutToPng,
  exportThemeColors,
} from "../import-export/exportPng";
import { getCanvasWrap } from "../mindmap/canvasDom";
import {
  noteContentToHtml,
  mapOutlineToHtml,
} from "../import-export/exportHtml";
import { mapLayoutToVisualHtml } from "../import-export/exportMapHtml";
import {
  exportFreeplane,
  exportOpml,
} from "../import-export/xmlInterchange";

async function runExport(format: string, operation: () => Promise<void>) {
  try {
    await operation();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    useAppStore.setState({ error: `${format} export failed: ${message}` });
  }
}

function activeMapLayout(state: AppState) {
  const { activeMap, vaultSettings } = state;
  if (!activeMap) return null;
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
  return { layoutStyle, layout };
}

export function exportActiveMapJson(state: AppState) {
  return runExport("JSON", async () => {
    const { activeMap } = state;
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
}

export function exportActiveMapCsv(state: AppState) {
  return runExport("CSV", async () => {
    const { activeMap } = state;
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
}

function exportActiveMapXml(
  state: AppState,
  format: "Freeplane" | "OPML",
  extension: "mm" | "opml",
  serialize: typeof exportFreeplane,
) {
  return runExport(format, async () => {
    const { activeMap } = state;
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
}

export function exportActiveMapFreeplane(state: AppState) {
  return exportActiveMapXml(state, "Freeplane", "mm", exportFreeplane);
}

export function exportActiveMapOpml(state: AppState) {
  return exportActiveMapXml(state, "OPML", "opml", exportOpml);
}

export function exportActiveMapPngFull(state: AppState) {
  return runExport("PNG", async () => {
    const { activeMap, vaultPath } = state;
    const resolved = activeMapLayout(state);
    if (!activeMap || !resolved) return;
    // Draw via Canvas2D from layout geometry — SVG→Image crashes WebKitGTK.
    const blob = await exportLayoutToPng(resolved.layout, {
      layoutStyle: resolved.layoutStyle,
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
}

export function exportActiveMapPngViewport(state: AppState) {
  return runExport("PNG", async () => {
    const { activeMap, vaultPath, panX, panY, zoom } = state;
    const resolved = activeMapLayout(state);
    if (!activeMap || !resolved) return;
    const wrap = getCanvasWrap();
    const viewW = wrap?.clientWidth || window.innerWidth;
    const viewH = wrap?.clientHeight || window.innerHeight;
    const region = {
      x: -panX / zoom,
      y: -panY / zoom,
      width: viewW / zoom,
      height: viewH / zoom,
    };
    const blob = await exportLayoutToPng(resolved.layout, {
      layoutStyle: resolved.layoutStyle,
      flowDir: activeMap.flowDir,
      colors: exportThemeColors(),
      vaultPath,
      region,
    });
    const path = await save({
      defaultPath: `${activeMap.title || "map"}-viewport.png`,
      filters: [{ name: "PNG", extensions: ["png"] }],
    });
    if (path) await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
    else downloadBlob(blob, `${activeMap.title || "map"}-viewport.png`);
  });
}

export function exportActiveNoteHtml(state: AppState) {
  return runExport("HTML", async () => {
    const { activeNotePath, activeNoteName, activeNoteContent } = state;
    if (!activeNotePath) return;
    const html = noteContentToHtml(activeNoteName || "Note", activeNoteContent);
    const path = await save({
      defaultPath: `${activeNoteName || "note"}.html`,
      filters: [{ name: "HTML", extensions: ["html"] }],
    });
    // Never fall back to blob: for HTML — WebKit navigates and replaces the app.
    if (!path) return;
    await writeFile(path, new TextEncoder().encode(html));
  });
}

export function exportActiveMapOutlineHtml(state: AppState) {
  return runExport("HTML", async () => {
    const { activeMap } = state;
    if (!activeMap) return;
    const html = mapOutlineToHtml(activeMap.title, activeMap.root);
    const path = await save({
      defaultPath: `${activeMap.title || "map"}-outline.html`,
      filters: [{ name: "HTML", extensions: ["html"] }],
    });
    // Never fall back to blob: for HTML — WebKit navigates and replaces the app.
    if (!path) return;
    await writeFile(path, new TextEncoder().encode(html));
  });
}

export function exportActiveMapVisualHtml(state: AppState) {
  return runExport("HTML", async () => {
    const { activeMap, vaultPath } = state;
    const resolved = activeMapLayout(state);
    if (!activeMap || !resolved) return;
    const html = await mapLayoutToVisualHtml(activeMap.title, resolved.layout, {
      layoutStyle: resolved.layoutStyle,
      flowDir: activeMap.flowDir,
      colors: exportThemeColors(),
      vaultPath,
    });
    const path = await save({
      defaultPath: `${activeMap.title || "map"}.html`,
      filters: [{ name: "HTML", extensions: ["html"] }],
    });
    // Never fall back to blob: for HTML — WebKit navigates and replaces the app.
    if (!path) return;
    await writeFile(path, new TextEncoder().encode(html));
  });
}
