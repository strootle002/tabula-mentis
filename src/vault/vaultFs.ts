import {
  BaseDirectory,
  exists,
  mkdir,
  readDir,
  readTextFile,
  rename,
  remove,
  stat,
  writeFile,
  writeTextFile,
} from "@tauri-apps/plugin-fs";
import {
  getStore as getLoadedStore,
  type Store,
} from "@tauri-apps/plugin-store";
import type { MindMapDocument, MindNode, VaultSettings } from "../mindmap/types";
import type { FolderStats } from "../notes/libraryTree";
import {
  assertMindMapDocument,
  isMindMapDocument,
  parseMindMapJson,
} from "../mindmap/documentFormat";

export { isMindMapDocument };

const STORE_PATH = "mindmap-app.json";
let storePromise: Promise<Store> | null = null;

function getStore() {
  if (!storePromise) {
    storePromise = getLoadedStore(STORE_PATH).then((store) => {
      if (!store) throw new Error("The application settings store is unavailable");
      return store;
    });
  }
  return storePromise;
}

export async function getSavedVaultPath(): Promise<string | null> {
  const store = await getStore();
  return (await store.get<string>("vaultPath")) ?? null;
}

export async function setSavedVaultPath(path: string): Promise<void> {
  const store = await getStore();
  await store.set("vaultPath", path);
  await store.save();
}

export async function getAppThemeId(): Promise<string> {
  const store = await getStore();
  return (await store.get<string>("themeId")) ?? "paper";
}

export async function setAppThemeId(themeId: string): Promise<void> {
  const store = await getStore();
  await store.set("themeId", themeId);
  await store.save();
}

export type NavMode = "journal" | "library" | "tags";

const NAV_MODES: NavMode[] = ["journal", "library", "tags"];

function clampSidebarWidth(width: number): number {
  return Math.min(520, Math.max(220, Math.round(width)));
}

function parseNavMode(value: unknown): NavMode {
  return typeof value === "string" && NAV_MODES.includes(value as NavMode)
    ? (value as NavMode)
    : "library";
}

export async function getSidebarPrefs(): Promise<{
  width: number;
  collapsed: boolean;
  navMode: NavMode;
}> {
  const store = await getStore();
  const width = (await store.get<number>("sidebarWidth")) ?? 300;
  const collapsed = (await store.get<boolean>("sidebarCollapsed")) ?? false;
  const navMode = parseNavMode(await store.get("navMode"));
  return {
    width: clampSidebarWidth(width),
    collapsed,
    navMode,
  };
}

export async function setSidebarPrefs(prefs: {
  width?: number;
  collapsed?: boolean;
  navMode?: NavMode;
}): Promise<void> {
  const store = await getStore();
  if (prefs.width != null) {
    await store.set("sidebarWidth", clampSidebarWidth(prefs.width));
  }
  if (prefs.collapsed != null) {
    await store.set("sidebarCollapsed", prefs.collapsed);
  }
  if (prefs.navMode != null) {
    await store.set("navMode", prefs.navMode);
  }
  await store.save();
}

export async function getStoredKeybindings(): Promise<
  Record<string, unknown>
> {
  const store = await getStore();
  return ((await store.get("keybindings")) as Record<string, unknown>) ?? {};
}

export async function setStoredKeybindings(
  overrides: Record<string, unknown>,
): Promise<void> {
  const store = await getStore();
  await store.set("keybindings", overrides);
  await store.save();
}

export function joinPath(base: string, ...parts: string[]): string {
  const sep = base.includes("\\") ? "\\" : "/";
  return [base.replace(/[/\\]+$/, ""), ...parts].join(sep);
}

const WINDOWS_RESERVED_NAME =
  /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

function validatePathSegment(segment: string, label: string): void {
  if (
    !segment ||
    segment === "." ||
    segment === ".." ||
    /[<>:"|?*\u0000-\u001f]/.test(segment) ||
    /[. ]$/.test(segment) ||
    WINDOWS_RESERVED_NAME.test(segment)
  ) {
    throw new Error(`${label} contains an unsafe path segment: "${segment}"`);
  }
}

/** Normalize and validate a user-controlled path relative to a vault root. */
export function normalizeVaultRelativePath(
  value: string,
  opts?: { allowEmpty?: boolean; label?: string },
): string {
  const label = opts?.label ?? "Folder";
  const normalized = value.trim().replaceAll("\\", "/");
  if (!normalized) {
    if (opts?.allowEmpty !== false) return "";
    throw new Error(`${label} cannot be empty`);
  }
  if (normalized.startsWith("/") || /^[a-zA-Z]:/.test(normalized)) {
    throw new Error(`${label} must be relative to the vault`);
  }
  const segments = normalized.split("/");
  for (const segment of segments) validatePathSegment(segment, label);
  return segments.join("/");
}

/** Validate a single cross-platform filename (not a path). */
export function validateVaultFileName(fileName: string): string {
  const trimmed = fileName.trim();
  if (trimmed.includes("/") || trimmed.includes("\\")) {
    throw new Error("File name cannot contain path separators");
  }
  validatePathSegment(trimmed, "File name");
  return trimmed;
}

const TEMP_SUFFIX = ".mindmap-tmp";
const BACKUP_SUFFIX = ".mindmap-backup";
const writeQueues = new Map<string, Promise<void>>();

async function replaceFileSafely(
  path: string,
  writeTemp: (tempPath: string) => Promise<void>,
): Promise<void> {
  const tempPath = `${path}${TEMP_SUFFIX}`;
  const backupPath = `${path}${BACKUP_SUFFIX}`;
  if (await exists(tempPath)) await remove(tempPath);
  if ((await exists(backupPath)) && !(await exists(path))) {
    await rename(backupPath, path);
  }
  if ((await exists(backupPath)) && (await exists(path))) {
    await remove(backupPath);
  }

  await writeTemp(tempPath);
  const hadOriginal = await exists(path);
  if (hadOriginal) await rename(path, backupPath);
  try {
    await rename(tempPath, path);
  } catch (error) {
    if (hadOriginal && (await exists(backupPath)) && !(await exists(path))) {
      await rename(backupPath, path);
    }
    throw error;
  } finally {
    if (await exists(tempPath)) await remove(tempPath);
  }
  if (await exists(backupPath)) await remove(backupPath);
}

function enqueueSafeWrite(path: string, operation: () => Promise<void>) {
  const key = path.replaceAll("\\", "/");
  const prior = writeQueues.get(key) ?? Promise.resolve();
  const next = prior.catch(() => undefined).then(operation);
  writeQueues.set(key, next);
  const cleanup = () => {
    if (writeQueues.get(key) === next) writeQueues.delete(key);
  };
  void next.then(cleanup, cleanup);
  return next;
}

export function writeTextFileSafely(
  path: string,
  content: string,
): Promise<void> {
  return enqueueSafeWrite(path, () =>
    replaceFileSafely(path, (tempPath) =>
      writeTextFile(tempPath, content),
    ),
  );
}

export function writeFileSafely(
  path: string,
  content: Uint8Array,
): Promise<void> {
  return enqueueSafeWrite(path, () =>
    replaceFileSafely(path, (tempPath) => writeFile(tempPath, content)),
  );
}

async function recoverInterruptedWrites(root: string): Promise<void> {
  if (!(await exists(root))) return;
  for (const entry of await readDir(root)) {
    if (!entry.name) continue;
    const path = joinPath(root, entry.name);
    if (entry.isDirectory) {
      await recoverInterruptedWrites(path);
      continue;
    }
    if (entry.name.endsWith(BACKUP_SUFFIX)) {
      const target = path.slice(0, -BACKUP_SUFFIX.length);
      if (await exists(target)) await remove(path);
      else await rename(path, target);
    } else if (entry.name.endsWith(TEMP_SUFFIX)) {
      // A crash may leave a partially written temp file. Never promote it.
      await remove(path);
    }
  }
}

export function vaultMapsDir(vaultPath: string) {
  return joinPath(vaultPath, "maps");
}

export function vaultNotesDir(vaultPath: string) {
  return joinPath(vaultPath, "notes");
}

export function vaultAssetsDir(vaultPath: string) {
  return joinPath(vaultPath, "assets");
}

export function vaultImportsDir(vaultPath: string) {
  return joinPath(vaultAssetsDir(vaultPath), "imports");
}

export function vaultArchiveDir(vaultPath: string) {
  return joinPath(vaultPath, "archive");
}

export function vaultMetaDir(vaultPath: string) {
  return joinPath(vaultPath, "mindmap-meta");
}

export function vaultSettingsPath(vaultPath: string) {
  return joinPath(vaultMetaDir(vaultPath), "settings.json");
}

export function createEmptyNode(text = "New node"): MindNode {
  return {
    id: crypto.randomUUID(),
    text,
    children: [],
  };
}

export function createSampleMap(title = "Welcome"): MindMapDocument {
  const now = new Date().toISOString();
  const root: MindNode = {
    id: crypto.randomUUID(),
    text: title,
    children: [
      {
        id: crypto.randomUUID(),
        text: "Keyboard",
        note: "Use arrow keys, Ctrl+T, F2, Delete, Space.",
        children: [
          { id: crypto.randomUUID(), text: "Arrows navigate", children: [] },
          { id: crypto.randomUUID(), text: "Ctrl+T adds child", children: [] },
          { id: crypto.randomUUID(), text: "F2 edits text", children: [] },
        ],
      },
      {
        id: crypto.randomUUID(),
        text: "Notes",
        children: [
          {
            id: crypto.randomUUID(),
            text: "Node notes in the side panel",
            children: [],
          },
          {
            id: crypto.randomUUID(),
            text: "Longform notes with #tags",
            children: [],
          },
        ],
      },
      {
        id: crypto.randomUUID(),
        text: "Import & export",
        children: [
          { id: crypto.randomUUID(), text: "CSV / TXT import", children: [] },
          { id: crypto.randomUUID(), text: "JSON / PNG export", children: [] },
        ],
      },
    ],
  };

  return {
    version: 1,
    title,
    root,
    layoutStyle: "right",
    createdAt: now,
    updatedAt: now,
  };
}

export const DEFAULT_VAULT_SETTINGS: VaultSettings = {
  themeId: "paper",
  defaultLayoutStyle: "right",
  defaultNodeStyle: {
    fill: "#f4f1ea",
    stroke: "#5a5348",
    textColor: "#3a342c",
    fontSize: 14,
    scale: 1,
  },
  libraryFolderSort: "alpha",
  libraryFolderOrder: [],
};

async function readDirTimes(
  absolutePath: string,
): Promise<{ mtime: number; birthtime: number } | null> {
  try {
    if (!(await exists(absolutePath))) return null;
    const info = await stat(absolutePath);
    const mtime = info.mtime?.getTime() ?? -1;
    const birthtime = info.birthtime?.getTime() ?? mtime;
    if (mtime < 0 && birthtime < 0) return null;
    return { mtime, birthtime };
  } catch {
    return null;
  }
}

/** Combined times for maps/ + notes/ twins of a library folder. */
export async function statFolderTimes(
  vaultPath: string,
  folder: string,
): Promise<FolderStats | null> {
  const segments = folder.split("/").filter(Boolean);
  const notesPath = joinPath(vaultNotesDir(vaultPath), ...segments);
  const mapsPath = joinPath(vaultMapsDir(vaultPath), ...segments);
  const [notesTimes, mapsTimes] = await Promise.all([
    readDirTimes(notesPath),
    readDirTimes(mapsPath),
  ]);
  if (!notesTimes && !mapsTimes) return null;
  const mtimes = [notesTimes?.mtime, mapsTimes?.mtime].filter(
    (n): n is number => typeof n === "number" && n >= 0,
  );
  const births = [notesTimes?.birthtime, mapsTimes?.birthtime].filter(
    (n): n is number => typeof n === "number" && n >= 0,
  );
  return {
    mtime: mtimes.length ? Math.max(...mtimes) : -1,
    birthtime: births.length ? Math.min(...births) : -1,
  };
}

export async function collectFolderStats(
  vaultPath: string,
  folders: string[],
): Promise<Record<string, FolderStats>> {
  const unique = [...new Set(folders.filter(Boolean))];
  const entries = await Promise.all(
    unique.map(async (folder) => {
      const times = await statFolderTimes(vaultPath, folder);
      return times ? ([folder, times] as const) : null;
    }),
  );
  const out: Record<string, FolderStats> = {};
  for (const entry of entries) {
    if (entry) out[entry[0]] = entry[1];
  }
  return out;
}

export async function ensureVaultStructure(vaultPath: string): Promise<void> {
  for (const dir of [
    vaultMapsDir(vaultPath),
    vaultNotesDir(vaultPath),
    joinPath(vaultNotesDir(vaultPath), "journals"),
    joinPath(vaultNotesDir(vaultPath), TAG_NOTES_ROOT),
    joinPath(vaultMapsDir(vaultPath), "journals"),
    vaultAssetsDir(vaultPath),
    vaultImportsDir(vaultPath),
    vaultArchiveDir(vaultPath),
    vaultMetaDir(vaultPath),
  ]) {
    if (!(await exists(dir))) {
      await mkdir(dir, { recursive: true });
    }
  }
  await recoverInterruptedWrites(vaultPath);

  const settingsPath = vaultSettingsPath(vaultPath);
  if (!(await exists(settingsPath))) {
    await writeTextFileSafely(
      settingsPath,
      JSON.stringify(DEFAULT_VAULT_SETTINGS, null, 2),
    );
  }

  const maps = await listMaps(vaultPath);
  if (maps.length === 0) {
    await saveMap(vaultPath, "welcome.map.json", createSampleMap("Welcome"));
  }

  const notes = await listNotes(vaultPath);
  if (notes.length === 0) {
    await saveNote(
      vaultPath,
      "Getting Started.md",
      `# Getting Started

Welcome to your vault.

- Open maps from the sidebar
- Tag ideas with #ideas #mindmap

#ideas
`,
    );
  }
}

export async function listMaps(
  vaultPath: string,
): Promise<{ name: string; path: string; folder: string }[]> {
  const root = vaultMapsDir(vaultPath);
  if (!(await exists(root))) return [];
  const results: { name: string; path: string; folder: string }[] = [];

  const walk = async (dir: string, folder: string) => {
    const entries = await readDir(dir);
    for (const e of entries) {
      if (!e.name) continue;
      const full = joinPath(dir, e.name);
      if (e.isDirectory) {
        const nextFolder = folder ? `${folder}/${e.name}` : e.name;
        await walk(full, nextFolder);
      } else if (e.name.endsWith(".map.json")) {
        results.push({
          name: e.name.replace(/\.map\.json$/, ""),
          path: full,
          folder,
        });
      }
    }
  };

  await walk(root, "");
  return results.sort((a, b) => {
    const fa = a.folder.localeCompare(b.folder);
    return fa !== 0 ? fa : a.name.localeCompare(b.name);
  });
}

async function listFoldersUnder(root: string): Promise<string[]> {
  if (!(await exists(root))) return [];
  const folders: string[] = [];
  const walk = async (dir: string, folder: string) => {
    const entries = await readDir(dir);
    for (const e of entries) {
      if (!e.name || !e.isDirectory) continue;
      const nextFolder = folder ? `${folder}/${e.name}` : e.name;
      folders.push(nextFolder);
      await walk(joinPath(dir, e.name), nextFolder);
    }
  };
  await walk(root, "");
  return folders.sort((a, b) => a.localeCompare(b));
}

export async function listNoteFolders(vaultPath: string): Promise<string[]> {
  return (await listFoldersUnder(vaultNotesDir(vaultPath))).filter(
    (folder) => !isTagNotesPath(folder),
  );
}

export async function listMapFolders(vaultPath: string): Promise<string[]> {
  return listFoldersUnder(vaultMapsDir(vaultPath));
}

export async function listNotes(
  vaultPath: string,
): Promise<{ name: string; path: string; folder: string }[]> {
  const root = vaultNotesDir(vaultPath);
  if (!(await exists(root))) return [];
  const results: { name: string; path: string; folder: string }[] = [];

  const walk = async (dir: string, folder: string) => {
    const entries = await readDir(dir);
    for (const e of entries) {
      if (!e.name) continue;
      const full = joinPath(dir, e.name);
      if (e.isDirectory) {
        const nextFolder = folder ? `${folder}/${e.name}` : e.name;
        // Dedicated tag-page notes stay out of the library index / sidebar.
        if (isTagNotesPath(nextFolder)) continue;
        await walk(full, nextFolder);
      } else if (e.name.endsWith(".md")) {
        let name = e.name.replace(/\.md$/, "");
        // Node mirrors keep a stable UUID filename; show the node title instead.
        if (
          folder.startsWith(NODE_NOTES_ROOT) &&
          /^node-[0-9a-f-]+$/i.test(name)
        ) {
          try {
            const content = await readTextFile(full);
            const titled = displayTitleFromNodeNote(content);
            if (titled) name = titled;
          } catch {
            /* keep filename */
          }
        }
        results.push({
          name,
          path: full,
          folder,
        });
      }
    }
  };

  await walk(root, "");
  return results.sort((a, b) => {
    const fa = a.folder.localeCompare(b.folder);
    return fa !== 0 ? fa : a.name.localeCompare(b.name);
  });
}

/** Prefer frontmatter title, then first H1, for node-note sidebar labels. */
export function displayTitleFromNodeNote(content: string): string | null {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
  if (fm) {
    const titleLine = /^title:\s*(.+)$/m.exec(fm[1]);
    if (titleLine) {
      let raw = titleLine[1].trim();
      if (
        (raw.startsWith('"') && raw.endsWith('"')) ||
        (raw.startsWith("'") && raw.endsWith("'"))
      ) {
        raw = raw.slice(1, -1);
      }
      raw = raw.replace(/\\"/g, '"').trim();
      if (raw) return raw;
    }
  }
  const heading = /^#\s+(.+)$/m.exec(content);
  return heading?.[1]?.trim() || null;
}

export async function createNotesFolder(
  vaultPath: string,
  folderRelative: string,
): Promise<string> {
  const safeFolder = normalizeVaultRelativePath(folderRelative);
  const path = joinPath(
    vaultNotesDir(vaultPath),
    ...safeFolder.split("/").filter(Boolean),
  );
  await mkdir(path, { recursive: true });
  return path;
}

export async function createMapsFolder(
  vaultPath: string,
  folderRelative: string,
): Promise<string> {
  const safeFolder = normalizeVaultRelativePath(folderRelative);
  const path = joinPath(
    vaultMapsDir(vaultPath),
    ...safeFolder.split("/").filter(Boolean),
  );
  await mkdir(path, { recursive: true });
  return path;
}

export async function saveNote(
  vaultPath: string,
  fileName: string,
  content: string,
  folder = "",
): Promise<string> {
  const validatedName = validateVaultFileName(fileName);
  const safe = validatedName.endsWith(".md")
    ? validatedName
    : `${validatedName}.md`;
  const safeFolder = normalizeVaultRelativePath(folder);
  const dir = safeFolder
    ? joinPath(
        vaultNotesDir(vaultPath),
        ...safeFolder.split("/").filter(Boolean),
      )
    : vaultNotesDir(vaultPath);
  if (!(await exists(dir))) {
    await mkdir(dir, { recursive: true });
  }
  const path = joinPath(dir, safe);
  await writeTextFileSafely(path, content);
  return path;
}

const nodeNoteSyncQueues = new Map<string, Promise<string | null>>();

export function nodeNoteMirrorPath(
  vaultPath: string,
  mapTitle: string,
  nodeId: string,
): string {
  return joinPath(
    vaultNotesDir(vaultPath),
    ...nodeNotesFolderForMap(mapTitle).split("/").filter(Boolean),
    `node-${nodeId}.md`,
  );
}

async function syncNodeNoteToVaultNow(
  vaultPath: string,
  mapTitle: string,
  nodeId: string,
  nodeText: string,
  note: string,
): Promise<string | null> {
  const folder = nodeNotesFolderForMap(mapTitle);
  const dir = joinPath(
    vaultNotesDir(vaultPath),
    ...folder.split("/").filter(Boolean),
  );
  const stableName = `node-${nodeId}.md`;
  const legacySuffix = `-${nodeId.slice(0, 8)}.md`;
  const matchingPaths: string[] = [];
  if (await exists(dir)) {
    for (const entry of await readDir(dir)) {
      if (
        entry.name &&
        !entry.isDirectory &&
        (entry.name === stableName || entry.name.endsWith(legacySuffix))
      ) {
        matchingPaths.push(joinPath(dir, entry.name));
      }
    }
  }

  if (!note.trim()) {
    for (const path of matchingPaths) await remove(path);
    return null;
  }

  const content = `---\nsource: node\nmap: ${JSON.stringify(mapTitle)}\nnodeId: ${JSON.stringify(nodeId)}\ntitle: ${JSON.stringify(nodeText)}\n---\n\n# ${nodeText}\n\n${note}\n`;
  const stablePath = await saveNote(
    vaultPath,
    stableName,
    content,
    folder,
  );
  for (const path of matchingPaths) {
    if (!pathsEqual(path, stablePath)) await remove(path);
  }
  return stablePath;
}

/** Persist one stable mirror per node; edits for the same node are serialized. */
export function syncNodeNoteToVault(
  vaultPath: string,
  mapTitle: string,
  nodeId: string,
  nodeText: string,
  note: string,
): Promise<string | null> {
  const key = `${vaultPath}\u0000${mapTitle}\u0000${nodeId}`;
  const prior = nodeNoteSyncQueues.get(key) ?? Promise.resolve(null);
  const next = prior
    .catch(() => null)
    .then(() =>
      syncNodeNoteToVaultNow(
        vaultPath,
        mapTitle,
        nodeId,
        nodeText,
        note,
      ),
    );
  nodeNoteSyncQueues.set(key, next);
  const cleanup = () => {
    if (nodeNoteSyncQueues.get(key) === next) nodeNoteSyncQueues.delete(key);
  };
  void next.then(cleanup, cleanup);
  return next;
}

export const NODE_NOTES_ROOT = "Node Notes";
/** Dedicated pages for each tag — hidden from the library sidebar. */
export const TAG_NOTES_ROOT = "Tag Notes";

export function slugify(text: string): string {
  return (
    text
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "item"
  );
}

/** Stable filename for a tag (supports slash hierarchy via `__`). */
export function tagNoteFileName(tag: string): string {
  const raw = tag.trim().toLowerCase().replace(/^#/, "");
  const safe =
    raw
      .replace(/\/+/g, "__")
      .replace(/[^\w.-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "tag";
  return `${safe}.md`;
}

export function tagNotesFolder(): string {
  return TAG_NOTES_ROOT;
}

export function tagNoteAbsolutePath(vaultPath: string, tag: string): string {
  return joinPath(
    vaultNotesDir(vaultPath),
    TAG_NOTES_ROOT,
    tagNoteFileName(tag),
  );
}

export function isTagNotesPath(folder: string): boolean {
  return (
    folder === TAG_NOTES_ROOT || folder.startsWith(`${TAG_NOTES_ROOT}/`)
  );
}

export function nodeNotesFolderForMap(mapTitle: string): string {
  return `${NODE_NOTES_ROOT}/${slugify(mapTitle)}`;
}

export function isNodeNotesPath(folder: string): boolean {
  return (
    folder === NODE_NOTES_ROOT || folder.startsWith(`${NODE_NOTES_ROOT}/`)
  );
}

/** Map slug segment under Node Notes/, or null if not a node-notes folder. */
export function nodeNotesMapSlug(folder: string): string | null {
  if (!folder.startsWith(`${NODE_NOTES_ROOT}/`)) return null;
  const rest = folder.slice(NODE_NOTES_ROOT.length + 1);
  if (!rest || rest.includes("/")) return null;
  return rest;
}

export async function loadMap(path: string): Promise<MindMapDocument> {
  const raw = await readTextFile(path);
  return parseMindMapJson(raw, path);
}

/**
 * Preserve the exact bytes of a corrupt map under archive/recovery/.
 * The source is only read; it is never renamed, removed, or overwritten.
 */
export async function saveCorruptMapRecoveryCopy(
  vaultPath: string,
  path: string,
): Promise<string> {
  const raw = await readTextFile(path);
  const dir = joinPath(vaultArchiveDir(vaultPath), "recovery");
  if (!(await exists(dir))) await mkdir(dir, { recursive: true });
  const sourceName = path.split(/[/\\]/).pop() || "map.map.json";
  const base = sourceName.replace(/\.map\.json$/i, "") || "map";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  let candidate = `${stamp}-${base}.corrupt.json`;
  let n = 2;
  while (await exists(joinPath(dir, candidate))) {
    candidate = `${stamp}-${base}-${n}.corrupt.json`;
    n += 1;
  }
  const recoveryPath = joinPath(dir, candidate);
  await writeTextFileSafely(recoveryPath, raw);
  return recoveryPath;
}

export async function saveMap(
  vaultPath: string,
  fileName: string,
  doc: MindMapDocument,
  folder = "",
  opts?: { pretty?: boolean },
): Promise<string> {
  const validatedName = validateVaultFileName(fileName);
  const safe = validatedName.endsWith(".map.json")
    ? validatedName
    : `${validatedName.replace(/\.map\.json$/, "")}.map.json`;
  const safeFolder = normalizeVaultRelativePath(folder);
  const dir = safeFolder
    ? joinPath(
        vaultMapsDir(vaultPath),
        ...safeFolder.split("/").filter(Boolean),
      )
    : vaultMapsDir(vaultPath);
  if (!(await exists(dir))) {
    await mkdir(dir, { recursive: true });
  }
  const path = joinPath(dir, safe);
  const next = { ...doc, updatedAt: new Date().toISOString() };
  assertMindMapDocument(next);
  const pretty = opts?.pretty ?? true;
  await writeTextFileSafely(
    path,
    pretty ? JSON.stringify(next, null, 2) : JSON.stringify(next),
  );
  return path;
}

/** Persist a map to its existing absolute path (preserves folders). */
export async function saveMapAtPath(
  path: string,
  doc: MindMapDocument,
): Promise<void> {
  const next = { ...doc, updatedAt: new Date().toISOString() };
  assertMindMapDocument(next);
  await writeTextFileSafely(path, JSON.stringify(next, null, 2));
}

/** Save a read-only copy of an imported source file under assets/imports/. */
export async function saveImportSourceCopy(
  vaultPath: string,
  sourceName: string,
  content: string,
): Promise<string> {
  const dir = vaultImportsDir(vaultPath);
  if (!(await exists(dir))) {
    await mkdir(dir, { recursive: true });
  }
  const base =
    sourceName.replace(/[/\\]+/g, "-").replace(/^\.+/, "") || "import.txt";
  let candidate = base;
  let n = 2;
  while (await exists(joinPath(dir, candidate))) {
    const dot = base.lastIndexOf(".");
    candidate =
      dot > 0
        ? `${base.slice(0, dot)}-${n}${base.slice(dot)}`
        : `${base}-${n}`;
    n += 1;
  }
  const path = joinPath(dir, candidate);
  await writeTextFileSafely(path, content);
  return path;
}

export async function loadNote(path: string): Promise<string> {
  return readTextFile(path);
}

/** Write note content to an existing absolute path (preserves folder). */
export async function saveNoteAtPath(
  path: string,
  content: string,
): Promise<void> {
  await writeTextFileSafely(path, content);
}

export async function archiveEntry(
  vaultPath: string,
  path: string,
): Promise<void> {
  await mkdir(vaultArchiveDir(vaultPath), { recursive: true });
  const name = path.split(/[/\\]/).pop()!;
  const dest = joinPath(vaultArchiveDir(vaultPath), `${Date.now()}-${name}`);
  await rename(path, dest);
}

export async function deleteEntry(path: string): Promise<void> {
  await remove(path);
}

/**
 * Archive a library folder from both maps/ and notes/ (user folders are dual).
 * Moves each existing twin into archive/.
 */
export async function archiveFolder(
  vaultPath: string,
  folderRelative: string,
): Promise<void> {
  const trimmed = normalizeVaultRelativePath(folderRelative, {
    allowEmpty: false,
  });
  if (!trimmed) throw new Error("Cannot archive library root");
  await mkdir(vaultArchiveDir(vaultPath), { recursive: true });
  const stamp = Date.now();
  const safe = trimmed.replace(/[/\\]+/g, "-");
  for (const root of [vaultMapsDir(vaultPath), vaultNotesDir(vaultPath)]) {
    const path = joinPath(root, ...trimmed.split("/").filter(Boolean));
    if (!(await exists(path))) continue;
    const dest = joinPath(vaultArchiveDir(vaultPath), `${stamp}-${safe}`);
    // If dest exists from the first twin, suffix the second
    let finalDest = dest;
    let n = 2;
    while (await exists(finalDest)) {
      finalDest = joinPath(vaultArchiveDir(vaultPath), `${stamp}-${safe}-${n}`);
      n += 1;
    }
    await rename(path, finalDest);
  }
}

/** Permanently delete a library folder from both maps/ and notes/. */
export async function deleteFolder(
  vaultPath: string,
  folderRelative: string,
): Promise<void> {
  const trimmed = normalizeVaultRelativePath(folderRelative, {
    allowEmpty: false,
  });
  if (!trimmed) throw new Error("Cannot delete library root");
  for (const root of [vaultMapsDir(vaultPath), vaultNotesDir(vaultPath)]) {
    const path = joinPath(root, ...trimmed.split("/").filter(Boolean));
    if (!(await exists(path))) continue;
    await remove(path, { recursive: true });
  }
}

/**
 * Move a library folder under a new parent ("" = library root).
 * Renames both maps/ and notes/ twins. Returns the new relative path.
 */
export async function moveLibraryFolder(
  vaultPath: string,
  fromRelative: string,
  destParentRelative: string,
): Promise<string> {
  const from = normalizeVaultRelativePath(fromRelative, { allowEmpty: false });
  if (!from) throw new Error("Cannot move library root");
  const destParent = normalizeVaultRelativePath(destParentRelative);
  const name = from.includes("/") ? from.slice(from.lastIndexOf("/") + 1) : from;

  if (destParent === from || destParent.startsWith(`${from}/`)) {
    throw new Error("Cannot move a folder into itself");
  }

  const currentParent = from.includes("/")
    ? from.slice(0, from.lastIndexOf("/"))
    : "";
  if (currentParent === destParent) return from;

  let dest = destParent ? `${destParent}/${name}` : name;
  // Avoid collisions under the destination parent.
  let n = 2;
  while (
    (await exists(
      joinPath(vaultNotesDir(vaultPath), ...dest.split("/").filter(Boolean)),
    )) ||
    (await exists(
      joinPath(vaultMapsDir(vaultPath), ...dest.split("/").filter(Boolean)),
    ))
  ) {
    const candidate = destParent ? `${destParent}/${name}-${n}` : `${name}-${n}`;
    if (candidate === from) break;
    dest = candidate;
    n += 1;
    if (n > 200) throw new Error("Could not find a free folder name");
  }

  const destSegments = dest.split("/").filter(Boolean);
  const parentSegments = destSegments.slice(0, -1);
  for (const root of [vaultMapsDir(vaultPath), vaultNotesDir(vaultPath)]) {
    if (parentSegments.length) {
      const parentDir = joinPath(root, ...parentSegments);
      if (!(await exists(parentDir))) {
        await mkdir(parentDir, { recursive: true });
      }
    }
    const fromPath = joinPath(root, ...from.split("/").filter(Boolean));
    const destPath = joinPath(root, ...destSegments);
    if (!(await exists(fromPath))) continue;
    if (await exists(destPath)) {
      throw new Error(`Folder already exists at ${dest}`);
    }
    await rename(fromPath, destPath);
  }

  return dest;
}

function splitEntryName(
  fileName: string,
  kind: "map" | "note",
): { base: string; ext: string } {
  if (kind === "map" && fileName.endsWith(".map.json")) {
    return { base: fileName.slice(0, -".map.json".length), ext: ".map.json" };
  }
  if (kind === "note" && fileName.endsWith(".md")) {
    return { base: fileName.slice(0, -3), ext: ".md" };
  }
  const dot = fileName.lastIndexOf(".");
  if (dot <= 0) return { base: fileName, ext: "" };
  return { base: fileName.slice(0, dot), ext: fileName.slice(dot) };
}

async function uniquePathInDir(
  dir: string,
  fileName: string,
  kind: "map" | "note",
  fromPath: string,
): Promise<string> {
  let candidate = joinPath(dir, fileName);
  if (!(await exists(candidate)) || pathsEqual(candidate, fromPath)) {
    return candidate;
  }
  const { base, ext } = splitEntryName(fileName, kind);
  let n = 2;
  while (await exists(candidate)) {
    candidate = joinPath(dir, `${base}-${n}${ext}`);
    n += 1;
  }
  return candidate;
}

function pathsEqual(a: string, b: string): boolean {
  return a.replace(/\\/g, "/").toLowerCase() === b.replace(/\\/g, "/").toLowerCase();
}

/** Move a map or note into a folder ("" = root). Returns the new absolute path. */
export async function moveVaultItem(
  vaultPath: string,
  kind: "map" | "note",
  fromPath: string,
  destFolder: string,
): Promise<string> {
  const fileName = fromPath.split(/[/\\]/).pop();
  if (!fileName) throw new Error("Invalid path");

  const root = kind === "map" ? vaultMapsDir(vaultPath) : vaultNotesDir(vaultPath);
  const trimmed = normalizeVaultRelativePath(destFolder);
  const destDir = trimmed
    ? joinPath(root, ...trimmed.split("/").filter(Boolean))
    : root;

  if (!(await exists(destDir))) {
    await mkdir(destDir, { recursive: true });
  }

  const destPath = await uniquePathInDir(destDir, fileName, kind, fromPath);
  if (pathsEqual(destPath, fromPath)) return fromPath;

  await rename(fromPath, destPath);
  return destPath;
}

export async function loadVaultSettings(
  vaultPath: string,
): Promise<VaultSettings> {
  const path = vaultSettingsPath(vaultPath);
  if (!(await exists(path))) return { ...DEFAULT_VAULT_SETTINGS };
  try {
    const raw = await readTextFile(path);
    return { ...DEFAULT_VAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_VAULT_SETTINGS };
  }
}

export async function saveVaultSettings(
  vaultPath: string,
  settings: VaultSettings,
): Promise<void> {
  await writeTextFileSafely(
    vaultSettingsPath(vaultPath),
    JSON.stringify(settings, null, 2),
  );
}

export function mapFileNameFromTitle(title: string): string {
  const slug =
    title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "untitled";
  return `${slug}.map.json`;
}

/** Pick a non-colliding map filename under maps/[folder]/. */
export async function uniqueMapFileName(
  vaultPath: string,
  title: string,
  folder = "",
): Promise<string> {
  const base = mapFileNameFromTitle(title).replace(/\.map\.json$/, "");
  const safeFolder = normalizeVaultRelativePath(folder);
  const dir = safeFolder
    ? joinPath(
        vaultMapsDir(vaultPath),
        ...safeFolder.split("/").filter(Boolean),
      )
    : vaultMapsDir(vaultPath);
  if (!(await exists(dir))) {
    await mkdir(dir, { recursive: true });
  }
  let candidate = `${base}.map.json`;
  let n = 2;
  while (await exists(joinPath(dir, candidate))) {
    candidate = `${base}-${n}.map.json`;
    n += 1;
  }
  return candidate;
}

export function noteFileNameFromTitle(title: string): string {
  const slug = title.trim() || "Untitled";
  return `${slug}.md`;
}

/** Pick a non-colliding note filename under notes/[folder]/. */
export async function uniqueNoteFileName(
  vaultPath: string,
  title: string,
  folder = "",
): Promise<string> {
  const base = (title.trim() || "Untitled").replace(/\.md$/i, "");
  validateVaultFileName(`${base}.md`);
  const safeFolder = normalizeVaultRelativePath(folder);
  const dir = safeFolder
    ? joinPath(
        vaultNotesDir(vaultPath),
        ...safeFolder.split("/").filter(Boolean),
      )
    : vaultNotesDir(vaultPath);
  let candidate = `${base}.md`;
  let n = 2;
  while (await exists(joinPath(dir, candidate))) {
    candidate = `${base} ${n}.md`;
    n += 1;
  }
  return candidate;
}

/** Used only when running outside Tauri (vite preview); BaseDirectory kept for API parity. */
export async function ensureAppData(): Promise<void> {
  try {
    await exists(".", { baseDir: BaseDirectory.AppData });
  } catch {
    /* ignore */
  }
}
