import { beforeEach, describe, expect, it, vi } from "vitest";

const fsState = vi.hoisted(() => ({
  files: new Map<string, string>(),
  dirs: new Set<string>(),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  BaseDirectory: { AppData: 1 },
  exists: async (path: string) =>
    fsState.files.has(path) || fsState.dirs.has(path),
  mkdir: async (path: string) => {
    fsState.dirs.add(path);
  },
  readDir: async (dir: string) => {
    const prefix = `${dir}/`;
    return [...fsState.files.keys()]
      .filter(
        (path) =>
          path.startsWith(prefix) &&
          !path.slice(prefix.length).includes("/"),
      )
      .map((path) => ({
        name: path.slice(prefix.length),
        isDirectory: false,
      }));
  },
  readTextFile: async (path: string) => fsState.files.get(path) ?? "",
  rename: async (from: string, to: string) => {
    const content = fsState.files.get(from);
    if (content == null) throw new Error(`Missing ${from}`);
    fsState.files.delete(from);
    fsState.files.set(to, content);
  },
  remove: async (path: string) => {
    fsState.files.delete(path);
    fsState.dirs.delete(path);
  },
  writeFile: async () => undefined,
  writeTextFile: async (path: string, content: string) => {
    fsState.files.set(path, content);
  },
}));

vi.mock("@tauri-apps/plugin-store", () => ({
  Store: { load: async () => ({ get: vi.fn(), set: vi.fn(), save: vi.fn() }) },
}));

import { syncNodeNoteToVault } from "./vaultFs";

describe("node-note vault mirror", () => {
  beforeEach(() => {
    fsState.files.clear();
    fsState.dirs.clear();
  });

  it("uses one stable file across edits and removes it when cleared", async () => {
    const first = await syncNodeNoteToVault(
      "/vault",
      "Map",
      "node-id",
      "First title",
      "Initial note",
    );
    const second = await syncNodeNoteToVault(
      "/vault",
      "Map",
      "node-id",
      "Renamed title",
      "Updated note",
    );

    expect(second).toBe(first);
    expect(
      [...fsState.files.keys()].filter((path) => path.endsWith(".md")),
    ).toEqual([first]);
    expect(fsState.files.get(first!)).toContain("# Renamed title");
    expect(fsState.files.get(first!)).toContain("Updated note");

    await syncNodeNoteToVault(
      "/vault",
      "Map",
      "node-id",
      "Renamed title",
      "",
    );
    expect(fsState.files.has(first!)).toBe(false);
  });
});
