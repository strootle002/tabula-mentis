import { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "../store/appStore";
import {
  mapSearchDocuments,
  noteSearchDocument,
  VaultSearchIndex,
  type SearchResult,
} from "./searchIndex";
import { loadMap } from "../vault/vaultFs";

export const OPEN_SEARCH_EVENT = "mindmap:open-search";

export function SearchPalette() {
  const notes = useAppStore((state) => state.noteIndex);
  const maps = useAppStore((state) => state.maps);
  const activeMap = useAppStore((state) => state.activeMap);
  const activeMapPath = useAppStore((state) => state.activeMapPath);
  const openNote = useAppStore((state) => state.openNote);
  const openMap = useAppStore((state) => state.openMap);
  const setSelectedNode = useAppStore((state) => state.setSelectedNode);
  const indexRef = useRef(new VaultSearchIndex());
  const noteIdsRef = useRef(new Set<string>());
  const diskMapIdsRef = useRef(new Set<string>());
  const activeMapIdsRef = useRef(new Set<string>());
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [indexRevision, setIndexRevision] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const next = new Set<string>();
    for (const note of notes) {
      const document = noteSearchDocument(note);
      next.add(document.id);
      indexRef.current.upsert(document);
    }
    for (const id of noteIdsRef.current) {
      if (!next.has(id)) indexRef.current.remove(id);
    }
    noteIdsRef.current = next;
  }, [notes]);

  useEffect(() => {
    let cancelled = false;
    const next = new Set<string>();
    for (const map of maps) {
      const id = `map:${map.path}`;
      next.add(id);
      indexRef.current.upsert({
        id,
        kind: "map",
        title: map.name,
        content: map.name,
        path: map.path,
        mapPath: map.path,
      });
    }

    void Promise.all(
      maps.map(async (map) => {
        if (map.path === activeMapPath) return [];
        try {
          return mapSearchDocuments(map.path, await loadMap(map.path));
        } catch {
          // A malformed map remains discoverable by title; opening it will
          // surface the store's normal recovery/error path.
          return [];
        }
      }),
    ).then((documentSets) => {
      if (cancelled) return;
      for (const documents of documentSets) {
        for (const document of documents) {
          next.add(document.id);
          indexRef.current.upsert(document);
        }
      }
      for (const id of diskMapIdsRef.current) {
        if (!next.has(id) && !activeMapIdsRef.current.has(id)) {
          indexRef.current.remove(id);
        }
      }
      diskMapIdsRef.current = next;
      setIndexRevision((revision) => revision + 1);
    });

    return () => {
      cancelled = true;
    };
  }, [activeMapPath, maps]);

  useEffect(() => {
    for (const id of activeMapIdsRef.current) indexRef.current.remove(id);
    const next = new Set<string>();
    if (activeMap && activeMapPath) {
      for (const document of mapSearchDocuments(activeMapPath, activeMap)) {
        next.add(document.id);
        indexRef.current.upsert(document);
      }
    }
    activeMapIdsRef.current = next;
    setIndexRevision((revision) => revision + 1);
  }, [activeMap, activeMapPath]);

  useEffect(() => {
    const show = () => setOpen(true);
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      } else if (event.key === "Escape" && open) {
        event.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener(OPEN_SEARCH_EVENT, show);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener(OPEN_SEARCH_EVENT, show);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
    else {
      setQuery("");
      setActive(0);
    }
  }, [open]);

  const results = useMemo(
    () => (query.trim() ? indexRef.current.search(query, 40) : []),
    // Index updates are represented by these dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query, notes, maps, activeMap, activeMapPath, indexRevision],
  );

  useEffect(() => {
    setActive((current) => Math.min(current, Math.max(0, results.length - 1)));
  }, [results.length]);

  const navigate = async (result: SearchResult) => {
    setOpen(false);
    if (result.kind === "note") {
      await openNote(result.path);
      return;
    }
    const path = result.mapPath ?? result.path;
    await openMap(path);
    if (result.nodeId) {
      setSelectedNode(result.nodeId);
    }
  };

  if (!open) return null;

  return (
    <div className="modal-backdrop search-backdrop" onMouseDown={() => setOpen(false)}>
      <div
        className="search-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Search vault"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <input
          ref={inputRef}
          className="search-input"
          value={query}
          placeholder="Search notes, maps, nodes, tags, and paths…"
          aria-label="Search vault"
          aria-controls="vault-search-results"
          aria-activedescendant={results[active] ? `search-result-${active}` : undefined}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActive((current) => Math.min(results.length - 1, current + 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((current) => Math.max(0, current - 1));
            } else if (event.key === "Enter" && results[active]) {
              event.preventDefault();
              void navigate(results[active]);
            }
          }}
        />
        <div id="vault-search-results" className="search-results" role="listbox">
          {!query.trim() && (
            <p className="search-empty">Type to search · ↑↓ select · Enter open · Esc close</p>
          )}
          {query.trim() && !results.length && (
            <p className="search-empty">No matching notes, maps, or nodes.</p>
          )}
          {results.map((result, index) => (
            <button
              id={`search-result-${index}`}
              key={result.id}
              type="button"
              role="option"
              aria-selected={active === index}
              className={`search-result ${active === index ? "active" : ""}`}
              onMouseEnter={() => setActive(index)}
              onClick={() => void navigate(result)}
            >
              <span className="search-result-main">
                <strong>{result.title}</strong>
                <span className="search-result-kind">{result.kind}</span>
              </span>
              {result.snippet && <span className="search-result-snippet">{result.snippet}</span>}
              <span className="search-result-path">{result.path}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
