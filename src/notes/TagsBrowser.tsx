import { useMemo, useRef, useState } from "react";
import { useAppStore } from "../store/appStore";
import { buildTagForest, flattenTagForest } from "./links";
import { TagsIcon } from "../components/navIcons";
import { NavHidePanelButton } from "../components/NavHidePanelButton";

export function TagsBrowser({
  onNavigate,
}: {
  onNavigate?: () => void;
}) {
  const getAllTags = useAppStore((s) => s.getAllTags);
  const noteIndex = useAppStore((s) => s.noteIndex);
  const mapNodeTags = useAppStore((s) => s.mapNodeTags);
  const openTag = useAppStore((s) => s.openTag);
  const activeTag = useAppStore((s) => s.activeTag);
  const view = useAppStore((s) => s.view);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const tags = useMemo(
    () => getAllTags(),
    [getAllTags, noteIndex, mapNodeTags],
  );
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^#/, "");
    const forest = buildTagForest(tags);
    const flat = flattenTagForest(forest);
    if (!q) return flat;
    return flat.filter((n) => n.tag.includes(q) || n.label.includes(q));
  }, [tags, query]);

  return (
    <div className="nav-pane tags-pane">
      <div className="nav-pane-header">
        <span>Tags</span>
        <NavHidePanelButton />
      </div>
      <div className="nav-pane-body">
        <input
          ref={inputRef}
          className="nav-search-input"
          value={query}
          placeholder="Search tags…"
          aria-label="Search tags"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && rows[0]) {
              e.preventDefault();
              void openTag(rows[0].tag);
              onNavigate?.();
            }
          }}
        />
        <div className="sidebar-list tags-pane-list" role="listbox">
          {rows.length === 0 ? (
            <p className="sidebar-empty hint">
              {tags.length === 0
                ? "No tags yet. Add #tags in notes or node notes."
                : "No tags match that search."}
            </p>
          ) : (
            rows.map((row) => {
              const active = view === "tag" && activeTag === row.tag;
              return (
                <button
                  key={row.tag}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={`sidebar-item entry-tag ${active ? "active" : ""}`}
                  style={{ paddingLeft: `${0.45 + row.depth * 0.75}rem` }}
                  onClick={() => {
                    void openTag(row.tag);
                    onNavigate?.();
                  }}
                >
                  <span className="entry-icon tag" aria-hidden>
                    <TagsIcon />
                  </span>
                  <span className="entry-name">
                    {row.depth > 0 ? row.label : `#${row.tag}`}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
