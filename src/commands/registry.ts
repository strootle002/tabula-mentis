import { THEMES } from "../settings/themes";
import { SELECTABLE_LAYOUTS } from "../mindmap/layoutCatalog";
import type { AppState } from "../store/storeTypes";
import type { AppCommand } from "./types";
import {
  exportActiveMapCsv,
  exportActiveMapFreeplane,
  exportActiveMapJson,
  exportActiveMapOpml,
  exportActiveMapOutlineHtml,
  exportActiveMapPngFull,
  exportActiveMapPngViewport,
  exportActiveMapVisualHtml,
  exportActiveNoteHtml,
} from "./exportActions";

const hasMap = (s: AppState) => !!s.activeMap;
const inMapView = (s: AppState) => s.view === "map" && !!s.activeMap;
const inNoteView = (s: AppState) => s.view === "note" && !!s.activeNotePath;

const STATIC_COMMANDS: AppCommand[] = [
  {
    id: "new-map",
    title: "New mindmap",
    section: "File",
    keywords: ["create", "map"],
    run: (s) => s.openCreateDialog("map"),
  },
  {
    id: "new-note",
    title: "New note",
    section: "File",
    keywords: ["create"],
    run: (s) => s.openCreateDialog("note"),
  },
  {
    id: "import",
    title: "Import file…",
    section: "File",
    keywords: ["csv", "txt", "json", "opml", "freeplane"],
    run: (s) => s.setImportOpen(true),
  },
  {
    id: "switch-vault",
    title: "Switch vault…",
    section: "File",
    keywords: ["open", "folder"],
    run: (s) => s.openVault(),
  },
  {
    id: "save-map-template",
    title: "Save map as template…",
    section: "File",
    keywords: ["reuse", "starter"],
    when: hasMap,
    run: (s) => {
      const name = window
        .prompt("Template name", s.activeMap?.title ?? "Template")
        ?.trim();
      if (name) void s.saveActiveMapAsTemplate(name);
    },
  },
  {
    id: "save-note-template",
    title: "Save note as template…",
    section: "File",
    keywords: ["reuse", "starter"],
    when: inNoteView,
    run: (s) => {
      const name = window
        .prompt("Template name", s.activeNoteName ?? "Template")
        ?.trim();
      if (name) void s.saveActiveNoteAsTemplate(name);
    },
  },
  {
    id: "export-json",
    title: "Export map as JSON",
    section: "Export",
    when: hasMap,
    run: exportActiveMapJson,
  },
  {
    id: "export-csv",
    title: "Export map as CSV",
    section: "Export",
    when: hasMap,
    run: exportActiveMapCsv,
  },
  {
    id: "export-freeplane",
    title: "Export map as Freeplane (.mm)",
    section: "Export",
    when: hasMap,
    run: exportActiveMapFreeplane,
  },
  {
    id: "export-opml",
    title: "Export map as OPML",
    section: "Export",
    when: hasMap,
    run: exportActiveMapOpml,
  },
  {
    id: "export-png-full",
    title: "Export PNG (full map)",
    section: "Export",
    keywords: ["image"],
    when: inMapView,
    run: exportActiveMapPngFull,
  },
  {
    id: "export-png-viewport",
    title: "Export PNG (viewport)",
    section: "Export",
    keywords: ["image"],
    when: inMapView,
    run: exportActiveMapPngViewport,
  },
  {
    id: "export-note-html",
    title: "Export note as HTML",
    section: "Export",
    when: inNoteView,
    run: exportActiveNoteHtml,
  },
  {
    id: "export-map-html",
    title: "Export map as HTML (visual)",
    section: "Export",
    when: hasMap,
    run: exportActiveMapVisualHtml,
  },
  {
    id: "export-map-outline-html",
    title: "Export map outline as HTML",
    section: "Export",
    when: hasMap,
    run: exportActiveMapOutlineHtml,
  },
  {
    id: "undo",
    title: "Undo",
    section: "Edit",
    keywords: ["ctrl+z"],
    when: (s) => !!s.activeMap && s.mapHistory.length > 0,
    run: (s) => s.undo(),
  },
  {
    id: "redo",
    title: "Redo",
    section: "Edit",
    keywords: ["ctrl+shift+z"],
    when: (s) => !!s.activeMap && s.mapFuture.length > 0,
    run: (s) => s.redo(),
  },
  {
    id: "edit-history",
    title: "Open edit history",
    section: "Edit",
    when: hasMap,
    run: (s) => s.openHistory(),
  },
  {
    id: "add-child",
    title: "Add child node",
    section: "Edit",
    keywords: ["ctrl+t"],
    when: inMapView,
    run: (s) => s.addChildToSelected(),
  },
  {
    id: "add-sibling",
    title: "Add sibling node",
    section: "Edit",
    keywords: ["ctrl+enter"],
    when: inMapView,
    run: (s) => s.addSiblingToSelected(),
  },
  {
    id: "focus-selected",
    title: "Focus selected node",
    section: "View",
    keywords: ["zoom", "center"],
    when: (s) => inMapView(s) && !!s.selectedNodeId,
    run: (s) => s.focusSelectedNode(),
  },
  {
    id: "save-active",
    title: "Save now",
    section: "File",
    keywords: ["ctrl+s", "persist"],
    when: (s) => (s.view === "map" && !!s.activeMap) || inNoteView(s),
    run: async (s) => {
      if (s.view === "note") await s.saveActiveNote();
      else await s.saveActiveMap();
    },
  },
  {
    id: "toggle-sidebar",
    title: "Toggle navigation sidebar",
    section: "View",
    keywords: ["hide", "show", "panel"],
    run: (s) => s.toggleSidebar(),
  },
  {
    id: "toggle-node-panel",
    title: "Toggle node panel",
    section: "View",
    keywords: ["ctrl+n"],
    when: (s) => s.view === "map",
    run: (s) => s.toggleNodePanel(),
  },
  {
    id: "toggle-note-aside",
    title: "Toggle note panel",
    section: "View",
    when: (s) => s.view === "note",
    run: (s) => s.toggleNoteAside(),
  },
  {
    id: "toggle-minimap",
    title: "Toggle minimap",
    section: "View",
    when: (s) => s.view === "map",
    run: (s) => s.toggleMinimap(),
  },
  {
    id: "toggle-snap",
    title: "Toggle snap to grid",
    section: "View",
    keywords: ["align"],
    when: (s) => s.view === "map",
    run: (s) => s.toggleSnapToGrid(),
  },
  {
    id: "presentation-mode",
    title: "Toggle presentation mode",
    section: "View",
    keywords: ["f5", "fullscreen", "present"],
    when: (s) =>
      s.presentationMode || s.view === "map" || s.view === "note",
    run: (s) => s.togglePresentationMode(),
  },
  {
    id: "open-settings",
    title: "Open preferences",
    section: "Settings",
    keywords: ["settings", "options"],
    run: (s) => s.openSettings(),
  },
  {
    id: "open-shortcuts",
    title: "Open keyboard shortcuts",
    section: "Settings",
    keywords: ["keys", "hotkeys", "help"],
    run: (s) => s.openShortcuts(),
  },
  {
    id: "open-about",
    title: "About Mindmap",
    section: "Settings",
    run: (s) => s.openAbout(),
  },
];

/** Commands shown when the palette opens with an empty query. */
export const COMMON_COMMAND_IDS = [
  "new-map",
  "new-note",
  "save-active",
  "toggle-sidebar",
  "switch-vault",
  "open-settings",
  "open-shortcuts",
];

export function buildCommands(state: AppState): AppCommand[] {
  const dynamic: AppCommand[] = [
    ...THEMES.map((t) => ({
      id: `theme:${t.id}`,
      title: `Theme: ${t.name}`,
      section: "Theme",
      keywords: [t.group, "color", "appearance"],
      when: (s: AppState) => s.themeId !== t.id,
      run: (s: AppState) => s.setTheme(t.id),
    })),
    ...SELECTABLE_LAYOUTS.map((l) => ({
      id: `layout:${l.id}`,
      title: `Layout: ${l.label}`,
      section: "Style",
      keywords: ["map", "arrange"],
      when: (s: AppState) => s.view === "map",
      run: (s: AppState) => s.setMapLayoutStyle(l.id),
    })),
  ];
  return [...STATIC_COMMANDS, ...dynamic].filter((c) => !c.when || c.when(state));
}

function haystack(command: AppCommand): string {
  return [command.title, command.section, ...(command.keywords ?? [])]
    .join(" ")
    .toLowerCase();
}

/** Case-insensitive word matching over title, section, and keywords. */
export function filterCommands(
  commands: AppCommand[],
  query: string,
): AppCommand[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return commands;
  const scored: { command: AppCommand; score: number }[] = [];
  for (const command of commands) {
    const text = haystack(command);
    if (!words.every((word) => text.includes(word))) continue;
    // Earlier title matches rank above keyword/section hits.
    const title = command.title.toLowerCase();
    const first = words[0];
    const score = title.startsWith(first)
      ? 0
      : title.includes(first)
        ? 1
        : 2;
    scored.push({ command, score });
  }
  return scored
    .sort((a, b) => a.score - b.score || a.command.title.localeCompare(b.command.title))
    .map((s) => s.command);
}
