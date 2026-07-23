import { watch, type UnwatchFn } from "@tauri-apps/plugin-fs";
import { isAtomicWriteArtifact } from "./conflicts";

const OWN_WRITE_WINDOW_MS = 2_000;
const EVENT_BATCH_WINDOW_MS = 25;
const ownWrites = new Map<string, number>();
/** Nested in-flight saves: suppress until every begin has a matching end. */
const inFlightWrites = new Map<string, number>();
let stopWatching: UnwatchFn | null = null;
let pendingPaths = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
/** Serialize external-change handlers so overlapping batches cannot interleave. */
let handlerChain: Promise<void> = Promise.resolve();

const normalize = (path: string) => path.replaceAll("\\", "/");

/** Suppress watcher echoes from a save initiated by this process. */
export function markOwnWrite(path: string, now = Date.now()): void {
  ownWrites.set(normalize(path), now + OWN_WRITE_WINDOW_MS);
}

/** Hold suppression for the full duration of an async write (not just a TTL). */
export function beginOwnWrite(path: string): void {
  const key = normalize(path);
  inFlightWrites.set(key, (inFlightWrites.get(key) ?? 0) + 1);
}

/** Release in-flight suppression, then keep a short grace window for FS echoes. */
export function endOwnWrite(
  path: string,
  graceMs = OWN_WRITE_WINDOW_MS,
  now = Date.now(),
): void {
  const key = normalize(path);
  const remaining = (inFlightWrites.get(key) ?? 1) - 1;
  if (remaining <= 0) {
    inFlightWrites.delete(key);
    ownWrites.set(key, now + graceMs);
  } else {
    inFlightWrites.set(key, remaining);
  }
}

export function isOwnWrite(path: string, now = Date.now()): boolean {
  const key = normalize(path);
  if ((inFlightWrites.get(key) ?? 0) > 0) return true;
  const expiresAt = ownWrites.get(key);
  if (expiresAt == null) return false;
  if (expiresAt < now) {
    ownWrites.delete(key);
    return false;
  }
  return true;
}

export async function stopVaultWatcher(): Promise<void> {
  const stop = stopWatching;
  stopWatching = null;
  if (flushTimer != null) clearTimeout(flushTimer);
  flushTimer = null;
  pendingPaths = new Set();
  stop?.();
}

export async function startVaultWatcher(
  vaultPath: string,
  onPathsChanged: (paths: string[]) => void | Promise<void>,
): Promise<void> {
  await stopVaultWatcher();
  stopWatching = await watch(
    vaultPath,
    (event) => {
      const paths = [
        ...new Set(
          event.paths
            .map(normalize)
            .filter((path) => !isAtomicWriteArtifact(path))
            .filter((path) => !isOwnWrite(path)),
        ),
      ];
      if (paths.length === 0) return;
      for (const path of paths) pendingPaths.add(path);
      if (flushTimer != null) return;
      // The Rust debouncer can emit several events from one filesystem burst.
      // Fold those callbacks into one state transition so one edit cannot
      // produce duplicate conflict handling or redundant vault refreshes.
      flushTimer = setTimeout(() => {
        flushTimer = null;
        const changed = [...pendingPaths];
        pendingPaths.clear();
        if (changed.length === 0) return;
        handlerChain = handlerChain
          .catch(() => undefined)
          .then(() => onPathsChanged(changed))
          .then(() => undefined);
      }, EVENT_BATCH_WINDOW_MS);
    },
    { recursive: true, delayMs: 300 },
  );
}
