import { useMemo } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { useAppStore } from "../store/appStore";
import {
  BlockIndex,
  parseMarkdownBlocks,
  renderTransclusions,
} from "../blocks/blocks";
import type { NoteIndexEntry } from "./links";
import { isNodeNotesPath, isTagNotesPath } from "../vault/vaultFs";

// Vault-wide parse is expensive relative to a render, so share one index per
// immutable noteIndex array across every embed instance.
const savedIndexCache = new WeakMap<NoteIndexEntry[], BlockIndex>();

function savedBlockIndex(noteIndex: NoteIndexEntry[]): BlockIndex {
  const cached = savedIndexCache.get(noteIndex);
  if (cached) return cached;
  const index = new BlockIndex();
  for (const entry of noteIndex) {
    if (isNodeNotesPath(entry.folder) || isTagNotesPath(entry.folder)) continue;
    index.upsertPage({
      path: entry.path,
      title: entry.name,
      content: entry.content,
    });
  }
  savedIndexCache.set(noteIndex, index);
  return index;
}

function selfReferenceRegex(blockId: string): RegExp {
  const escaped = blockId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `\\{\\{\\s*(?:embed|transclude)\\s+\\(\\(${escaped}\\)\\)\\s*\\}\\}`,
    "i",
  );
}

export function BlockEmbedView({ node }: NodeViewProps) {
  const blockId = String(node.attrs.blockId ?? "");
  const noteIndex = useAppStore((s) => s.noteIndex);
  const activeNotePath = useAppStore((s) => s.activeNotePath);
  const activeNoteContent = useAppStore((s) => s.activeNoteContent);
  const openNote = useAppStore((s) => s.openNote);

  const index = useMemo(() => savedBlockIndex(noteIndex), [noteIndex]);

  // Prefer the live editor buffer over the note's stale index entry, so
  // same-note edits resolve on each keystroke (cross-note edits land on save).
  const block = useMemo(() => {
    if (!blockId) return undefined;
    if (activeNotePath) {
      const live = parseMarkdownBlocks(activeNoteContent, activeNotePath).find(
        (b) => b.id === blockId,
      );
      if (live) {
        const entry = noteIndex.find((n) => n.path === activeNotePath);
        return {
          ...live,
          pagePath: activeNotePath,
          pageTitle: entry?.name ?? "This note",
        };
      }
    }
    return index.get(blockId);
  }, [index, blockId, activeNotePath, activeNoteContent, noteIndex]);

  const cycle = block ? selfReferenceRegex(blockId).test(block.text) : false;
  const text = useMemo(() => {
    if (!block || cycle) return "";
    return renderTransclusions(block.text, (id) => index.get(id));
  }, [block, cycle, index]);

  return (
    <NodeViewWrapper
      className={`block-embed${block ? "" : " is-missing"}${cycle ? " is-cycle" : ""}`}
      data-block-embed=""
      data-block-id={blockId}
    >
      {!block ? (
        <span className="block-embed-status hint">
          Missing block <code>(({blockId}))</code>
        </span>
      ) : cycle ? (
        <span className="block-embed-status hint">
          Circular block reference <code>(({blockId}))</code>
        </span>
      ) : (
        <>
          <div className="block-embed-text">{text}</div>
          <button
            type="button"
            className="block-embed-source"
            title={`Open ${block.pageTitle}`}
            onClick={() => void openNote(block.pagePath)}
          >
            {block.pagePath === activeNotePath
              ? "This note"
              : block.pageTitle}
          </button>
        </>
      )}
    </NodeViewWrapper>
  );
}
