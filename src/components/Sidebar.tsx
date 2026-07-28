import { useMemo, useRef, useState } from "react";
import { useAppStore } from "../store/appStore";
import type { NavMode } from "../store/uiSlice";
import type { LibraryFolderSort } from "../mindmap/types";
import {
  NODE_NOTES_ROOT,
  nodeNotesMapSlug,
  isTagNotesPath,
  slugify,
} from "../vault/vaultFs";
import {
  isConceptGraphMap,
  isContinuousJournal,
  isJournalFolder,
  journalDateKey,
  listJournalDates,
} from "../notes/journals";
import {
  buildFolderTree,
  filterFolderTree,
  filterLibraryBundles,
  filterLibraryEntries,
  folderSegmentName,
  isFolderUnder,
  parentFolderPath,
  RECENT_PATHS_MAX,
  sortFolderNodes,
  type FolderNode,
  type LibraryEntry,
  type MapNoteBundle,
} from "../notes/libraryTree";
import { TagsBrowser } from "../notes/TagsBrowser";
import { ContextMenu, useContextMenu } from "./ContextMenu";
import { NavHidePanelButton } from "./NavHidePanelButton";
import {
  ChevronIcon,
  CollapseIcon,
  FavoritesIcon,
  FolderIcon,
  JournalIcon,
  LibraryIcon,
  MapIcon,
  NewFolderIcon,
  NewIcon,
  NoteIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  SortIcon,
  TagsIcon,
} from "./navIcons";
import { OPEN_SEARCH_EVENT } from "../search/SearchPalette";

const DND_MIME = "application/x-mindmap-entry";
const FOLDER_DND_MIME = "application/x-mindmap-folder";
const NAV_RAIL_WIDTH = 52;

type DragPayload = { kind: "map" | "note"; path: string };
type FolderDragPayload = { path: string };

const SORT_OPTIONS: { id: LibraryFolderSort; label: string }[] = [
  { id: "alpha", label: "Alphabetical" },
  { id: "modified", label: "Date modified" },
  { id: "created", label: "Date created" },
  { id: "custom", label: "Custom" },
];

function readPayload(e: React.DragEvent): DragPayload | null {
  const raw = e.dataTransfer.getData(DND_MIME);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as DragPayload;
    if (parsed.kind !== "map" && parsed.kind !== "note") return null;
    if (typeof parsed.path !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

function readFolderPayload(e: React.DragEvent): FolderDragPayload | null {
  const raw = e.dataTransfer.getData(FOLDER_DND_MIME);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as FolderDragPayload;
      if (typeof parsed.path === "string") return parsed;
    } catch {
      /* fall through */
    }
  }
  const text = e.dataTransfer.getData("text/plain");
  if (text.startsWith("folder:")) {
    return { path: text.slice("folder:".length) };
  }
  return null;
}

function isFolderOpen(
  expandedFolders: Record<string, boolean>,
  folder: string,
) {
  if (expandedFolders[folder] === false) return false;
  if (expandedFolders[`map:${folder}`] === false) return false;
  return true;
}

function sortEntries(a: LibraryEntry, b: LibraryEntry) {
  if (a.kind !== b.kind) return a.kind === "map" ? -1 : 1;
  return a.name.localeCompare(b.name);
}

function NavRail({
  navMode,
  collapsed,
  forceExpanded,
  onSelectMode,
  onToggleCollapse,
}: {
  navMode: NavMode;
  collapsed: boolean;
  forceExpanded: boolean;
  onSelectMode: (mode: NavMode) => void;
  onToggleCollapse: () => void;
}) {
  const openCreateDialog = useAppStore((s) => s.openCreateDialog);
  const openSettings = useAppStore((s) => s.openSettings);

  const modes: { id: NavMode; label: string; Icon: typeof JournalIcon }[] = [
    { id: "journal", label: "Journal", Icon: JournalIcon },
    { id: "favorites", label: "Favorites", Icon: FavoritesIcon },
    { id: "library", label: "Library", Icon: LibraryIcon },
    { id: "tags", label: "Tags", Icon: TagsIcon },
  ];

  const actions: {
    id: string;
    label: string;
    title: string;
    Icon: typeof JournalIcon;
    onClick: () => void;
  }[] = [
    {
      id: "new",
      label: "New",
      title: "New map or note",
      Icon: NewIcon,
      onClick: () => openCreateDialog("choose"),
    },
    {
      id: "search",
      label: "Search",
      title: "Search vault (Ctrl+K)",
      Icon: SearchIcon,
      onClick: () => window.dispatchEvent(new Event(OPEN_SEARCH_EVENT)),
    },
    {
      id: "settings",
      label: "Settings",
      title: "Settings",
      Icon: SettingsIcon,
      onClick: () => openSettings(),
    },
  ];

  return (
    <div className="nav-rail" style={{ width: NAV_RAIL_WIDTH }}>
      <div className="nav-rail-modes" role="tablist" aria-label="Navigation">
        {modes.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={navMode === id}
            className={`nav-rail-btn nav-${id} ${navMode === id ? "active" : ""}`}
            title={label}
            aria-label={label}
            onClick={() => onSelectMode(id)}
          >
            <Icon />
            <span className="nav-rail-label">{label}</span>
          </button>
        ))}
      </div>
      <div className="nav-rail-actions" aria-label="Quick actions">
        {actions.map(({ id, label, title, Icon, onClick }) => (
          <button
            key={id}
            type="button"
            className={`nav-rail-btn nav-action nav-action-${id}`}
            title={title}
            aria-label={title}
            onClick={onClick}
          >
            <Icon />
            <span className="nav-rail-label">{label}</span>
          </button>
        ))}
        {!forceExpanded && (
          <button
            type="button"
            className={`nav-rail-btn nav-collapse ${collapsed ? "is-collapsed" : ""}`}
            title={collapsed ? "Show navigation panel" : "Hide navigation panel"}
            aria-label={
              collapsed ? "Show navigation panel" : "Hide navigation panel"
            }
            aria-expanded={!collapsed}
            onClick={onToggleCollapse}
          >
            <CollapseIcon />
            <span className="nav-rail-label">{collapsed ? "Show" : "Hide"}</span>
          </button>
        )}
      </div>
    </div>
  );
}

function JournalPane({ onNavigate }: { onNavigate?: () => void }) {
  const notes = useAppStore((s) => s.notes);
  const noteIndex = useAppStore((s) => s.noteIndex);
  const view = useAppStore((s) => s.view);
  const activeNotePath = useAppStore((s) => s.activeNotePath);
  const openTodayJournal = useAppStore((s) => s.openTodayJournal);
  const openNote = useAppStore((s) => s.openNote);
  const setJournalFocusDate = useAppStore((s) => s.setJournalFocusDate);

  const journalNote = useMemo(
    () => notes.find((n) => isContinuousJournal(n.name, n.folder)) ?? null,
    [notes],
  );
  const todayKey = journalDateKey();
  const active =
    view === "note" &&
    !!journalNote &&
    activeNotePath === journalNote.path;

  const journalDates = useMemo(() => {
    if (!journalNote) return [];
    const entry = noteIndex.find((n) => n.path === journalNote.path);
    return entry ? listJournalDates(entry.content) : [];
  }, [journalNote, noteIndex]);

  const jumpToDate = (dateKey: string) => {
    if (!journalNote) return;
    const openThen = activeNotePath === journalNote.path
      ? Promise.resolve()
      : openNote(journalNote.path);
    void openThen.then(() => setJournalFocusDate(dateKey));
    onNavigate?.();
  };

  return (
    <div className="nav-pane journal-pane">
      <div className="nav-pane-header">
        <span>Journal</span>
        <NavHidePanelButton />
      </div>
      <div className="nav-pane-body">
        <div className="sidebar-list">
          <button
            type="button"
            className={`sidebar-item entry-journal ${active ? "active" : ""}`}
            onClick={() => {
              void openTodayJournal();
              onNavigate?.();
            }}
            title="Open continuous journal (adds today's heading once)"
          >
            <span className="entry-icon journal" aria-hidden>
              <JournalIcon />
            </span>
            <span className="entry-meta">
              <span className="entry-name">Today’s journal</span>
              <span className="entry-sub hint">{todayKey}</span>
            </span>
          </button>
        </div>
        {journalDates.length > 0 && (
          <div className="library-recent">
            <div className="library-recent-header hint">Jump to day</div>
            <div className="sidebar-list">
              {journalDates.map((d) => (
                <button
                  key={d.dateKey}
                  type="button"
                  className="sidebar-item entry-journal-date"
                  onClick={() => jumpToDate(d.dateKey)}
                  title={`Scroll to ${d.heading}`}
                >
                  <span className="entry-name">{d.heading}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FavoritesPane({ onNavigate }: { onNavigate?: () => void }) {
  const maps = useAppStore((s) => s.maps);
  const notes = useAppStore((s) => s.notes);
  const view = useAppStore((s) => s.view);
  const activeMapPath = useAppStore((s) => s.activeMapPath);
  const activeNotePath = useAppStore((s) => s.activeNotePath);
  const vaultSettings = useAppStore((s) => s.vaultSettings);
  const openMap = useAppStore((s) => s.openMap);
  const openNote = useAppStore((s) => s.openNote);
  const toggleFavoritePath = useAppStore((s) => s.toggleFavoritePath);
  const renameItem = useAppStore((s) => s.renameItem);
  const archiveItem = useAppStore((s) => s.archiveItem);
  const deleteItem = useAppStore((s) => s.deleteItem);
  const requestConfirm = useAppStore((s) => s.requestConfirm);
  const { menu, openMenu, closeMenu } = useContextMenu();

  const favoritePaths = vaultSettings.favoritePaths ?? [];
  const favoriteEntries = useMemo(() => {
    if (favoritePaths.length === 0) return [];
    const byPath = new Map<string, LibraryEntry>();
    for (const m of maps) byPath.set(m.path, { ...m, kind: "map" });
    for (const n of notes) byPath.set(n.path, { ...n, kind: "note" });
    return favoritePaths
      .map((p) => byPath.get(p))
      .filter((e): e is LibraryEntry => !!e);
  }, [favoritePaths, maps, notes]);

  const openEntryMenu = (
    e: React.MouseEvent,
    kind: "map" | "note",
    path: string,
    name: string,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    openMenu(e.clientX, e.clientY, [
      {
        label: "Open",
        onClick: () => {
          if (kind === "map") void openMap(path);
          else void openNote(path);
        },
      },
      {
        label: "Remove from favorites",
        onClick: () => void toggleFavoritePath(path),
      },
      {
        label: "Rename…",
        onClick: () => {
          const next = window.prompt("New name", name)?.trim();
          if (next && next !== name) void renameItem(kind, path, next);
        },
      },
      {
        label: "Archive",
        onClick: () => {
          void requestConfirm({
            title: "Archive item",
            message: `Archive “${name}”?`,
          }).then((ok) => {
            if (ok) void archiveItem(kind, path);
          });
        },
      },
      {
        label: "Delete",
        danger: true,
        onClick: () => {
          void requestConfirm({
            title: "Delete item",
            message: `Permanently delete “${name}”?`,
            confirmLabel: "Delete",
            danger: true,
          }).then((ok) => {
            if (ok) void deleteItem(kind, path);
          });
        },
      },
    ]);
  };

  return (
    <div className="nav-pane favorites-pane">
      <div className="nav-pane-header">
        <span>Favorites</span>
        <NavHidePanelButton />
      </div>
      <div className="nav-pane-body">
        {favoriteEntries.length === 0 ? (
          <p className="sidebar-empty hint">
            Pin maps or notes from the library (right-click → Add to favorites).
          </p>
        ) : (
          <div className="sidebar-list">
            {favoriteEntries.map((entry) => {
              const active =
                entry.kind === "map"
                  ? activeMapPath === entry.path && view === "map"
                  : activeNotePath === entry.path && view === "note";
              return (
                <button
                  key={`fav:${entry.path}`}
                  type="button"
                  className={`sidebar-item entry-${entry.kind} ${active ? "active" : ""}`}
                  onClick={() => {
                    if (entry.kind === "map") void openMap(entry.path);
                    else void openNote(entry.path);
                    onNavigate?.();
                  }}
                  onContextMenu={(e) =>
                    openEntryMenu(e, entry.kind, entry.path, entry.name)
                  }
                >
                  <span className={`entry-icon ${entry.kind}`} aria-hidden>
                    {entry.kind === "map" ? <MapIcon /> : <NoteIcon />}
                  </span>
                  <span className="entry-name">{entry.name}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menu.items}
          onClose={closeMenu}
        />
      )}
    </div>
  );
}

function LibraryPane({ onNavigate }: { onNavigate?: () => void }) {
  const maps = useAppStore((s) => s.maps);
  const notes = useAppStore((s) => s.notes);
  const noteFolders = useAppStore((s) => s.noteFolders);
  const mapFolders = useAppStore((s) => s.mapFolders);
  const folderStats = useAppStore((s) => s.folderStats);
  const vaultSettings = useAppStore((s) => s.vaultSettings);
  const updateVaultSettings = useAppStore((s) => s.updateVaultSettings);
  const reorderLibraryFolder = useAppStore((s) => s.reorderLibraryFolder);
  const moveLibraryFolder = useAppStore((s) => s.moveLibraryFolder);
  const activeMapPath = useAppStore((s) => s.activeMapPath);
  const activeNotePath = useAppStore((s) => s.activeNotePath);
  const view = useAppStore((s) => s.view);
  const openMap = useAppStore((s) => s.openMap);
  const openNote = useAppStore((s) => s.openNote);
  const openCreateDialog = useAppStore((s) => s.openCreateDialog);
  const archiveItem = useAppStore((s) => s.archiveItem);
  const deleteItem = useAppStore((s) => s.deleteItem);
  const archiveFolder = useAppStore((s) => s.archiveFolder);
  const deleteFolder = useAppStore((s) => s.deleteFolder);
  const renameItem = useAppStore((s) => s.renameItem);
  const renameFolder = useAppStore((s) => s.renameFolder);
  const moveItem = useAppStore((s) => s.moveItem);
  const toggleFavoritePath = useAppStore((s) => s.toggleFavoritePath);
  const expandedFolders = useAppStore((s) => s.expandedFolders);
  const toggleFolder = useAppStore((s) => s.toggleFolder);
  const setNavMode = useAppStore((s) => s.setNavMode);
  const requestConfirm = useAppStore((s) => s.requestConfirm);
  const { menu, openMenu, closeMenu } = useContextMenu();

  const [dragging, setDragging] = useState<DragPayload | null>(null);
  const [draggingFolder, setDraggingFolder] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [libraryQuery, setLibraryQuery] = useState("");
  /** Survives HTML5 DnD quirks where getData() is empty outside drop in some browsers. */
  const dragRef = useRef<
    | { type: "entry"; payload: DragPayload }
    | { type: "folder"; path: string }
    | null
  >(null);
  const suppressFolderClickRef = useRef(false);

  const folderSort: LibraryFolderSort =
    vaultSettings.libraryFolderSort ?? "alpha";
  const folderOrder = vaultSettings.libraryFolderOrder ?? [];

  const library = useMemo(() => {
    const notesBySlug = new Map<string, LibraryEntry[]>();
    for (const n of notes) {
      const slug = nodeNotesMapSlug(n.folder);
      if (!slug) continue;
      const list = notesBySlug.get(slug) ?? [];
      list.push({ ...n, kind: "note" });
      notesBySlug.set(slug, list);
    }

    const consumedNotePaths = new Set<string>();
    const bundlesByParent = new Map<string, MapNoteBundle[]>();
    const bundledMapPaths = new Set<string>();

    const attachNotes = (m: (typeof maps)[number], attached: LibraryEntry[]) => {
      for (const note of attached) consumedNotePaths.add(note.path);
      attached.sort(sortEntries);
      const parent = m.folder;
      const list = bundlesByParent.get(parent) ?? [];
      list.push({
        map: { ...m, kind: "map" },
        notes: attached,
        expandKey: `map-notes:${m.path}`,
      });
      bundlesByParent.set(parent, list);
      bundledMapPaths.add(m.path);
    };

    for (const m of maps) {
      const slug = slugify(m.name);
      const attached = notesBySlug.get(slug);
      if (!attached?.length) continue;
      notesBySlug.delete(slug);
      attachNotes(m, attached);
    }

    for (const m of maps) {
      if (bundledMapPaths.has(m.path)) continue;
      const base = m.name.replace(/-\d+$/, "");
      if (!base || base === m.name) continue;
      const slug = slugify(base);
      const attached = notesBySlug.get(slug);
      if (!attached?.length) continue;
      notesBySlug.delete(slug);
      attachNotes(m, attached);
    }

    for (const list of bundlesByParent.values()) {
      list.sort((a, b) => a.map.name.localeCompare(b.map.name));
    }

    const folders = new Map<string, LibraryEntry[]>();
    const rootItems: LibraryEntry[] = [];

    const place = (entry: LibraryEntry) => {
      if (!entry.folder) rootItems.push(entry);
      else {
        const list = folders.get(entry.folder) ?? [];
        list.push(entry);
        folders.set(entry.folder, list);
      }
    };

    for (const m of maps) {
      if (bundledMapPaths.has(m.path)) continue;
      if (isConceptGraphMap(m.name, m.folder)) continue;
      place({ ...m, kind: "map" });
    }

    for (const n of notes) {
      if (consumedNotePaths.has(n.path)) continue;
      if (nodeNotesMapSlug(n.folder)) continue;
      if (isJournalFolder(n.folder)) continue;
      if (isTagNotesPath(n.folder)) continue;
      place({ ...n, kind: "note" });
    }

    // Orphan node-notes stay out of the visible library tree.
    void notesBySlug;

    for (const folder of [...mapFolders, ...noteFolders]) {
      if (folder === NODE_NOTES_ROOT || folder.startsWith(`${NODE_NOTES_ROOT}/`)) {
        continue;
      }
      if (isTagNotesPath(folder)) continue;
      if (isJournalFolder(folder)) continue;
      if (folder === "journals" || folder.startsWith("journals/")) continue;
      if (!folders.has(folder)) folders.set(folder, []);
    }

    rootItems.sort(sortEntries);
    for (const list of folders.values()) list.sort(sortEntries);

    const tree = sortFolderNodes(
      buildFolderTree(folders.keys(), folders, bundlesByParent),
      folderSort,
      folderStats,
      folderOrder,
    );

    return {
      rootItems,
      rootBundles: bundlesByParent.get("") ?? [],
      folderTree: tree,
    };
  }, [
    maps,
    notes,
    mapFolders,
    noteFolders,
    folderSort,
    folderStats,
    folderOrder,
  ]);

  const filteredLibrary = useMemo(() => {
    if (!libraryQuery.trim()) return library;
    return {
      rootItems: filterLibraryEntries(library.rootItems, libraryQuery),
      rootBundles: filterLibraryBundles(library.rootBundles, libraryQuery),
      folderTree: filterFolderTree(library.folderTree, libraryQuery),
    };
  }, [library, libraryQuery]);

  const recentEntries = useMemo(() => {
    if (libraryQuery.trim()) return [];
    const recents = vaultSettings.recentPaths ?? [];
    if (recents.length === 0) return [];
    const known = new Set([
      ...maps.map((m) => m.path),
      ...notes.map((n) => n.path),
    ]);
    return recents.filter((r) => known.has(r.path)).slice(0, RECENT_PATHS_MAX);
  }, [vaultSettings.recentPaths, maps, notes, libraryQuery]);

  const favoritePaths = vaultSettings.favoritePaths ?? [];

  const openEntryMenu = (
    e: React.MouseEvent,
    kind: "map" | "note",
    path: string,
    name: string,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const isFavorite = favoritePaths.includes(path);
    openMenu(e.clientX, e.clientY, [
      {
        label: "Open",
        onClick: () => {
          if (kind === "map") void openMap(path);
          else void openNote(path);
          setNavMode("library");
        },
      },
      {
        label: isFavorite ? "Remove from favorites" : "Add to favorites",
        onClick: () => void toggleFavoritePath(path),
      },
      {
        label: "Rename…",
        onClick: () => {
          const next = window.prompt("New name", name)?.trim();
          if (next && next !== name) void renameItem(kind, path, next);
        },
      },
      {
        label: "Archive",
        onClick: () => {
          void requestConfirm({
            title: "Archive item",
            message: `Archive “${name}”?`,
          }).then((ok) => {
            if (ok) void archiveItem(kind, path);
          });
        },
      },
      {
        label: "Delete",
        danger: true,
        onClick: () => {
          void requestConfirm({
            title: "Delete item",
            message: `Permanently delete “${name}”?`,
            confirmLabel: "Delete",
            danger: true,
          }).then((ok) => {
            if (ok) void deleteItem(kind, path);
          });
        },
      },
    ]);
  };

  const openFolderMenu = (e: React.MouseEvent, folder: string) => {
    e.preventDefault();
    e.stopPropagation();
    const folderName = folderSegmentName(folder);
    openMenu(e.clientX, e.clientY, [
      {
        label: "Rename…",
        onClick: () => {
          const next = window.prompt("New folder name", folderName)?.trim();
          if (next && next !== folderName) void renameFolder(folder, next);
        },
      },
      {
        label: "Archive",
        onClick: () => {
          void requestConfirm({
            title: "Archive folder",
            message: `Archive folder “${folder}” and everything inside it?`,
          }).then((ok) => {
            if (ok) void archiveFolder(folder);
          });
        },
      },
      {
        label: "Delete",
        danger: true,
        onClick: () => {
          void requestConfirm({
            title: "Delete folder",
            message: `Permanently delete folder “${folder}” and everything inside it?`,
            confirmLabel: "Delete",
            danger: true,
          }).then((ok) => {
            if (ok) void deleteFolder(folder);
          });
        },
      },
    ]);
  };

  const onDragStart = (
    e: React.DragEvent,
    kind: "map" | "note",
    path: string,
  ) => {
    const payload: DragPayload = { kind, path };
    e.dataTransfer.setData(DND_MIME, JSON.stringify(payload));
    e.dataTransfer.setData("text/plain", `entry:${kind}:${path}`);
    e.dataTransfer.effectAllowed = "move";
    dragRef.current = { type: "entry", payload };
    setDragging(payload);
    setDraggingFolder(null);
  };

  const onFolderDragStart = (e: React.DragEvent, path: string) => {
    e.stopPropagation();
    // Some webviews only keep text/plain during the drag lifecycle.
    e.dataTransfer.setData(FOLDER_DND_MIME, JSON.stringify({ path }));
    e.dataTransfer.setData("text/plain", `folder:${path}`);
    e.dataTransfer.effectAllowed = "move";
    dragRef.current = { type: "folder", path };
    suppressFolderClickRef.current = true;
    // Do not set React state here. In WebKit, changing the draggable source's
    // ancestor subtree during dragstart immediately cancels the native drag.
    // dragRef is synchronous and all drop handlers read from it.
  };

  const onDragEnd = () => {
    const wasFolder = dragRef.current?.type === "folder";
    // In Tauri/WebKit, dragend can fire before drop — keep payload briefly.
    window.setTimeout(() => {
      dragRef.current = null;
      setDragging(null);
      setDraggingFolder(null);
      setDropTarget(null);
      if (wasFolder) {
        window.setTimeout(() => {
          suppressFolderClickRef.current = false;
        }, 0);
      }
    }, 80);
  };

  const activeEntryDrag = (): DragPayload | null => {
    if (dragRef.current?.type === "entry") return dragRef.current.payload;
    return dragging;
  };

  const activeFolderDrag = (): string | null => {
    if (dragRef.current?.type === "folder") return dragRef.current.path;
    return draggingFolder;
  };

  const acceptEntryDrop = (e: React.DragEvent, folder: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (activeFolderDrag() || readFolderPayload(e)) return;
    const payload = readPayload(e) ?? activeEntryDrag();
    setDropTarget(null);
    if (!payload) return;
    void moveItem(payload.kind, payload.path, folder);
  };

  /** Nest dragged folder inside targetPath. */
  const acceptFolderNest = (e: React.DragEvent, targetPath: string) => {
    e.preventDefault();
    e.stopPropagation();
    const folderPath =
      readFolderPayload(e)?.path ?? activeFolderDrag() ?? null;
    setDropTarget(null);
    if (!folderPath || folderPath === targetPath) return;
    if (isFolderUnder(targetPath, folderPath)) return;
    if (parentFolderPath(folderPath) === targetPath) return;
    void moveLibraryFolder(folderPath, targetPath);
  };

  /**
   * Place dragged folder before/after target at the target's level
   * (moves out of / into that parent as needed, then reorders).
   */
  const acceptFolderPlace = (
    e: React.DragEvent,
    targetPath: string,
    place: "before" | "after",
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const folderPath =
      readFolderPayload(e)?.path ?? activeFolderDrag() ?? null;
    setDropTarget(null);
    if (!folderPath || folderPath === targetPath) return;
    if (isFolderUnder(targetPath, folderPath)) return;

    const destParent = parentFolderPath(targetPath);
    void (async () => {
      let path = folderPath;
      if (parentFolderPath(path) !== destParent) {
        const moved = await moveLibraryFolder(path, destParent);
        if (!moved) return;
        path = moved;
      }
      // Target path is unchanged (we didn't move the target).
      await reorderLibraryFolder(path, targetPath, place);
    })();
  };

  const allowFolderNestOver = (e: React.DragEvent, targetPath: string) => {
    const folderPath = activeFolderDrag();
    if (!folderPath) return false;
    if (folderPath === targetPath) return false;
    if (isFolderUnder(targetPath, folderPath)) return false;
    if (parentFolderPath(folderPath) === targetPath) return false;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    const targetId = `into:${targetPath}`;
    if (dropTarget !== targetId) setDropTarget(targetId);
    return true;
  };

  const allowFolderPlaceOver = (
    e: React.DragEvent,
    targetPath: string,
    place: "before" | "after",
  ) => {
    const folderPath = activeFolderDrag();
    if (!folderPath) return false;
    if (folderPath === targetPath) return false;
    if (isFolderUnder(targetPath, folderPath)) return false;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    const targetId = `${place}:${targetPath}`;
    if (dropTarget !== targetId) setDropTarget(targetId);
    return true;
  };

  const allowDragOver = (
    e: React.DragEvent,
    targetId: string,
    expandKey?: string,
    opts?: {
      /** Drop onto this library folder to move an item into it. */
      folderPath?: string;
      /** Drop onto library root (move item / folder to root). */
      root?: boolean;
      /** Move item into this folder path (e.g. same folder as a hovered entry). */
      destFolder?: string;
    },
  ) => {
    const folderPath = activeFolderDrag();
    if (folderPath) {
      // Folder → library root (un-nest). Always allow highlight while dragging.
      if (opts?.root) {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "move";
        if (dropTarget !== targetId) setDropTarget(targetId);
      }
      return;
    }

    const entry = activeEntryDrag();
    if (!entry) return;

    const canMove =
      opts?.root === true ||
      opts?.folderPath !== undefined ||
      opts?.destFolder !== undefined;
    if (!canMove) return;

    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    if (dropTarget !== targetId) setDropTarget(targetId);
    if (expandKey && !isFolderOpen(expandedFolders, expandKey)) {
      useAppStore.setState((s) => ({
        expandedFolders: { ...s.expandedFolders, [expandKey]: true },
      }));
    }
  };

  const clearDropIfLeaving = (e: React.DragEvent, targetId: string) => {
    const related = e.relatedTarget as Node | null;
    if (related && (e.currentTarget as Node).contains(related)) return;
    if (dropTarget === targetId) setDropTarget(null);
  };

  const setFolderSort = (mode: LibraryFolderSort) => {
    setSortMenuOpen(false);
    void updateVaultSettings({ libraryFolderSort: mode });
  };

  const renderEntry = (entry: LibraryEntry, _depth = 0) => {
    const active =
      entry.kind === "map"
        ? activeMapPath === entry.path && view === "map"
        : activeNotePath === entry.path && view === "note";
    const targetId = `entry-dest:${entry.path}`;
    const isRootDest = !entry.folder;
    return (
      <button
        key={entry.path}
        type="button"
        draggable
        className={`sidebar-item entry-${entry.kind} droppable ${active ? "active" : ""} ${dragging?.path === entry.path ? "dragging-item" : ""} ${dropTarget === targetId ? "drop-target" : ""}`}
        onClick={() => {
          if (entry.kind === "map") void openMap(entry.path);
          else void openNote(entry.path);
          setNavMode("library");
          onNavigate?.();
        }}
        onContextMenu={(e) =>
          openEntryMenu(e, entry.kind, entry.path, entry.name)
        }
        onDragStart={(e) => onDragStart(e, entry.kind, entry.path)}
        onDragEnd={onDragEnd}
        onDragOver={(e) =>
          allowDragOver(e, targetId, undefined, {
            destFolder: entry.folder,
            root: isRootDest,
          })
        }
        onDragLeave={(e) => clearDropIfLeaving(e, targetId)}
        onDrop={(e) => acceptEntryDrop(e, entry.folder)}
        title={
          activeEntryDrag()
            ? isRootDest
              ? "Drop to move to library root"
              : `Drop to move into ${entry.folder}`
            : undefined
        }
      >
        <span className={`entry-icon ${entry.kind}`} aria-hidden>
          {entry.kind === "map" ? <MapIcon /> : <NoteIcon />}
        </span>
        <span className="entry-name">{entry.name}</span>
      </button>
    );
  };

  const renderMapBundle = (bundle: MapNoteBundle, _depth = 0) => {
    const open = isFolderOpen(expandedFolders, bundle.expandKey);
    const active = activeMapPath === bundle.map.path && view === "map";
    const targetId = `bundle-dest:${bundle.map.path}`;
    const destFolder = bundle.map.folder;
    return (
      <div key={bundle.expandKey} className="folder-block map-note-bundle">
        <div
          className={`sidebar-item folder-item map-folder entry-map droppable ${active ? "active" : ""} ${dragging?.path === bundle.map.path ? "dragging-item" : ""} ${dropTarget === targetId ? "drop-target" : ""}`}
          draggable
          onDragStart={(e) => onDragStart(e, "map", bundle.map.path)}
          onDragEnd={onDragEnd}
          onContextMenu={(e) =>
            openEntryMenu(e, "map", bundle.map.path, bundle.map.name)
          }
          onDragOver={(e) =>
            allowDragOver(e, targetId, undefined, {
              destFolder,
              root: !destFolder,
            })
          }
          onDragLeave={(e) => clearDropIfLeaving(e, targetId)}
          onDrop={(e) => acceptEntryDrop(e, destFolder)}
        >
          <button
            type="button"
            className={`folder-chevron ${open ? "open" : ""}`}
            title={open ? "Collapse notes" : "Expand notes"}
            aria-label={open ? "Collapse notes" : "Expand notes"}
            onClick={(e) => {
              e.stopPropagation();
              toggleFolder(bundle.expandKey);
            }}
          >
            <ChevronIcon />
          </button>
          <button
            type="button"
            className="map-folder-open"
            onClick={() => {
              void openMap(bundle.map.path);
              setNavMode("library");
              onNavigate?.();
            }}
          >
            <span className="entry-icon map" aria-hidden>
              <MapIcon />
            </span>
            <span className="entry-name">{bundle.map.name}</span>
          </button>
        </div>
        {open && (
          <div className="bundle-children">
            {bundle.notes.map((note) => renderEntry(note, _depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const renderFolderInsert = (
    targetPath: string,
    place: "before" | "after",
    _depth: number,
  ) => {
    const targetId = `${place}:${targetPath}`;
    const active = dropTarget === targetId;
    return (
      <div
        key={targetId}
        className={`folder-insert-zone ${active ? "active" : ""}`}
        onDragOver={(e) => allowFolderPlaceOver(e, targetPath, place)}
        onDragLeave={(e) => clearDropIfLeaving(e, targetId)}
        onDrop={(e) => acceptFolderPlace(e, targetPath, place)}
        title={
          place === "before"
            ? "Drop to place above this folder"
            : "Drop to place below this folder"
        }
      />
    );
  };

  const renderFolderSiblings = (nodes: FolderNode[], depth: number) => {
    if (nodes.length === 0) return null;
    const last = nodes[nodes.length - 1]!;
    return (
      <>
        {nodes.map((node) => (
          <div key={`wrap:${node.path}`}>
            {renderFolderInsert(node.path, "before", depth)}
            {renderFolderNode(node, depth)}
          </div>
        ))}
        {renderFolderInsert(last.path, "after", depth)}
      </>
    );
  };

  const renderFolderNode = (node: FolderNode, depth = 0) => {
    const open = isFolderOpen(expandedFolders, node.path);
    const itemTargetId = `folder-items:${node.path}`;
    const empty =
      node.items.length === 0 &&
      node.bundles.length === 0 &&
      node.children.length === 0;
    const folderDrag = activeFolderDrag();
    const nesting =
      !!folderDrag &&
      dropTarget === `into:${node.path}` &&
      folderDrag !== node.path &&
      !isFolderUnder(node.path, folderDrag);

    return (
      <div className="folder-block">
        <div
          className={`sidebar-item folder-item entry-folder droppable ${draggingFolder === node.path ? "dragging-item" : ""} ${nesting ? "folder-reorder-into" : ""} ${!folderDrag && dropTarget === itemTargetId ? "drop-target" : ""}`}
          onContextMenu={(e) => openFolderMenu(e, node.path)}
          onDragOver={(e) => {
            if (allowFolderNestOver(e, node.path)) return;
            allowDragOver(e, itemTargetId, node.path, {
              folderPath: node.path,
            });
          }}
          onDragLeave={(e) => {
            clearDropIfLeaving(e, `into:${node.path}`);
            clearDropIfLeaving(e, itemTargetId);
          }}
          onDrop={(e) => {
            if (activeFolderDrag() || readFolderPayload(e)) {
              acceptFolderNest(e, node.path);
              return;
            }
            acceptEntryDrop(e, node.path);
          }}
        >
          <button
            type="button"
            className={`folder-chevron ${open ? "open" : ""}`}
            title={open ? "Collapse folder" : "Expand folder"}
            aria-label={open ? "Collapse folder" : "Expand folder"}
            onClick={(e) => {
              e.stopPropagation();
              if (suppressFolderClickRef.current) return;
              toggleFolder(node.path);
            }}
          >
            <ChevronIcon />
          </button>
          <button
            type="button"
            className="folder-label-btn"
            onClick={() => {
              if (suppressFolderClickRef.current) return;
              toggleFolder(node.path);
            }}
          >
            <span className="entry-icon folder" aria-hidden>
              <FolderIcon />
            </span>
            <span className="entry-name">{node.name}</span>
          </button>
          <span
            className="folder-drag-handle"
            draggable
            title="Drag to nest or reorder"
            onDragStart={(e) => onFolderDragStart(e, node.path)}
            onDragEnd={onDragEnd}
            onClick={(e) => e.stopPropagation()}
          >
            ⋮⋮
          </span>
        </div>
        {open &&
          (empty ? (
            <p className="sidebar-empty hint">Empty folder</p>
          ) : (
            <div className="folder-children">
              {node.items.map((entry) => renderEntry(entry, depth + 1))}
              {node.bundles.map((bundle) =>
                renderMapBundle(bundle, depth + 1),
              )}
              {renderFolderSiblings(node.children, depth + 1)}
            </div>
          ))}
      </div>
    );
  };

  const sortLabel =
    SORT_OPTIONS.find((o) => o.id === folderSort)?.label ?? "Alphabetical";

  const folderDrag = activeFolderDrag();
  const showRootDrop = !!activeEntryDrag() || !!folderDrag;

  return (
    <div className="nav-pane library-pane">
      <div className="nav-pane-header">
        <span>Library</span>
        <div className="nav-pane-actions">
          <NavHidePanelButton />
          <div className="library-sort">
            <button
              type="button"
              className="icon-btn small"
              title={`Sort folders: ${sortLabel}`}
              aria-label={`Sort folders: ${sortLabel}`}
              aria-haspopup="menu"
              aria-expanded={sortMenuOpen}
              onClick={() => setSortMenuOpen((v) => !v)}
            >
              <SortIcon />
            </button>
            {sortMenuOpen && (
              <div className="library-sort-menu" role="menu">
                {SORT_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={folderSort === opt.id}
                    className={folderSort === opt.id ? "active" : ""}
                    onClick={() => setFolderSort(opt.id)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            className="icon-btn small"
            title="New folder"
            aria-label="New folder"
            onClick={() => openCreateDialog("folder")}
          >
            <NewFolderIcon />
          </button>
          <button
            type="button"
            className="icon-btn small"
            title="New map or note"
            aria-label="New map or note"
            onClick={() => openCreateDialog("choose")}
          >
            <PlusIcon />
          </button>
        </div>
      </div>

      <div className="nav-pane-body">
        <input
          className="nav-search-input"
          value={libraryQuery}
          placeholder="Search library…"
          aria-label="Search library"
          onChange={(e) => setLibraryQuery(e.target.value)}
        />
        {recentEntries.length > 0 && (
          <div className="library-recent">
            <div className="library-recent-header hint">Recent</div>
            <div className="sidebar-list">
              {recentEntries.map((entry) => {
                const active =
                  entry.kind === "map"
                    ? activeMapPath === entry.path && view === "map"
                    : activeNotePath === entry.path && view === "note";
                return (
                  <button
                    key={`recent:${entry.path}`}
                    type="button"
                    className={`sidebar-item entry-${entry.kind} ${active ? "active" : ""}`}
                    onClick={() => {
                      if (entry.kind === "map") void openMap(entry.path);
                      else void openNote(entry.path);
                      setNavMode("library");
                      onNavigate?.();
                    }}
                  >
                    <span className={`entry-icon ${entry.kind}`} aria-hidden>
                      {entry.kind === "map" ? <MapIcon /> : <NoteIcon />}
                    </span>
                    <span className="entry-name">{entry.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {/* Keep root-drop / hint always mounted. Conditionally inserting them
            on dragstart remounts siblings under the drag source and cancels
            the native drag in WebKit/Tauri. */}
        <div
          className={`library-root-drop droppable ${dropTarget === "library-root" ? "drop-target" : ""} ${showRootDrop ? "is-active" : ""}`}
          onDragOver={(e) =>
            allowDragOver(e, "library-root", undefined, { root: true })
          }
          onDragLeave={(e) => clearDropIfLeaving(e, "library-root")}
          onDrop={(e) => {
            const draggedFolder =
              readFolderPayload(e)?.path ?? activeFolderDrag();
            if (draggedFolder) {
              e.preventDefault();
              e.stopPropagation();
              setDropTarget(null);
              if (parentFolderPath(draggedFolder)) {
                void moveLibraryFolder(draggedFolder, "");
              }
              return;
            }
            acceptEntryDrop(e, "");
          }}
        >
          {folderDrag
            ? "Drop here to move folder to library root"
            : "Drop here to move to library root"}
        </div>
        <p className="library-sort-hint hint">
          Drag onto a folder to nest it, onto the lines between folders to
          place above/below, or onto the root drop zone to move out.
        </p>
        <div
          className={`sidebar-list ${folderDrag ? "dragging-folder" : ""} ${dragging ? "dragging-entry" : ""}`}
        >
          {libraryQuery.trim() &&
            filteredLibrary.rootItems.length === 0 &&
            filteredLibrary.rootBundles.length === 0 &&
            filteredLibrary.folderTree.length === 0 && (
              <p className="sidebar-empty hint">No matches.</p>
            )}
          {filteredLibrary.rootItems.map((entry) => renderEntry(entry))}
          {filteredLibrary.rootBundles.map((bundle) => renderMapBundle(bundle))}
          {renderFolderSiblings(filteredLibrary.folderTree, 0)}
        </div>
      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menu.items}
          onClose={closeMenu}
        />
      )}
    </div>
  );
}

export function Sidebar({
  forceExpanded = false,
  onNavigate,
}: {
  forceExpanded?: boolean;
  onNavigate?: () => void;
}) {
  const navMode = useAppStore((s) => s.navMode);
  const setNavMode = useAppStore((s) => s.setNavMode);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const setSidebarCollapsed = useAppStore((s) => s.setSidebarCollapsed);
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed);

  const collapsed = sidebarCollapsed && !forceExpanded;

  const selectMode = (mode: NavMode) => {
    setNavMode(mode);
    if (collapsed) setSidebarCollapsed(false);
  };

  return (
    <aside
      className={`sidebar ${collapsed ? "collapsed" : ""}`}
      style={
        {
          "--nav-rail-width": `${NAV_RAIL_WIDTH}px`,
        } as React.CSSProperties
      }
    >
      <NavRail
        navMode={navMode}
        collapsed={collapsed}
        forceExpanded={forceExpanded}
        onSelectMode={selectMode}
        onToggleCollapse={toggleSidebar}
      />
      {!collapsed && (
        <div className="nav-content">
          {navMode === "journal" && <JournalPane onNavigate={onNavigate} />}
          {navMode === "favorites" && <FavoritesPane onNavigate={onNavigate} />}
          {navMode === "library" && <LibraryPane onNavigate={onNavigate} />}
          {navMode === "tags" && <TagsBrowser onNavigate={onNavigate} />}
        </div>
      )}
    </aside>
  );
}
