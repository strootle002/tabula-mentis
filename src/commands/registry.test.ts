import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/plugin-store", () => ({
  getStore: vi.fn(async () => ({
    get: vi.fn(async () => null),
    set: vi.fn(),
    save: vi.fn(),
  })),
}));

import { createStore } from "zustand/vanilla";
import { createAppState } from "../store/appStore";
import { THEMES } from "../settings/themes";
import { SELECTABLE_LAYOUTS } from "../mindmap/layoutCatalog";
import {
  buildCommands,
  COMMON_COMMAND_IDS,
  filterCommands,
} from "./registry";

function makeState() {
  return createStore(createAppState).getState();
}

describe("command registry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("offers creation and settings commands on the welcome screen", () => {
    const commands = buildCommands(makeState());
    const ids = commands.map((c) => c.id);
    expect(ids).toContain("new-map");
    expect(ids).toContain("new-note");
    expect(ids).toContain("open-settings");
    expect(ids).toContain("open-shortcuts");
  });

  it("hides map-only commands until a map is open", () => {
    const welcome = buildCommands(makeState()).map((c) => c.id);
    expect(welcome).not.toContain("export-json");
    expect(welcome).not.toContain("undo");

    const withMap = makeState();
    withMap.activeMap = {
      version: 1,
      title: "Map",
      root: { id: "r", text: "R", children: [] },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const ids = buildCommands(withMap).map((c) => c.id);
    expect(ids).toContain("export-json");
    expect(ids).toContain("save-map-template");
  });

  it("generates one command per theme and per selectable layout", () => {
    const commands = buildCommands(makeState());
    const themeIds = commands
      .filter((c) => c.id.startsWith("theme:"))
      .map((c) => c.id);
    // The active theme is hidden (running it would be a no-op).
    expect(themeIds).toHaveLength(THEMES.length - 1);

    const inMap = makeState();
    inMap.view = "map";
    const layoutIds = buildCommands(inMap)
      .filter((c) => c.id.startsWith("layout:"))
      .map((c) => c.id);
    expect(layoutIds).toHaveLength(SELECTABLE_LAYOUTS.length);
  });

  it("runs a command against the live store", () => {
    const store = createStore(createAppState);
    const command = buildCommands(store.getState()).find(
      (c) => c.id === "new-note",
    )!;
    void command.run(store.getState());
    expect(store.getState().createDialog).toEqual({ kind: "note" });
  });
});

describe("filterCommands", () => {
  const commands = buildCommands(makeState());

  it("matches on title, section, and keywords case-insensitively", () => {
    expect(filterCommands(commands, "NEW NOTE")[0]?.id).toBe("new-note");
    expect(
      filterCommands(commands, "hotkeys").some((c) => c.id === "open-shortcuts"),
    ).toBe(true);
    expect(
      filterCommands(commands, "theme dark").every((c) => c.section === "Theme"),
    ).toBe(true);
  });

  it("requires every query word to match", () => {
    expect(filterCommands(commands, "new zzz")).toEqual([]);
  });

  it("prefers title-prefix matches over keyword hits", () => {
    const withMap = makeState();
    withMap.activeMap = {
      version: 1,
      title: "Map",
      root: { id: "r", text: "R", children: [] },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const hits = filterCommands(buildCommands(withMap), "export");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.section).toBe("Export");
  });

  it("lists every common command as available by default", () => {
    const ids = new Set(commands.map((c) => c.id));
    for (const id of COMMON_COMMAND_IDS) {
      // save-active needs an open document; the rest are always available.
      if (id === "save-active") continue;
      expect(ids.has(id)).toBe(true);
    }
  });
});
