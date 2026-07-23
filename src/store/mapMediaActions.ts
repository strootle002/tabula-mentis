import type { AppActions, GetState, SetState } from "./storeTypes";
import { recordMapChange, scheduleMapSave } from "./storeServices";
import { readFile } from "@tauri-apps/plugin-fs";
import type { NodeImage } from "../mindmap/types";
import { resolveLayout } from "../mindmap/layout";
import { updateNodeInDoc } from "../mindmap/mapDoc";
import { clampImageSize, createNodeImageId, normalizeNodeImages, sizeFromImageFile, withNodeImages } from "../mindmap/nodeImages";
import { saveImageFromFile } from "../vault/imageAssets";
import { normalizeLayoutStyle } from "../mindmap/layoutCatalog";

export type MapMediaActions = Pick<AppActions, "addImagesToSelected" | "addImagesFromPaths" | "removeNodeImage" | "resizeNodeImage">;

export function createMapMediaActions(set: SetState, get: GetState): MapMediaActions {
  return {
  addImagesToSelected: async (files) => {
    const { vaultPath, selectedNodeId } = get();
    if (!vaultPath || !get().activeMap || !selectedNodeId) {
      set({ error: "Open a vault and select a node to attach an image." });
      return;
    }
    const imageFiles = files.filter(
      (f) =>
        f.type.startsWith("image/") ||
        (!f.type && f.size > 0) ||
        /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(f.name),
    );
    if (imageFiles.length === 0) {
      set({
        error:
          "No image found on the clipboard. Copy an image (or screenshot), select a node, then paste.",
      });
      return;
    }
    try {
      const added: NodeImage[] = [];
      for (const file of imageFiles) {
        const saved = await saveImageFromFile(vaultPath, file);
        const size = await sizeFromImageFile(file);
        added.push({
          id: createNodeImageId(),
          src: saved.relativePath,
          width: size.width,
          height: size.height,
        });
      }
      // Re-read map after awaits so we don't clobber concurrent edits.
      const { activeMap: latest, selectedNodeId: sid } = get();
      if (!latest || !sid) return;
      recordMapChange(
        get,
        set,
        added.length === 1 ? "Add node image" : "Add node images",
      );
      const next = updateNodeInDoc(latest, sid, (n) =>
        withNodeImages(n, [...normalizeNodeImages(n), ...added]),
      );
      set({ activeMap: next, dirtyMap: true, error: null });
      scheduleMapSave(get, set);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      set({ error: `Could not save image: ${message}` });
    }
  },

  addImagesFromPaths: async (paths) => {
    const imagePaths = paths.filter((p) =>
      /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(p),
    );
    if (imagePaths.length === 0) return;
    try {
      const files: File[] = [];
      for (const path of imagePaths) {
        const bytes = await readFile(path);
        const name = path.split(/[/\\]/).pop() || "image.png";
        const ext = name.split(".").pop()?.toLowerCase();
        const mime =
          ext === "jpg" || ext === "jpeg"
            ? "image/jpeg"
            : ext === "gif"
              ? "image/gif"
              : ext === "webp"
                ? "image/webp"
                : ext === "svg"
                  ? "image/svg+xml"
                  : "image/png";
        files.push(new File([bytes.slice()], name, { type: mime }));
      }
      await get().addImagesToSelected(files);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      set({ error: `Could not read image file: ${message}` });
    }
  },

  removeNodeImage: (imageId) => {
    const { activeMap, selectedNodeId } = get();
    if (!activeMap || !selectedNodeId) return;
    recordMapChange(get, set, "Remove node image");
    const next = updateNodeInDoc(activeMap, selectedNodeId, (n) =>
      withNodeImages(
        n,
        normalizeNodeImages(n).filter((img) => img.id !== imageId),
      ),
    );
    set({ activeMap: next, dirtyMap: true });
    scheduleMapSave(get, set);
  },

  resizeNodeImage: (nodeId, imageId, width, height, opts) => {
    const { activeMap, vaultSettings } = get();
    if (!activeMap || !nodeId) return;
    recordMapChange(get, set, "Resize node image", {
      coalesce: opts?.coalesce ?? true,
    });
    const size = clampImageSize(width, height);
    let next = updateNodeInDoc(activeMap, nodeId, (n) =>
      withNodeImages(
        n,
        normalizeNodeImages(n).map((img) =>
          img.id === imageId
            ? { ...img, width: size.width, height: size.height }
            : img,
        ),
      ),
    );
    // If the map has manual positions, reflow them from the expanded layout so
    // neighbors move out of the way instead of staying underneath the image.
    if (next.positions) {
      const layoutStyle = normalizeLayoutStyle(
        next.layoutStyle ?? vaultSettings.defaultLayoutStyle ?? "right",
      );
      const laid = resolveLayout(
        next.root,
        vaultSettings.defaultNodeStyle,
        layoutStyle,
        next.positions,
        null,
        next.radialDirs,
        next.floatingNodes,
        next.links,
        next.flowDir,
      );
      const positions: Record<string, { x: number; y: number }> = {};
      for (const n of laid.nodes) {
        positions[n.id] = { x: n.x, y: n.y };
      }
      next = { ...next, positions };
    }
    set({ activeMap: next, dirtyMap: true });
    scheduleMapSave(get, set);
  }
  };
}
