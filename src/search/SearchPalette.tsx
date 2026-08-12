import { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "../store/appStore";
import {
  mapSearchDocuments,
  noteSearchDocument,
  VaultSearchIndex,
  type SearchResult,
} from "./searchIndex";
import { loadMap } from "../vault/vaultFs";
import {
  buildCommands,
  COMMON_COMMAND_IDS,
  filterCommands,
} from "../commands/registry";
import type { AppCommand } from "../commands/types";

export const OPEN_SEARCH_EVENT = "mindmap:open-search";

type PaletteRow =
  | { kind: "command"; id: string; command: AppCommand }
  | { kind: "result"; id: string; result: SearchResult };

export function SearchPalette() {
  const notes = useAppStore((state) => state.noteIndex);
  const maps = useAppStore((state) => state.maps);
  const activeMap = useAppStore((state) => state.activeMap);
  const activeMapPath = useAppStore((state) => state.activeMapPath);
  const openNote = useAppStore((state) => state.openNote);
  const openMap = useAppStore((state) => state.openMap);
  const setSelectedNode = useAppStore((state) => state.setSelectedNode);
  // Command availability depends on these slices; re-evaluate when they move.
  const view = useAppStore((state) => state.view);
  const activeNotePath = useAppStore((state) => state.activeNotePath);
  const presentationMode = useAppStore((state) => state.presentationMode);
  const themeId = useAppStore((state) => state.themeId);
  const selectedNodeId = useAppStore((state) => state.selectedNodeId);
  const undoDepth = useAppStore((state) => state.mapHistory.length);
  const redoDepth = useAppStore((state) => state.mapFuture.length);
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

  const commandRows = useMemo(() => {
    if (!open) return [];
    const state = useAppStore.getState();
    const available = buildCommands(state);
    const matched = query.trim()
      ? filterCommands(available, query)
      : COMMON_COMMAND_IDS.map((id) => available.find((c) => c.id === id))
          .filter((c): c is AppCommand => !!c);
    return matched
      .slice(0, 8)
      .map((command): PaletteRow => ({
        kind: "command",
        id: `cmd:${command.id}`,
        command,
      }));
    // Availability slices: recompute when the palette opens or they change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    open,
    query,
    view,
    activeMap,
    activeNotePath,
    presentationMode,
    themeId,
    selectedNodeId,
    undoDepth,
    redoDepth,
  ]);

  const rows = useMemo<PaletteRow[]>(
    () => [
      ...commandRows,
      ...results.map(
        (result): PaletteRow => ({
          kind: "result",
          id: result.id,
          result,
        }),
      ),
    ],
    [commandRows, results],
  );

  useEffect(() => {
    setActive((current) => Math.min(current, Math.max(0, rows.length - 1)));
  }, [rows.length]);

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

  const activate = (row: PaletteRow) => {
    if (row.kind === "command") {
      setOpen(false);
      void row.command.run(useAppStore.getState());
      return;
    }
    void navigate(row.result);
  };

  if (!open) return null;

  return (
    <div className="modal-backdrop search-backdrop" onMouseDown={() => setOpen(false)}>
      <div
        className="search-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Search vault and commands"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <input
          ref={inputRef}
          className="search-input"
          value={query}
          placeholder="Search or run a command…"
          aria-label="Search vault and commands"
          aria-controls="vault-search-results"
          aria-activedescendant={rows[active] ? `search-result-${active}` : undefined}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActive((current) => Math.min(rows.length - 1, current + 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((current) => Math.max(0, current - 1));
            } else if (event.key === "Enter" && rows[active]) {
              event.preventDefault();
              activate(rows[active]);
            }
          }}
        />
        <div id="vault-search-results" className="search-results" role="listbox">
          {!query.trim() && (
            <p className="search-empty">Type to search or run a command · ↑↓ select · Enter open · Esc close</p>
          )}
          {query.trim() && !rows.length && (
            <p className="search-empty">No matching commands, notes, maps, or nodes.</p>
          )}
          {rows.map((row, index) => {
            const showSection =
              index === 0 || rows[index - 1].kind !== row.kind;
            return (
              <div key={row.id} className="search-row-group">
                {showSection && (
                  <div className="search-section hint">
                    {row.kind === "command" ? "Commands" : "Vault"}
                  </div>
                )}
                {row.kind === "command" ? (
                  <button
                    id={`search-result-${index}`}
                    type="button"
                    role="option"
                    aria-selected={active === index}
                    className={`search-result ${active === index ? "active" : ""}`}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => activate(row)}
                  >
                    <span className="search-result-main">
                      <strong>{row.command.title}</strong>
                      <span className="search-result-kind kind-command">
                        Command
                      </span>
                    </span>
                    <span className="search-result-path">
                      {row.command.section}
                    </span>
                  </button>
                ) : (
                  <button
                    id={`search-result-${index}`}
                    type="button"
                    role="option"
                    aria-selected={active === index}
                    className={`search-result ${active === index ? "active" : ""}`}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => activate(row)}
                  >
                    <span className="search-result-main">
                      <strong>{row.result.title}</strong>
                      <span className="search-result-kind">
                        {row.result.kind}
                      </span>
                    </span>
                    {row.result.snippet && (
                      <span className="search-result-snippet">
                        {row.result.snippet}
                      </span>
                    )}
                    <span className="search-result-path">{row.result.path}</span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
