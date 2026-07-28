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
  readDir: async () => [],
  readTextFile: async (path: string) => {
    const content = fsState.files.get(path);
    if (content === undefined) throw new Error(`Missing ${path}`);
    return content;
  },
  rename: async (from: string, to: string) => {
    if (fsState.files.has(from)) {
      fsState.files.set(to, fsState.files.get(from)!);
      fsState.files.delete(from);
      return;
    }
    if (fsState.dirs.has(from)) {
      fsState.dirs.delete(from);
      fsState.dirs.add(to);
      return;
    }
    throw new Error(`Missing ${from}`);
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

import { renameLibraryFolderFs, renameVaultItem } from "./vaultFs";

describe("renameVaultItem", () => {
  beforeEach(() => {
    fsState.files.clear();
    fsState.dirs.clear();
  });

  it("renames a map file in place, deriving the slug filename from the title", async () => {
    const from = "/vault/maps/Projects/old-title.map.json";
    fsState.dirs.add("/vault/maps/Projects");
    fsState.files.set(from, "{}");

    const next = await renameVaultItem("/vault", "map", from, "New Title");

    expect(next).toBe("/vault/maps/Projects/new-title.map.json");
    expect(fsState.files.has(from)).toBe(false);
    expect(fsState.files.get(next)).toBe("{}");
  });

  it("renames a note file in place using the title as the filename", async () => {
    const from = "/vault/notes/Old Name.md";
    fsState.files.set(from, "# hi");

    const next = await renameVaultItem("/vault", "note", from, "New Name");

    expect(next).toBe("/vault/notes/New Name.md");
    expect(fsState.files.get(next)).toBe("# hi");
  });

  it("avoids collisions by suffixing a number", async () => {
    const from = "/vault/notes/Old.md";
    fsState.files.set(from, "a");
    fsState.files.set("/vault/notes/Taken.md", "existing");

    const next = await renameVaultItem("/vault", "note", from, "Taken");

    expect(next).toBe("/vault/notes/Taken-2.md");
  });

  it("is a no-op when the resolved name is unchanged", async () => {
    const from = "/vault/notes/Same.md";
    fsState.files.set(from, "a");

    const next = await renameVaultItem("/vault", "note", from, "Same");

    expect(next).toBe(from);
  });
});

describe("renameLibraryFolderFs", () => {
  beforeEach(() => {
    fsState.files.clear();
    fsState.dirs.clear();
  });

  it("renames the last segment under both maps/ and notes/ twins", async () => {
    fsState.dirs.add("/vault/maps/Projects/Old");
    fsState.dirs.add("/vault/notes/Projects/Old");

    const next = await renameLibraryFolderFs("/vault", "Projects/Old", "New");

    expect(next).toBe("Projects/New");
    expect(fsState.dirs.has("/vault/maps/Projects/New")).toBe(true);
    expect(fsState.dirs.has("/vault/notes/Projects/New")).toBe(true);
    expect(fsState.dirs.has("/vault/maps/Projects/Old")).toBe(false);
  });

  it("only renames the twin that exists", async () => {
    fsState.dirs.add("/vault/notes/Old");

    const next = await renameLibraryFolderFs("/vault", "Old", "New");

    expect(next).toBe("New");
    expect(fsState.dirs.has("/vault/notes/New")).toBe(true);
    expect(fsState.dirs.has("/vault/maps/New")).toBe(false);
  });

  it("rejects renaming the library root", async () => {
    await expect(renameLibraryFolderFs("/vault", "", "New")).rejects.toThrow();
  });
});
