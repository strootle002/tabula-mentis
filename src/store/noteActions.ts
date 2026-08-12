import type { AppActions, GetState, SetState } from "./storeTypes";
import {
  queueNoteSave,
  queueTagNoteSave,
  collectDocumentNodeNoteRefs,
  scheduleNoteSave,
  scheduleTagNoteSave,
  flushPendingSaves,
  rememberSavedNote,
  maybeToastSaved,
} from "./storeServices";
import {
  createNotesFolder,
  isNodeNotesPath,
  isTagNotesPath,
  listNoteTemplates,
  loadMap,
  loadNote,
  loadNoteTemplate,
  saveNote,
  saveNoteTemplate,
  setSidebarPrefs,
  tagNoteAbsolutePath,
  TAG_NOTES_ROOT,
  uniqueNoteFileName,
} from "../vault/vaultFs";
import { allTags, collectTagHitsFromNotes, extractTags, linesWithTag, relatedTags } from "../notes/links";
import { withRecentPath } from "../notes/libraryTree";
import { rootNodeTag, upsertNoteIndex } from "./indexing";

export type NoteActions = Pick<
  AppActions,
  | "openNote"
  | "createNote"
  | "saveActiveNoteAsTemplate"
  | "createNoteFromTemplate"
  | "setNoteContent"
  | "saveActiveNote"
  | "openTag"
  | "setTagNoteContent"
  | "saveActiveTagNote"
  | "getRelatedTags"
  | "getAllTags"
>;

function scanMapTagHits(
  get: GetState,
  noteHits: import("../notes/links").TagLineHit[],
  tag: string,
  stillActive: () => boolean,
  apply: (hits: import("../notes/links").TagLineHit[]) => void,
) {
  const { maps, activeMap, activeMapPath } = get();
  void Promise.all(
    maps.map(async (meta) => ({
      meta,
      map:
        activeMap && meta.path === activeMapPath
          ? activeMap
          : await loadMap(meta.path).catch(() => null),
    })),
  ).then((records) => {
    if (!stillActive()) return;
    const hits = [...noteHits];
    for (const { meta, map } of records) {
      if (!map) continue;
      // A map whose root represents this tag links back to its root node.
      if (rootNodeTag(map) === tag) {
        const label = map.root.text.trim() || map.title;
        hits.push({
          source: "node",
          noteName: label,
          mapName: map.title,
          mapPath: meta.path,
          nodeId: map.root.id,
          line: label,
          lineNumber: 1,
        });
      }
      for (const ref of collectDocumentNodeNoteRefs(map)) {
        for (const row of linesWithTag(ref.note, tag)) {
          hits.push({
            source: "node",
            noteName: ref.text,
            mapName: map.title,
            mapPath: meta.path,
            nodeId: ref.nodeId,
            line: row.line,
            lineNumber: row.lineNumber,
          });
        }
      }
    }
    apply(hits);
  });
}

export function createNoteActions(set: SetState, get: GetState): NoteActions {
  return {
  openNote: async (path) => {
    try {
      await flushPendingSaves(get);
      const content = await loadNote(path);
      const name = path.split(/[/\\]/).pop()!.replace(/\.md$/, "");
      rememberSavedNote(path, content);
      set({
        view: "note",
        activeNotePath: path,
        activeNoteName: name,
        activeNoteContent: content,
        dirtyNote: false,
        error: null,
      });
      void get().updateVaultSettings({
        recentPaths: withRecentPath(get().vaultSettings.recentPaths, {
          kind: "note",
          path,
          name,
        }),
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      set({ error: `Could not open note: ${message}` });
    }
  },

  createNote: async (title = "Untitled Note", folder = "", content) => {
    const { vaultPath } = get();
    if (!vaultPath) return;
    try {
      const body = content ?? `# ${title}\n\n`;
      const fileName = await uniqueNoteFileName(vaultPath, title, folder);
      const path = await saveNote(vaultPath, fileName, body, folder);
      set({ createDialog: null, error: null });
      await get().refreshVault();
      await get().openNote(path);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      set({ error: `Could not create note: ${message}` });
    }
  },

  saveActiveNoteAsTemplate: async (name) => {
    const { vaultPath, activeNotePath, activeNoteName, activeNoteContent } =
      get();
    if (!vaultPath || !activeNotePath) return;
    try {
      const templateName =
        (name ?? activeNoteName ?? "").trim() || "Template";
      // The live editor buffer is the source of truth, saved or not.
      await saveNoteTemplate(vaultPath, templateName, activeNoteContent);
      set({ noteTemplates: await listNoteTemplates(vaultPath) });
      get().pushToast(`Saved template "${templateName}"`, "success");
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      set({ error: `Could not save template: ${message}` });
    }
  },

  createNoteFromTemplate: async (templatePath, title, folder = "") => {
    try {
      const template = await loadNoteTemplate(templatePath);
      // Retitle a leading H1 so the note body matches its file name.
      const content = template.replace(/^(\s*)#\s+[^\n]*/, `$1# ${title}`);
      await get().createNote(title, folder, content);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      set({ error: `Could not create note from template: ${message}` });
    }
  },

  setNoteContent: (content) => {
    set({ activeNoteContent: content, dirtyNote: true });
    scheduleNoteSave(get, set);
  },

  saveActiveNote: async () => {
    const { activeNotePath, activeNoteContent } = get();
    if (!activeNotePath) return;
    await queueNoteSave(activeNotePath, activeNoteContent);
    const latest = get();
    if (
      latest.activeNotePath !== activeNotePath ||
      latest.activeNoteContent !== activeNoteContent
    ) {
      return;
    }
    const meta = get().notes.find((n) => n.path === activeNotePath);
    if (get().dirtyNote) maybeToastSaved(get);
    set({
      dirtyNote: false,
      ...(meta
        ? { noteIndex: upsertNoteIndex(get().noteIndex, meta, activeNoteContent) }
        : {}),
    });
  },

  openTag: async (tag) => {
    const t = tag.toLowerCase().replace(/^#/, "");
    const { noteIndex, vaultPath } = get();
    try {
      await flushPendingSaves(get);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      set({ error: message });
      return;
    }

    const noteHits = collectTagHitsFromNotes(
      noteIndex.filter(
        (note) => !isNodeNotesPath(note.folder) && !isTagNotesPath(note.folder),
      ),
      t,
    );

    let tagNoteContent = "";
    let tagNotePath: string | null = null;
    if (vaultPath) {
      tagNotePath = tagNoteAbsolutePath(vaultPath, t);
      try {
        tagNoteContent = await loadNote(tagNotePath);
        rememberSavedNote(tagNotePath, tagNoteContent);
      } catch {
        tagNoteContent = "";
      }
    }

    set({
      activeTag: t,
      tagHits: noteHits,
      view: "tag",
      navMode: "tags",
      activeTagNoteContent: tagNoteContent,
      activeTagNotePath: tagNotePath,
      dirtyTagNote: false,
      error: null,
    });
    void setSidebarPrefs({ navMode: "tags" });
    scanMapTagHits(
      get,
      noteHits,
      t,
      () => {
        const latest = get();
        return latest.activeTag === t && latest.view === "tag";
      },
      (hits) => set({ tagHits: hits }),
    );
  },

  setTagNoteContent: (content) => {
    set({ activeTagNoteContent: content, dirtyTagNote: true });
    scheduleTagNoteSave(get, set);
  },

  saveActiveTagNote: async () => {
    const { vaultPath, activeTag, activeTagNoteContent, activeTagNotePath } =
      get();
    if (!vaultPath || !activeTag) return;

    await createNotesFolder(vaultPath, TAG_NOTES_ROOT);
    const path =
      activeTagNotePath ?? tagNoteAbsolutePath(vaultPath, activeTag);
    await queueTagNoteSave(path, activeTagNoteContent);
    const latest = get();
    if (
      latest.activeTag !== activeTag ||
      latest.activeTagNoteContent !== activeTagNoteContent
    ) {
      return;
    }
    set({
      activeTagNotePath: path,
      dirtyTagNote: false,
    });
  },

  getRelatedTags: (tag) => {
    const { noteIndex, activeMap } = get();
    const mapTagSets: string[][] = [];
    if (activeMap) {
      for (const ref of collectDocumentNodeNoteRefs(activeMap)) {
        mapTagSets.push(extractTags(ref.note));
      }
    }
    return relatedTags(noteIndex, tag, mapTagSets);
  },

  getAllTags: () => {
    const { noteIndex, mapNodeTags } = get();
    return [...new Set([...allTags(noteIndex), ...mapNodeTags])].sort();
  }
  };
}
