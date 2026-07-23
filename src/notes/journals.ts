import type { MapLink, MindMapDocument, MindNode } from "../mindmap/types";
import { extractWikiLinks, extractTags } from "./links";

export const JOURNALS_FOLDER = "journals";
/** Single continuous journal note (Logseq-style daily stream in one file). */
export const JOURNAL_NOTE_NAME = "Journal";
export const JOURNAL_NOTE_FILE = "Journal.md";
export const CONCEPT_GRAPH_TITLE = "Concept Graph";
export const CONCEPT_GRAPH_FILE = "Concept Graph.map.json";
export const CONCEPT_GRAPH_FOLDER = "journals";

export function journalDateKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatJournalHeading(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  if (!y || !m || !d) return dateKey;
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function todayHeading(date = new Date()): string {
  return `# ${formatJournalHeading(journalDateKey(date))}`;
}

/** True if the continuous journal already has today's day heading. */
export function journalHasTodaySection(
  content: string,
  date = new Date(),
): boolean {
  const key = journalDateKey(date);
  const heading = todayHeading(date);
  if (content.includes(heading)) return true;
  // Legacy / alternate forms
  if (content.includes(`# ${key}`)) return true;
  return false;
}

/**
 * Ensure today's heading exists once at the top. Never duplicates.
 * Body is freeform paragraphs (not forced bullets).
 */
export function ensureTodaySection(content: string, date = new Date()): string {
  if (journalHasTodaySection(content, date)) return content;
  const section = `${todayHeading(date)}\n\n`;
  const trimmed = content.trim();
  return trimmed ? `${section}${trimmed}\n` : section;
}

export function emptyJournalTemplate(date = new Date()): string {
  return `${todayHeading(date)}\n\n`;
}

export function isJournalFolder(folder: string): boolean {
  return (
    folder === JOURNALS_FOLDER || folder.startsWith(`${JOURNALS_FOLDER}/`)
  );
}

export function isJournalNoteName(name: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(name);
}

/** Continuous Journal.md or legacy daily YYYY-MM-DD.md under journals/. */
export function isJournalNote(name: string, folder: string): boolean {
  if (!isJournalFolder(folder)) return false;
  return name === JOURNAL_NOTE_NAME || isJournalNoteName(name);
}

export function isContinuousJournal(name: string, folder: string): boolean {
  return isJournalFolder(folder) && name === JOURNAL_NOTE_NAME;
}

export function isConceptGraphMap(name: string, folder: string): boolean {
  return folder === CONCEPT_GRAPH_FOLDER && name === CONCEPT_GRAPH_TITLE;
}

/** Merge legacy daily journal files into one continuous document (newest first). */
export function mergeDailyJournals(
  dailies: { name: string; content: string }[],
): string {
  const sorted = [...dailies].sort((a, b) => b.name.localeCompare(a.name));
  const parts: string[] = [];
  for (const day of sorted) {
    const trimmed = day.content.trim();
    if (!trimmed) {
      parts.push(`# ${formatJournalHeading(day.name)}\n`);
      continue;
    }
    // If the daily file already starts with a heading, keep it; else add one.
    if (/^#\s+/m.test(trimmed.split("\n")[0] ?? "")) {
      parts.push(trimmed);
    } else {
      parts.push(`# ${formatJournalHeading(day.name)}\n\n${trimmed}`);
    }
  }
  return parts.join("\n\n");
}

/** True only when a legacy daily's payload is already present in Journal.md. */
export function isDailyJournalMerged(
  continuous: string,
  daily: { name: string; content: string },
): boolean {
  const trimmed = daily.content.trim();
  if (trimmed) return continuous.includes(trimmed);
  return (
    continuous.includes(`# ${formatJournalHeading(daily.name)}`) ||
    continuous.includes(`# ${daily.name}`)
  );
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

const JOURNAL_CONCEPT_PROVENANCE = "journal-concept" as const;

function conceptPairKey(a: string, b: string): string {
  return pairKey(a.toLowerCase(), b.toLowerCase());
}

function isGeneratedNode(node: MindNode): boolean {
  return node.provenance?.kind === JOURNAL_CONCEPT_PROVENANCE;
}

function isGeneratedLink(link: MapLink): boolean {
  return link.provenance?.kind === JOURNAL_CONCEPT_PROVENANCE;
}

/**
 * Once a continuous journal exists it is the canonical extraction source.
 * This prevents legacy files left behind by a partial archive from being
 * counted a second time.
 */
export function conceptJournalSources<T extends { name: string }>(
  journals: T[],
): T[] {
  const continuous = journals.filter((journal) => journal.name === JOURNAL_NOTE_NAME);
  return continuous.length > 0 ? continuous : journals;
}

/** Build / refresh the concept map from [[wiki links]] and #tags across journals. */
export function buildConceptGraphFromJournals(
  journals: { name: string; content: string }[],
  existing: MindMapDocument | null = null,
): MindMapDocument {
  const now = new Date().toISOString();
  const existingGeneratedByKey = new Map<string, MindNode>();
  const existingGeneratedById = new Map<string, MindNode>();
  const existingManualByTitleKey = new Map<string, MindNode>();
  const walkExisting = (node: MindNode, isDocRoot = false) => {
    if (!isDocRoot) {
      if (isGeneratedNode(node) && node.provenance?.key) {
        existingGeneratedByKey.set(node.provenance.key, node);
        existingGeneratedById.set(node.id, node);
      } else if (!isGeneratedNode(node)) {
        const titleKey = node.text.trim().toLowerCase();
        if (titleKey && !existingManualByTitleKey.has(titleKey)) {
          existingManualByTitleKey.set(titleKey, node);
        }
      }
    }
    node.children.forEach((child) => walkExisting(child, false));
  };
  if (existing) walkExisting(existing.root, true);
  for (const node of existing?.floatingNodes ?? []) walkExisting(node, false);

  const conceptIds = new Map<string, string>();
  const conceptTexts = new Map<string, string>();
  const adoptedManualIds = new Set<string>();
  /** pairKey(idA|idB) → journal display names that co-occurred the pair */
  const coPairSources = new Map<string, Set<string>>();

  for (const journal of conceptJournalSources(journals)) {
    const links = extractWikiLinks(journal.content)
      .map((t) => t.trim())
      .filter(Boolean);
    const tags = extractTags(journal.content).map((tag) => ({
      key: tag.toLowerCase(),
      text: tag,
    }));
    const uniqueKeys: string[] = [];
    const register = (key: string, text: string) => {
      if (!conceptIds.has(key)) {
        const generated = existingGeneratedByKey.get(key);
        const manual = existingManualByTitleKey.get(key);
        const id = generated?.id ?? manual?.id ?? crypto.randomUUID();
        if (!generated && manual) adoptedManualIds.add(manual.id);
        conceptIds.set(key, id);
        conceptTexts.set(key, text);
      }
      if (!uniqueKeys.includes(key)) uniqueKeys.push(key);
    };
    for (const text of links) {
      register(text.toLowerCase(), text);
    }
    for (const tag of tags) {
      // Prefer an existing wiki-link display form when keys collide.
      register(tag.key, conceptTexts.get(tag.key) ?? tag.text);
    }
    const sourceLabel = journal.name.replace(/\.md$/i, "") || "Journal";
    for (let i = 0; i < uniqueKeys.length; i++) {
      for (let j = i + 1; j < uniqueKeys.length; j++) {
        const a = conceptIds.get(uniqueKeys[i])!;
        const b = conceptIds.get(uniqueKeys[j])!;
        const idPair = pairKey(a, b);
        let sources = coPairSources.get(idPair);
        if (!sources) {
          sources = new Set();
          coPairSources.set(idPair, sources);
        }
        sources.add(sourceLabel);
      }
    }
  }

  const generatedKeys = new Set(conceptIds.keys());
  const manualLinks = (existing?.links ?? []).filter(
    (link) => !isGeneratedLink(link),
  );
  // A stale generated node involved in a manual link has become curated
  // content. Demote it to manual instead of breaking the user's link.
  const protectedStaleIds = new Set<string>();
  for (const link of manualLinks) {
    for (const id of [link.fromId, link.toId]) {
      const node = existingGeneratedById.get(id);
      if (node?.provenance && !generatedKeys.has(node.provenance.key)) {
        protectedStaleIds.add(id);
      }
    }
  }

  const removedGeneratedIds = new Set<string>();
  const stripManagedNodes = (nodes: MindNode[]): MindNode[] => {
    const preserved: MindNode[] = [];
    for (const node of nodes) {
      const nested = stripManagedNodes(node.children);
      if (adoptedManualIds.has(node.id)) {
        // Adopted into generated concepts below — don't also keep as manual.
        preserved.push(...nested);
        continue;
      }
      if (!isGeneratedNode(node)) {
        preserved.push(
          nested === node.children ? node : { ...node, children: nested },
        );
        continue;
      }
      const key = node.provenance!.key;
      if (generatedKeys.has(key)) {
        // Current generated concepts are reattached at the root below.
        continue;
      }
      if (protectedStaleIds.has(node.id)) {
        const { provenance: _generated, ...manualNode } = node;
        preserved.push({ ...manualNode, children: nested });
        continue;
      }
      removedGeneratedIds.add(node.id);
      // Preserve manual descendants even when their generated parent is stale.
      preserved.push(...nested);
    }
    return preserved;
  };
  const preservedChildren = stripManagedNodes(existing?.root.children ?? []);
  const preservedFloatingNodes = stripManagedNodes(existing?.floatingNodes ?? []);
  const children: MindNode[] = [...conceptIds.entries()]
    .sort((a, b) =>
      (conceptTexts.get(a[0]) ?? a[0]).localeCompare(
        conceptTexts.get(b[0]) ?? b[0],
      ),
    )
    .map(([key, id]) => {
      const priorGenerated = existingGeneratedByKey.get(key);
      const priorManual = existingManualByTitleKey.get(key);
      const prior = priorGenerated ?? priorManual;
      return {
        ...prior,
        id,
        text: conceptTexts.get(key) ?? key,
        provenance: { kind: JOURNAL_CONCEPT_PROVENANCE, key },
        children: stripManagedNodes(prior?.children ?? []),
      };
    });

  const existingGeneratedLinksByPair = new Map<string, MapLink>();
  for (const link of existing?.links ?? []) {
    if (isGeneratedLink(link) && link.provenance?.key) {
      existingGeneratedLinksByPair.set(link.provenance.key, link);
    }
  }
  const generatedLinks: MapLink[] = [];
  const conceptKeysById = new Map(
    [...conceptIds].map(([key, id]) => [id, key]),
  );
  for (const [idPair, sources] of coPairSources) {
    const [fromId, toId] = idPair.split("|");
    const fromKey = conceptKeysById.get(fromId)!;
    const toKey = conceptKeysById.get(toId)!;
    const key = conceptPairKey(fromKey, toKey);
    const sourceList = [...sources].sort();
    const label =
      sourceList.length === 1
        ? `Co-occurred in ${sourceList[0]}`
        : `Co-occurred in ${sourceList.length} journals`;
    generatedLinks.push({
      ...existingGeneratedLinksByPair.get(key),
      id: existingGeneratedLinksByPair.get(key)?.id ?? crypto.randomUUID(),
      fromId,
      toId,
      label,
      provenance: {
        kind: JOURNAL_CONCEPT_PROVENANCE,
        key,
      },
    });
  }
  const links = [...manualLinks, ...generatedLinks];

  const positions = existing?.positions
    ? Object.fromEntries(
        Object.entries(existing.positions).filter(
          ([id]) => !removedGeneratedIds.has(id),
        ),
      )
    : undefined;
  const radialDirs = existing?.radialDirs
    ? Object.fromEntries(
        Object.entries(existing.radialDirs).filter(
          ([id]) => !removedGeneratedIds.has(id),
        ),
      )
    : undefined;

  const rootId = existing?.root.id ?? crypto.randomUUID();

  return {
    ...existing,
    version: 1,
    title: CONCEPT_GRAPH_TITLE,
    root: {
      ...existing?.root,
      id: rootId,
      text: CONCEPT_GRAPH_TITLE,
      note:
        existing?.root.note ??
        "Concepts from journal [[wiki links]] and #tags. An edge means those concepts co-occurred in the same journal file (see the edge label).",
      children: [...children, ...preservedChildren],
    },
    layoutStyle: "concept",
    links,
    positions,
    radialDirs,
    floatingNodes: preservedFloatingNodes.length
      ? preservedFloatingNodes
      : undefined,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}
