import { createStore } from "zustand/vanilla";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MindMapDocument, MindNode } from "../mindmap/types";

const fsMocks = vi.hoisted(() => ({
  loadMap: vi.fn(),
  saveNoteAtPath: vi.fn(),
}));

vi.mock("../vault/vaultFs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../vault/vaultFs")>()),
  loadMap: fsMocks.loadMap,
  saveNoteAtPath: fsMocks.saveNoteAtPath,
}));

vi.mock("@tauri-apps/plugin-store", () => ({
  getStore: vi.fn(async () => ({
    get: vi.fn(async () => null),
    set: vi.fn(),
    save: vi.fn(),
  })),
}));

import { createAppState } from "./appStore";
import { handleExternalPaths, rememberSavedMap } from "./storeServices";

const node = (id: string, note = "", text = id): MindNode => ({
  id,
  text,
  note,
  children: [],
});

const map = (root: MindNode, updatedAt = "2026-01-01T00:00:00.000Z"): MindMapDocument => ({
  version: 1,
  title: "Map",
  root,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt,
});

describe("app store slice composition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("composes every domain behind the public store state", () => {
    const state = createStore(createAppState).getState();
    expect([
      state.openVault,
      state.updateSelectedText,
      state.openTodayJournal,
      state.importFile,
      state.reloadExternalDocument,
      state.toggleSidebar,
    ].every((action) => typeof action === "function")).toBe(true);
  });

  it("flushes a dirty note before switching to a map", async () => {
    const events: string[] = [];
    const target = map(node("target"));
    fsMocks.loadMap.mockImplementation(async () => {
      events.push("load-map");
      return target;
    });
    const store = createStore(createAppState);
    store.setState({
      activeNotePath: "/vault/Notes/note.md",
      activeNoteContent: "dirty",
      dirtyNote: true,
      saveActiveNote: async () => {
        events.push("save-note");
        store.setState({ dirtyNote: false });
      },
    });

    await store.getState().openMap("/vault/Maps/target.map.json");

    expect(events).toEqual(["save-note", "load-map"]);
    expect(store.getState().activeMap).toMatchObject(target);
  });

  it("updates the active map tag index incrementally", () => {
    const store = createStore(createAppState);
    const active = map(node("root"));
    store.setState({
      activeMap: active,
      activeMapPath: "/vault/Maps/map.map.json",
      selectedNodeId: "root",
    });

    store.getState().updateNodeNote("root", "#incremental");

    expect(store.getState().mapTagsByPath).toEqual({
      "/vault/Maps/map.map.json": ["incremental", "root"],
    });
    expect(store.getState().mapNodeTags).toEqual(["incremental", "root"]);
  });

  it("surfaces the active map root as a hit for its own tag", async () => {
    const store = createStore(createAppState);
    const active = map(node("root-id", "", "My Project"));
    store.setState({
      vaultPath: "/vault",
      maps: [{ name: "Map", path: "/vault/maps/map.map.json", folder: "" }],
      activeMap: active,
      activeMapPath: "/vault/maps/map.map.json",
      noteIndex: [],
    });

    await store.getState().openTag("my-project");
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(store.getState().tagHits).toContainEqual(
      expect.objectContaining({
        source: "node",
        nodeId: "root-id",
        mapPath: "/vault/maps/map.map.json",
        line: "My Project",
      }),
    );
  });

  it("indexes a saved journal note without requiring concept-graph sync", async () => {
    const store = createStore(createAppState);
    store.setState({
      activeNotePath: "/vault/Notes/journals/Journal.md",
      activeNoteContent: "# Journal\n\n#concept",
      dirtyNote: true,
      notes: [{
        name: "Journal",
        path: "/vault/Notes/journals/Journal.md",
        folder: "journals",
      }],
    });

    await store.getState().saveActiveNote();

    expect(store.getState().noteIndex[0]).toMatchObject({
      name: "Journal",
      tags: ["concept"],
    });
    expect(store.getState().dirtyNote).toBe(false);
  });

  it("treats an equivalent external map write as a self-write acknowledgement", async () => {
    const store = createStore(createAppState);
    const active = map(node("root"), "2026-01-01T00:00:00.000Z");
    fsMocks.loadMap.mockResolvedValue(
      map(node("root"), "2026-01-02T00:00:00.000Z"),
    );
    store.setState({
      activeMap: active,
      activeMapPath: "/vault/Maps/map.map.json",
      dirtyMap: true,
    });

    await handleExternalPaths(
      ["/vault/Maps/map.map.json"],
      store.setState,
      store.getState,
    );

    expect(store.getState().dirtyMap).toBe(false);
    expect(store.getState().externalConflict).toBeNull();
    expect(store.getState().activeMap).toBe(active);
  });

  it("ignores own-save echoes when local edits are newer than the last write", async () => {
    const store = createStore(createAppState);
    const saved = map(node("root", "", "Saved"), "2026-01-01T00:00:00.000Z");
    const local = map(node("root", "", "Newer local"), "2026-01-01T00:00:00.000Z");
    rememberSavedMap("/vault/Maps/map.map.json", saved);
    fsMocks.loadMap.mockResolvedValue(
      map(node("root", "", "Saved"), "2026-01-02T00:00:00.000Z"),
    );
    store.setState({
      activeMap: local,
      activeMapPath: "/vault/Maps/map.map.json",
      dirtyMap: true,
    });

    await handleExternalPaths(
      ["/vault/Maps/map.map.json"],
      store.setState,
      store.getState,
    );

    expect(store.getState().externalConflict).toBeNull();
    expect(store.getState().dirtyMap).toBe(true);
    expect(store.getState().activeMap?.root.text).toBe("Newer local");
  });
});
