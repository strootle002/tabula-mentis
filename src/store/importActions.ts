import type { AppActions, GetState, SetState } from "./storeTypes";
import { recordMapChange, scheduleMapSave, flushPendingSaves } from "./storeServices";
import type { MindMapDocument } from "../mindmap/types";
import { saveImportSourceCopy, saveMap, uniqueMapFileName } from "../vault/vaultFs";
import { MindMapFormatError, parseMindMapDocument } from "../mindmap/documentFormat";
import { collectDescendantIds } from "../mindmap/layout";
import { pruneLinks } from "../mindmap/mapDoc";
import {
  importCsvToMap,
  importTxtToMap,
  tableToMapTree,
  MAX_IMPORT_NODES,
  type CsvImportOptions,
  type TxtImportOptions,
} from "../import-export/io";

export type ImportActions = Pick<AppActions, "applyTableToActiveMap" | "importFile" | "importMindMapDocument">;

function countDocumentNodes(doc: MindMapDocument): number {
  let total = collectDescendantIds(doc.root, doc.root.id).length;
  for (const forest of doc.floatingNodes ?? []) {
    total += collectDescendantIds(forest, forest.id).length;
  }
  return total;
}

/** Soften huge imports so opening the canvas stays responsive. */
function prepareImportedDocument(doc: MindMapDocument): MindMapDocument {
  const count = countDocumentNodes(doc);
  if (count <= 800) return doc;
  // Collapse top-level children so the first paint is cheap; user can expand.
  return {
    ...doc,
    root: {
      ...doc.root,
      children: doc.root.children.map((child) =>
        child.children.length
          ? { ...child, collapsed: true }
          : child,
      ),
    },
  };
}

export function createImportActions(set: SetState, get: GetState): ImportActions {
  return {
  applyTableToActiveMap: (rows) => {
    const { activeMap } = get();
    if (!activeMap) return;
    recordMapChange(get, set, "Edit data grid");
    const root = tableToMapTree(rows);
    const rebuilt: MindMapDocument = {
      ...activeMap,
      root,
      positions: undefined,
      radialDirs: undefined,
    };
    set({
      activeMap: {
        ...rebuilt,
        links: pruneLinks(rebuilt),
      },
      dirtyMap: true,
      selectedNodeId: root.id,
      editingNodeId: null,
      view: "map",
      dataGrid: null,
    });
    scheduleMapSave(get, set);
  },

  importFile: async (kind, content, options, source) => {
    const { vaultPath } = get();
    if (!vaultPath) {
      set({
        error:
          "Open or create a vault folder before importing. Imports are saved into your vault.",
      });
      return false;
    }
    try {
      await flushPendingSaves(get);
      let doc: MindMapDocument;
      if (kind === "json") {
        try {
          const parsed: unknown = JSON.parse(content);
          if (
            parsed !== null &&
            typeof parsed === "object" &&
            ("root" in parsed || "version" in parsed)
          ) {
            return await get().importMindMapDocument(
              parseMindMapDocument(parsed),
              source,
            );
          }
        } catch (e) {
          if (e instanceof MindMapFormatError) throw e;
          /* treat as table-shaped JSON already converted by wizard */
        }
      }
      if (source) {
        await saveImportSourceCopy(vaultPath, source.name, source.content);
      }
      if (kind === "txt") {
        doc = importTxtToMap(content, options as TxtImportOptions);
      } else {
        doc = importCsvToMap(content, options as CsvImportOptions);
      }
      doc = prepareImportedDocument(doc);
      const nodeCount = countDocumentNodes(doc);
      if (nodeCount > MAX_IMPORT_NODES) {
        throw new Error(
          `Import would create ${nodeCount.toLocaleString()} nodes ` +
            `(limit ${MAX_IMPORT_NODES.toLocaleString()}). Choose a smaller file or fewer hierarchy levels.`,
        );
      }
      const fileName = await uniqueMapFileName(vaultPath, doc.title);
      const path = await saveMap(vaultPath, fileName, doc, "", {
        pretty: nodeCount < 400,
      });
      await get().refreshVault();
      await get().openMap(path);
      set({ importOpen: false, error: null });
      return true;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      set({ error: `Import failed: ${message}` });
      return false;
    }
  },

  importMindMapDocument: async (doc, source) => {
    const { vaultPath } = get();
    if (!vaultPath) {
      set({
        error:
          "Open or create a vault folder before importing. Imports are saved into your vault.",
      });
      return false;
    }
    try {
      await flushPendingSaves(get);
      const normalized = prepareImportedDocument(parseMindMapDocument(doc));
      const nodeCount = countDocumentNodes(normalized);
      if (nodeCount > MAX_IMPORT_NODES) {
        throw new Error(
          `Import would create ${nodeCount.toLocaleString()} nodes ` +
            `(limit ${MAX_IMPORT_NODES.toLocaleString()}).`,
        );
      }
      if (source) {
        await saveImportSourceCopy(vaultPath, source.name, source.content);
      }
      const fileName = await uniqueMapFileName(vaultPath, normalized.title);
      const path = await saveMap(vaultPath, fileName, {
        ...normalized,
        version: 1,
        createdAt: normalized.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await get().refreshVault();
      await get().openMap(path);
      set({ importOpen: false, error: null });
      return true;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      set({ error: `Import failed: ${message}` });
      return false;
    }
  }
  };
}
