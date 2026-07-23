import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fsMock = vi.hoisted(() => ({
  watch: vi.fn(),
  unwatch: vi.fn(),
  callback: null as ((event: { paths: string[] }) => void) | null,
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  watch: fsMock.watch,
}));

import {
  beginOwnWrite,
  endOwnWrite,
  markOwnWrite,
  startVaultWatcher,
  stopVaultWatcher,
} from "./vaultWatcher";

describe("vault watcher event pipeline", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-22T12:00:00Z"));
    fsMock.unwatch.mockReset();
    fsMock.watch.mockReset();
    fsMock.callback = null;
    fsMock.watch.mockImplementation(
      async (
        _path: string,
        callback: (event: { paths: string[] }) => void,
      ) => {
        fsMock.callback = callback;
        return fsMock.unwatch;
      },
    );
  });

  afterEach(async () => {
    await stopVaultWatcher();
    vi.useRealTimers();
  });

  it("filters own atomic saves and their temporary artifacts", async () => {
    const changed = vi.fn();
    const path = "/vault/maps/example.map.json";
    await startVaultWatcher("/vault", changed);

    markOwnWrite(path);
    fsMock.callback?.({
      paths: [
        `${path}.mindmap-tmp`,
        `${path}.mindmap-backup`,
        path,
      ],
    });
    await vi.advanceTimersByTimeAsync(30);

    expect(changed).not.toHaveBeenCalled();
  });

  it("suppresses events for the full in-flight write window", async () => {
    const changed = vi.fn();
    const path = "/vault/maps/slow.map.json";
    await startVaultWatcher("/vault", changed);

    beginOwnWrite(path);
    await vi.advanceTimersByTimeAsync(5_000);
    fsMock.callback?.({ paths: [path] });
    await vi.advanceTimersByTimeAsync(30);
    expect(changed).not.toHaveBeenCalled();

    endOwnWrite(path);
    fsMock.callback?.({ paths: [path] });
    await vi.advanceTimersByTimeAsync(30);
    expect(changed).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2_001);
    fsMock.callback?.({ paths: [path] });
    await vi.advanceTimersByTimeAsync(30);
    expect(changed).toHaveBeenCalledOnce();
  });

  it("coalesces a burst into one deduplicated callback", async () => {
    const changed = vi.fn();
    await startVaultWatcher("/vault", changed);

    fsMock.callback?.({ paths: ["/vault/notes/a.md"] });
    fsMock.callback?.({
      paths: ["/vault/notes/a.md", "/vault/notes/b.md"],
    });
    fsMock.callback?.({ paths: ["/vault/notes/b.md.mindmap-tmp"] });
    await vi.advanceTimersByTimeAsync(30);

    expect(changed).toHaveBeenCalledTimes(1);
    expect(changed).toHaveBeenCalledWith([
      "/vault/notes/a.md",
      "/vault/notes/b.md",
    ]);
  });

  it("suppresses Keep Local's echo but accepts a later external edit", async () => {
    const changed = vi.fn();
    const path = "/vault/notes/a.md";
    await startVaultWatcher("/vault", changed);

    markOwnWrite(path);
    fsMock.callback?.({ paths: [path] });
    await vi.advanceTimersByTimeAsync(30);
    expect(changed).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2_001);
    fsMock.callback?.({ paths: [path] });
    await vi.advanceTimersByTimeAsync(30);
    expect(changed).toHaveBeenCalledOnce();
    expect(changed).toHaveBeenCalledWith([path]);
  });

  it("cancels a queued callback when watching stops", async () => {
    const changed = vi.fn();
    await startVaultWatcher("/vault", changed);
    fsMock.callback?.({ paths: ["/vault/notes/a.md"] });

    await stopVaultWatcher();
    await vi.advanceTimersByTimeAsync(30);

    expect(fsMock.unwatch).toHaveBeenCalledOnce();
    expect(changed).not.toHaveBeenCalled();
  });
});
