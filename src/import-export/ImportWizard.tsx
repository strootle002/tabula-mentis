import { useMemo, useState } from "react";
import { pickAndReadTextFile, useAppStore } from "../store/appStore";
import {
  detectImportKind,
  estimateLevelImportNodes,
  jsonToTable,
  MAX_IMPORT_NODES,
  parseCsv,
  parseCsvPreview,
  suggestLevelColumns,
  tableToCsv,
  type TxtImportMode,
} from "../import-export/io";
import type { MindMapDocument } from "../mindmap/types";
import {
  MindMapFormatError,
  parseMindMapDocument,
} from "../mindmap/documentFormat";
import { useAccessibleDialog } from "../components/useAccessibleDialog";
import {
  detectXmlInterchange,
  importFreeplane,
  importOpml,
} from "./xmlInterchange";

const PREVIEW_ROWS = 40;
const PREVIEW_CELL_CHARS = 48;

function truncateCell(value: string, max = PREVIEW_CELL_CHARS): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

export function ImportWizard() {
  const importOpen = useAppStore((s) => s.importOpen);
  const setImportOpen = useAppStore((s) => s.setImportOpen);
  const importFile = useAppStore((s) => s.importFile);
  const importMindMapDocument = useAppStore((s) => s.importMindMapDocument);
  const openDataGrid = useAppStore((s) => s.openDataGrid);
  const clearError = useAppStore((s) => s.clearError);
  const reportError = (message: string) =>
    useAppStore.setState({ error: message });

  const [fileName, setFileName] = useState("");
  const [content, setContent] = useState("");
  const [kind, setKind] = useState<"csv" | "txt" | "json" | "freeplane" | "opml">("csv");
  const [title, setTitle] = useState("Imported");
  const [hasHeader, setHasHeader] = useState(true);
  const [levelColumns, setLevelColumns] = useState<number[]>([0]);
  const [txtMode, setTxtMode] = useState<TxtImportMode>("indent");
  const [tableHeaders, setTableHeaders] = useState<string[]>([]);
  /** Preview-only rows (header + sample). Full file stays in `content`. */
  const [previewTable, setPreviewTable] = useState<string[][]>([]);
  const [totalDataRows, setTotalDataRows] = useState(0);
  const [nativeDoc, setNativeDoc] = useState<MindMapDocument | null>(null);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const close = () => {
    if (!busy) setImportOpen(false);
  };
  const { dialogProps, titleId } = useAccessibleDialog(importOpen, close);

  const headers = useMemo(() => {
    if (kind === "txt") return [];
    if (tableHeaders.length) return tableHeaders;
    if (previewTable.length === 0) return [] as string[];
    if (hasHeader) {
      return previewTable[0].map((h, i) => h || `Column ${i + 1}`);
    }
    const width = Math.max(...previewTable.map((r) => r.length), 1);
    return Array.from({ length: width }, (_, i) => `Column ${i + 1}`);
  }, [kind, tableHeaders, previewTable, hasHeader]);

  const dataPreviewRows = useMemo(() => {
    if (kind === "txt") return [];
    if (tableHeaders.length) return previewTable;
    return hasHeader ? previewTable.slice(1) : previewTable;
  }, [kind, tableHeaders, previewTable, hasHeader]);

  const estimatedNodes = useMemo(() => {
    if (kind === "txt" || nativeDoc || dataPreviewRows.length === 0) return 0;
    // Rough estimate from preview sample, scaled to full row count
    const sample = estimateLevelImportNodes(dataPreviewRows, levelColumns);
    if (totalDataRows <= dataPreviewRows.length) return sample;
    const scale = totalDataRows / Math.max(dataPreviewRows.length, 1);
    return Math.min(MAX_IMPORT_NODES + 1, Math.round(sample * scale));
  }, [kind, nativeDoc, dataPreviewRows, levelColumns, totalDataRows]);

  if (!importOpen) return null;

  const reset = () => {
    setFileName("");
    setContent("");
    setLevelColumns([0]);
    setTableHeaders([]);
    setPreviewTable([]);
    setTotalDataRows(0);
    setNativeDoc(null);
    setLocalError(null);
    setBusy(false);
  };

  const pickFile = async () => {
    setLocalError(null);
    clearError();
    setBusy(true);
    try {
      const file = await pickAndReadTextFile();
      if (!file) return;
      const xmlKind = detectXmlInterchange(file.name, file.content);
      const detected = xmlKind ?? detectImportKind(file.name, file.content);
      setFileName(file.name);
      setContent(file.content);
      setKind(detected);
      setTitle(file.name.replace(/\.(csv|txt|json|md|mm|opml|xml)$/i, "") || "Imported");
      setNativeDoc(null);
      setTableHeaders([]);

      if (detected === "freeplane" || detected === "opml") {
        const doc =
          detected === "freeplane"
            ? importFreeplane(file.content)
            : importOpml(file.content);
        setNativeDoc(doc);
        setTitle(doc.title);
        setPreviewTable([]);
        setTotalDataRows(0);
        return;
      }

      if (detected === "json") {
        try {
          const parsed: unknown = JSON.parse(file.content);
          if (
            parsed !== null &&
            typeof parsed === "object" &&
            ("root" in parsed || "version" in parsed)
          ) {
            const doc = parseMindMapDocument(parsed);
            setNativeDoc(doc);
            setTitle(doc.title || "Imported");
            const table = jsonToTable(file.content);
            setTableHeaders(table.headers);
            setPreviewTable(table.rows.slice(0, PREVIEW_ROWS));
            setTotalDataRows(table.rows.length);
            setHasHeader(false);
            setLevelColumns(
              suggestLevelColumns(table.headers, table.rows.slice(0, 80)),
            );
            return;
          }
          const table = jsonToTable(file.content);
          setTableHeaders(table.headers);
          setPreviewTable(table.rows.slice(0, PREVIEW_ROWS));
          setTotalDataRows(table.rows.length);
          setHasHeader(false);
          setLevelColumns(
            suggestLevelColumns(table.headers, table.rows.slice(0, 80)),
          );
        } catch (e) {
          console.error(e);
          setPreviewTable([]);
          setTotalDataRows(0);
          setLocalError(
            e instanceof MindMapFormatError
              ? `Could not import mind map: ${e.message}`
              : "Could not parse JSON file.",
          );
        }
      } else if (detected === "csv") {
        const { headers: hdrs, previewRows, totalDataRows: total } =
          parseCsvPreview(file.content, PREVIEW_ROWS);
        setPreviewTable(previewRows);
        setTotalDataRows(total);
        setHasHeader(true);
        const sample = previewRows.slice(1);
        setLevelColumns(suggestLevelColumns(hdrs, sample));
      } else {
        setPreviewTable([]);
        setTotalDataRows(0);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setLocalError(message);
      reportError(message);
    } finally {
      setBusy(false);
    }
  };

  const runImport = async () => {
    setLocalError(null);
    const source = fileName ? { name: fileName, content } : undefined;
    setBusy(true);
    try {
      if (nativeDoc) {
        const ok = await importMindMapDocument(
          {
            ...nativeDoc,
            title: title.trim() || nativeDoc.title,
          },
          source,
        );
        if (ok) reset();
        return;
      }
      if (!content && previewTable.length === 0) return;

      let ok = false;
      if (kind === "txt") {
        ok = await importFile("txt", content, { mode: txtMode, title }, source);
      } else if (kind === "json" && tableHeaders.length > 0) {
        const table = jsonToTable(content);
        const csv = tableToCsv(table.headers, table.rows);
        const nodes = estimateLevelImportNodes(table.rows, levelColumns);
        if (nodes > MAX_IMPORT_NODES) {
          throw new Error(
            `This hierarchy would create about ${nodes.toLocaleString()} nodes ` +
              `(limit ${MAX_IMPORT_NODES.toLocaleString()}). Choose fewer hierarchy levels.`,
          );
        }
        ok = await importFile(
          "csv",
          csv,
          {
            mode: "columns-as-levels",
            hasHeader: false,
            levelColumns,
            title,
          },
          source,
        );
      } else {
        // CSV: always import from the original file content (preview is only a sample).
        const allRows = parseCsv(content);
        const data = hasHeader ? allRows.slice(1) : allRows;
        const nodes = estimateLevelImportNodes(data, levelColumns);
        if (nodes > MAX_IMPORT_NODES) {
          throw new Error(
            `This hierarchy would create about ${nodes.toLocaleString()} nodes ` +
              `(limit ${MAX_IMPORT_NODES.toLocaleString()}). ` +
              `Pick fewer hierarchy levels, or columns with repeated categories ` +
              `(e.g. event.action, process.name) instead of unique fields like timestamps.`,
          );
        }

        ok = await importFile(
          "csv",
          content,
          {
            mode: "columns-as-levels",
            hasHeader,
            levelColumns,
            title,
          },
          source,
        );
      }
      if (ok) reset();
      else {
        const message =
          useAppStore.getState().error?.replace(/^Import failed:\s*/, "") ??
          "Import failed.";
        setLocalError(message);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setLocalError(message);
      reportError(`Import failed: ${message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={close}>
      <div
        {...dialogProps}
        className="modal modal-wide"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId}>Import to mindmap</h2>
        <p className="hint">
          Imports create a <strong>copy</strong> in your vault. The original
          file is never modified. A source copy is also saved under{" "}
          <code>assets/imports/</code>, and the editable mindmap lives in{" "}
          <code>maps/</code>.
          {nativeDoc
            ? kind === "freeplane" || kind === "opml"
              ? " The hierarchy, notes, stable IDs, and supported styles will be copied; format-specific layout and unsupported metadata are not retained."
              : " This file is a Tabula Mentis map document and will be imported with full structure (notes, styles, positions)."
            : " JSON arrays/objects are flattened into a table like CSV."}{" "}
          Preview shows the first {PREVIEW_ROWS} rows.
        </p>

        <div className="field" style={{ marginTop: "0.75rem" }}>
          <label>Source file</label>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <button
              type="button"
              className="ghost-btn"
              disabled={busy}
              onClick={() => void pickFile()}
            >
              {busy ? "Working…" : "Choose file…"}
            </button>
            <span className="hint">
              {fileName
                ? `${fileName} (${kind.toUpperCase()} · ${totalDataRows || "—"} rows)`
                : "None selected"}
            </span>
          </div>
        </div>

        <div className="field">
          <label htmlFor="import-title">Map title</label>
          <input
            id="import-title"
            value={title}
            disabled={busy}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        {(kind === "csv" || kind === "json") && dataPreviewRows.length > 0 && (
          <>
            {kind === "csv" && (
              <label className="hint" style={{ display: "flex", gap: "0.4rem" }}>
                <input
                  type="checkbox"
                  checked={hasHeader}
                  disabled={busy}
                  onChange={(e) => setHasHeader(e.target.checked)}
                />
                First row is header
              </label>
            )}

            <div className="field">
              <label>Hierarchy levels</label>
              <p className="hint" style={{ marginTop: 0 }}>
                Map columns to mindmap depth. Prefer categorical fields (action,
                process name) over unique ones (timestamps, messages).
                {estimatedNodes > 0
                  ? ` Estimated nodes: ~${estimatedNodes.toLocaleString()}.`
                  : ""}
              </p>
              {levelColumns.map((col, levelIdx) => (
                <div
                  key={levelIdx}
                  style={{
                    display: "flex",
                    gap: "0.5rem",
                    alignItems: "center",
                    marginBottom: "0.4rem",
                  }}
                >
                  <span className="hint" style={{ minWidth: 64 }}>
                    Level {levelIdx + 1}
                  </span>
                  <select
                    value={col}
                    disabled={busy}
                    onChange={(e) => {
                      const next = [...levelColumns];
                      next[levelIdx] = Number(e.target.value);
                      setLevelColumns(next);
                    }}
                  >
                    {headers.map((h, i) => (
                      <option key={i} value={i}>
                        {h}
                      </option>
                    ))}
                  </select>
                  {levelColumns.length > 1 && (
                    <button
                      type="button"
                      className="ghost-btn"
                      disabled={busy}
                      onClick={() =>
                        setLevelColumns(
                          levelColumns.filter((_, i) => i !== levelIdx),
                        )
                      }
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                className="ghost-btn"
                disabled={busy || levelColumns.length >= headers.length}
                onClick={() => {
                  const used = new Set(levelColumns);
                  const nextCol = headers.findIndex((_, i) => !used.has(i));
                  setLevelColumns([
                    ...levelColumns,
                    nextCol >= 0 ? nextCol : levelColumns.length,
                  ]);
                }}
              >
                + Add level
              </button>
            </div>

            <div className="import-preview">
              <div className="import-preview-head">
                <span className="hint">
                  Preview ({Math.min(PREVIEW_ROWS, dataPreviewRows.length)} of{" "}
                  {totalDataRows || dataPreviewRows.length} rows
                  {headers.length > 8
                    ? ` · showing ${Math.min(8, headers.length)}/${headers.length} columns`
                    : ""}
                  )
                </span>
                <button
                  type="button"
                  className="ghost-btn"
                  disabled={busy}
                  onClick={() => {
                    // Build a lighter grid from preview only; full file stays on disk after import
                    openDataGrid(
                      title,
                      headers.slice(0, 12),
                      dataPreviewRows.map((r) =>
                        r.slice(0, 12).map((c) => truncateCell(c, 80)),
                      ),
                    );
                    setImportOpen(false);
                  }}
                >
                  Open preview grid
                </button>
              </div>
              <div className="data-grid-scroll compact">
                <table className="data-grid-table">
                  <thead>
                    <tr>
                      {headers.slice(0, 8).map((h) => (
                        <th key={h} title={h}>
                          {truncateCell(h, 28)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dataPreviewRows.slice(0, PREVIEW_ROWS).map((row, i) => (
                      <tr key={i}>
                        {headers.slice(0, 8).map((_, j) => (
                          <td key={j} title={row[j] ?? ""}>
                            {truncateCell(row[j] ?? "")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {kind === "txt" && content && (
          <div className="field">
            <label htmlFor="txt-mode">Text structure</label>
            <select
              id="txt-mode"
              value={txtMode}
              disabled={busy}
              onChange={(e) => setTxtMode(e.target.value as TxtImportMode)}
            >
              <option value="indent">Indentation = depth</option>
              <option value="blank-lines">Blank-line sections</option>
            </select>
          </div>
        )}

        {localError && (
          <p
            style={{
              color: "var(--danger)",
              fontSize: "0.9rem",
              lineHeight: 1.4,
              marginTop: "0.75rem",
            }}
          >
            {localError}
          </p>
        )}

        <div className="modal-actions">
          <button
            type="button"
            className="ghost-btn"
            disabled={busy}
            onClick={() => {
              reset();
              setImportOpen(false);
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            className="primary-btn"
            disabled={busy || (!content && previewTable.length === 0)}
            onClick={() => void runImport()}
          >
            {busy ? "Importing…" : "Import"}
          </button>
        </div>
      </div>
    </div>
  );
}
