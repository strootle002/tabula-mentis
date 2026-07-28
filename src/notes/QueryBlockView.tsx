import { useMemo, useState } from "react";
import {
  extractQueryDirectives,
  runQuery,
  QuerySyntaxError,
  type QueryRecord,
} from "../queries/query";
import type { NoteIndexEntry } from "./links";
import { useAppStore } from "../store/appStore";

function noteIndexToQueryRecords(index: NoteIndexEntry[]): QueryRecord[] {
  return index.map((n) => ({
    id: n.path,
    text: n.content,
    tags: n.tags,
    page: n.name,
  }));
}

/** Renders results for any ```query fenced blocks found in `content`. */
export function QueryBlockView({ content }: { content: string }) {
  const noteIndex = useAppStore((s) => s.noteIndex);
  const openNote = useAppStore((s) => s.openNote);
  const [collapsed, setCollapsed] = useState(false);

  const directives = useMemo(() => extractQueryDirectives(content), [content]);
  const records = useMemo(
    () => noteIndexToQueryRecords(noteIndex),
    [noteIndex],
  );

  if (directives.length === 0) return null;

  return (
    <div className="query-block-panel">
      <button
        type="button"
        className="query-block-header"
        onClick={() => setCollapsed((c) => !c)}
      >
        {collapsed ? "▸" : "▾"} Live queries ({directives.length})
      </button>
      {!collapsed && (
        <div className="query-block-body">
          {directives.map((directive, i) => {
            let results: QueryRecord[] = [];
            let error: string | null = null;
            try {
              results = runQuery(directive, records);
            } catch (e) {
              error = e instanceof QuerySyntaxError ? e.message : String(e);
            }
            return (
              <div key={`${directive}-${i}`} className="query-block-result">
                <code className="query-block-source">{directive}</code>
                {error ? (
                  <div className="query-block-error hint">{error}</div>
                ) : results.length === 0 ? (
                  <div className="hint">No matches</div>
                ) : (
                  <ul className="query-block-list">
                    {results.map((r) => (
                      <li key={r.id}>
                        <button
                          type="button"
                          className="link-btn"
                          onClick={() => void openNote(r.id)}
                        >
                          {r.page || r.id}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
