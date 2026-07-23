import type { AppActions, GetState, SetState } from "./storeTypes";
import {
  queueNoteSave,
  queueTagNoteSave,
  collectDocumentNodeNoteRefs,
  scheduleNoteSave,
  scheduleTagNoteSave,
  flushPendingSaves,
  rememberSavedNote,
} from "./storeServices";
import {
  archiveEntry,
  createNotesFolder,
  isNodeNotesPath,
  isTagNotesPath,
  loadMap,
  loadNote,
  saveNote,
  setSidebarPrefs,
  tagNoteAbsolutePath,
  TAG_NOTES_ROOT,
  uniqueNoteFileName,
} from "../vault/vaultFs";
import { emptyJournalTemplate, ensureTodaySection, isContinuousJournal, isJournalNote, isJournalNoteName, isDailyJournalMerged, JOURNAL_NOTE_FILE, JOURNALS_FOLDER, mergeDailyJournals } from "../notes/journals";
import { allTags, collectTagHitsFromNotes, extractTags, linesWithTag, relatedTags } from "../notes/links";
import { upsertNoteIndex } from "./indexing";

export type NoteActions = Pick<
  AppActions,
  | "openNote"
  | "createNote"
  | "openTodayJournal"
  | "syncConceptGraphFromJournals"
  | "openConceptGraph"
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
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      set({ error: `Could not open note: ${message}` });
    }
  },

  createNote: async (title = "Untitled Note", folder = "") => {
    const { vaultPath } = get();
    if (!vaultPath) return;
    try {
      const content = `# ${title}\n\n`;
      const fileName = await uniqueNoteFileName(vaultPath, title, folder);
      const path = await saveNote(vaultPath, fileName, content, folder);
      set({ createDialog: null, error: null });
      await get().refreshVault();
      await get().openNote(path);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      set({ error: `Could not create note: ${message}` });
    }
  },

  openTodayJournal: async () => {
    const { vaultPath, notes } = get();
    if (!vaultPath) return;
    try {
      await flushPendingSaves(get);
      await createNotesFolder(vaultPath, JOURNALS_FOLDER);

      const continuous = notes.find((n) =>
        isContinuousJournal(n.name, n.folder),
      );
      let content = continuous
        ? await loadNote(continuous.path)
        : "";
      const dailies = notes.filter(
        (n) => isJournalNote(n.name, n.folder) && isJournalNoteName(n.name),
      );
      let loadedDailies: { name: string; path: string; content: string }[] = [];

      // One-time migration: fold legacy daily YYYY-MM-DD.md files into Journal.md
      if (!continuous) {
        if (dailies.length > 0) {
          loadedDailies = await Promise.all(
            dailies.map(async (n) => ({
              name: n.name,
              path: n.path,
              content: await loadNote(n.path),
            })),
          );
          content = mergeDailyJournals(loadedDailies);
        }
      } else if (dailies.length > 0) {
        // Retry archives left behind by a previous partial failure, but only
        // when their content is demonstrably present in Journal.md.
        loadedDailies = (
          await Promise.all(
            dailies.map(async (n) => ({
              name: n.name,
              path: n.path,
              content: await loadNote(n.path),
            })),
          )
        ).filter((daily) => isDailyJournalMerged(content, daily));
      }

      const next = ensureTodaySection(content || emptyJournalTemplate());
      let path = continuous?.path;
      if (!path || next !== content) {
        path = await saveNote(
          vaultPath,
          JOURNAL_NOTE_FILE,
          next,
          JOURNALS_FOLDER,
        );
      }
      // Archive only after the merged continuous journal has been persisted.
      const archiveFailures: { name: string; message: string }[] = [];
      for (const daily of loadedDailies) {
        try {
          await archiveEntry(vaultPath, daily.path);
        } catch (e) {
          archiveFailures.push({
            name: daily.name,
            message: e instanceof Error ? e.message : String(e),
          });
        }
      }
      await get().refreshVault();
      await get().openNote(path);
      set({ navMode: "journal" });
      void setSidebarPrefs({ navMode: "journal" });
      if (archiveFailures.length > 0) {
        set({
          error:
            `Journal.md was saved, but ${archiveFailures.length} legacy journal ` +
            `file${archiveFailures.length === 1 ? "" : "s"} could not be archived: ` +
            archiveFailures
              .map(({ name, message }) => `${name}.md (${message})`)
              .join("; "),
        });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      set({ error: `Could not open journal: ${message}` });
    }
  },

  // Concept graph is disabled for now (too glitchy). Kept as no-ops so older
  // vaults / callers do not break if they still reference these actions.
  syncConceptGraphFromJournals: async () => {},

  openConceptGraph: async () => {},

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
