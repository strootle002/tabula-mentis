import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "../store/appStore";
import { tableToCsv, downloadBlob } from "../import-export/io";

const PAGE = 100;

export function DataGridView() {
  const dataGrid = useAppStore((s) => s.dataGrid);
  const activeMap = useAppStore((s) => s.activeMap);
  const closeDataGrid = useAppStore((s) => s.closeDataGrid);
  const applyTableToActiveMap = useAppStore((s) => s.applyTableToActiveMap);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!dataGrid) return;
    setHeaders([...dataGrid.headers]);
    setRows(dataGrid.rows.map((r) => [...r]));
    setOffset(0);
    setSelected(new Set());
    setDirty(false);
  }, [dataGrid]);

  const canApply = !!activeMap;

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE) || 1);
  const pageIndex = Math.floor(offset / PAGE);
  const start = offset;
  const end = Math.min(rows.length, offset + PAGE);
  const slice = useMemo(
    () =>
      rows.slice(start, end).map((row, i) => ({
        row,
        index: start + i,
      })),
    [rows, start, end],
  );

  if (!dataGrid) {
    return (
      <div className="empty-state">
        <h2>No data</h2>
      </div>
    );
  }

  const markDirty = () => setDirty(true);

  const setCell = (rowIndex: number, colIndex: number, value: string) => {
    setRows((prev) => {
      const next = prev.map((r) => [...r]);
      if (!next[rowIndex]) return prev;
      next[rowIndex][colIndex] = value;
      return next;
    });
    markDirty();
  };

  const addRow = () => {
    setRows((prev) => [...prev, headers.map(() => "")]);
    markDirty();
    const newOffset = Math.max(0, Math.floor(rows.length / PAGE) * PAGE);
    setOffset(newOffset);
  };

  const deleteSelectedRows = () => {
    if (selected.size === 0) return;
    setRows((prev) => prev.filter((_, i) => !selected.has(i)));
    setSelected(new Set());
    markDirty();
    setOffset((o) => Math.min(o, Math.max(0, rows.length - selected.size - 1)));
  };

  const addColumn = () => {
    const name = `Level ${headers.length + 1}`;
    setHeaders((h) => [...h, name]);
    setRows((prev) => prev.map((r) => [...r, ""]));
    markDirty();
  };

  const removeLastColumn = () => {
    if (headers.length <= 1) return;
    setHeaders((h) => h.slice(0, -1));
    setRows((prev) => prev.map((r) => r.slice(0, -1)));
    markDirty();
  };

  const toggleSelect = (index: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const selectAllOnPage = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const { index } of slice) next.add(index);
      return next;
    });
  };

  const exportCsv = () => {
    const csv = tableToCsv(headers, rows);
    downloadBlob(
      new Blob([csv], { type: "text/csv" }),
      `${dataGrid.title || "grid"}.csv`,
    );
  };

  return (
    <div className="data-grid-view">
      <div className="data-grid-toolbar">
        <div className="data-grid-toolbar-main">
          <h2>{dataGrid.title}</h2>
          <span className="hint">
            {rows.length} rows · page {pageIndex + 1}/{pageCount}
            {dirty ? " · unsaved edits" : ""}
          </span>
        </div>
        <div className="data-grid-toolbar-actions">
          <button
            type="button"
            className="ghost-btn"
            onClick={() => setOffset((o) => Math.max(0, o - PAGE))}
            disabled={start === 0}
            title="Show the previous 100 rows"
          >
            Previous page
          </button>
          <button
            type="button"
            className="ghost-btn"
            onClick={() =>
              setOffset((o) =>
                Math.min(o + PAGE, Math.max(0, rows.length - PAGE)),
              )
            }
            disabled={end >= rows.length}
            title="Show the next 100 rows"
          >
            Next page
          </button>
          <button type="button" className="ghost-btn" onClick={addRow}>
            Add row
          </button>
          <button
            type="button"
            className="ghost-btn"
            onClick={deleteSelectedRows}
            disabled={selected.size === 0}
          >
            Delete rows
          </button>
          <button type="button" className="ghost-btn" onClick={addColumn}>
            Add column
          </button>
          <button
            type="button"
            className="ghost-btn"
            onClick={removeLastColumn}
            disabled={headers.length <= 1}
          >
            Remove column
          </button>
          <button type="button" className="ghost-btn" onClick={exportCsv}>
            Download CSV
          </button>
          {canApply && (
            <button
              type="button"
              className="primary-btn"
              onClick={() => applyTableToActiveMap(rows)}
              title="Rebuild the open mindmap from this table"
            >
              Apply to map
            </button>
          )}
          <button type="button" className="ghost-btn" onClick={closeDataGrid}>
            Close
          </button>
        </div>
      </div>
      <p className="data-grid-hint hint">
        Edit cells directly. Columns are mindmap levels (left = root). Previous /
        Next page through {PAGE} rows at a time
        {canApply
          ? ". Apply to map rebuilds the tree from the table (node notes/styles are reset)."
          : "."}
      </p>
      <div className="data-grid-scroll">
        <table className="data-grid-table editable">
          <thead>
            <tr>
              <th className="data-grid-check">
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={selectAllOnPage}
                  title="Select all rows on this page"
                >
                  All
                </button>
              </th>
              {headers.map((h, j) => (
                <th key={j}>
                  <input
                    className="data-grid-input"
                    value={h}
                    onChange={(e) => {
                      const value = e.target.value;
                      setHeaders((prev) => {
                        const next = [...prev];
                        next[j] = value;
                        return next;
                      });
                      markDirty();
                    }}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.map(({ row, index }) => (
              <tr
                key={index}
                className={selected.has(index) ? "selected-row" : ""}
              >
                <td className="data-grid-check">
                  <input
                    type="checkbox"
                    checked={selected.has(index)}
                    onChange={() => toggleSelect(index)}
                    aria-label={`Select row ${index + 1}`}
                  />
                </td>
                {headers.map((_, j) => (
                  <td key={j}>
                    <input
                      className="data-grid-input"
                      value={row[j] ?? ""}
                      onChange={(e) => setCell(index, j, e.target.value)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
