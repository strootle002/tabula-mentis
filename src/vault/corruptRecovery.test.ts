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
    const content = fsState.files.get(from);
    if (content === undefined) throw new Error(`Missing ${from}`);
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

import { loadMap, saveCorruptMapRecoveryCopy } from "./vaultFs";

describe("corrupt map recovery", () => {
  beforeEach(() => {
    fsState.files.clear();
    fsState.dirs.clear();
  });

  it("reports corruption and saves an exact copy without touching the source", async () => {
    const source = "/vault/maps/Broken.map.json";
    const corruptBytes = '{"version":1,"root":';
    fsState.files.set(source, corruptBytes);

    await expect(loadMap(source)).rejects.toThrow(`${source}: invalid JSON`);
    const recovery = await saveCorruptMapRecoveryCopy("/vault", source);

    expect(recovery).toContain("/vault/archive/recovery/");
    expect(recovery).toMatch(/Broken\.corrupt\.json$/);
    expect(fsState.files.get(recovery)).toBe(corruptBytes);
    expect(fsState.files.get(source)).toBe(corruptBytes);
  });
});
