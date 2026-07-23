import { describe, expect, it } from "vitest";
import type { MindMapDocument } from "../mindmap/types";
import {
  buildConceptGraphFromJournals,
  conceptJournalSources,
  isDailyJournalMerged,
  mergeDailyJournals,
} from "./journals";

describe("concept graph synchronization", () => {
  it("preserves manual content, links, styles, and positions", () => {
    const existing: MindMapDocument = {
      version: 1,
      title: "Concept Graph",
      root: {
        id: "root",
        text: "Concept Graph",
        children: [
          {
            id: "alpha",
            text: "Alpha",
            style: { fill: "red" },
            children: [],
          },
          {
            id: "manual",
            text: "Manual idea",
            note: "Keep me",
            children: [],
          },
        ],
      },
      layoutStyle: "concept",
      positions: {
        alpha: { x: 10, y: 20 },
        manual: { x: 30, y: 40 },
      },
      links: [
        {
          id: "manual-link",
          fromId: "alpha",
          toId: "manual",
          label: "curated",
        },
      ],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    const result = buildConceptGraphFromJournals(
      [{ name: "Journal", content: "[[Alpha]] and [[Beta]]" }],
      existing,
    );

    expect(result.positions).toEqual(existing.positions);
    expect(result.createdAt).toBe(existing.createdAt);
    // Manual "Alpha" is adopted into the generated concept (same id, provenance).
    expect(result.root.children.filter((node) => node.text === "Alpha")).toHaveLength(1);
    expect(result.root.children).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "alpha",
          text: "Alpha",
          style: { fill: "red" },
          provenance: { kind: "journal-concept", key: "alpha" },
        }),
        expect.objectContaining({
          id: "manual",
          text: "Manual idea",
          note: "Keep me",
        }),
        expect.objectContaining({ text: "Beta" }),
      ]),
    );
    expect(result.links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "manual-link", label: "curated" }),
        expect.objectContaining({ fromId: "alpha" }),
      ]),
    );
  });

  it("maps journal tags into the concept graph with wiki links", () => {
    const result = buildConceptGraphFromJournals([
      { name: "Journal", content: "[[Alpha]] and #beta #gamma" },
    ]);
    expect(result.root.children.map((n) => n.text).sort()).toEqual([
      "Alpha",
      "beta",
      "gamma",
    ]);
    expect(result.links?.length).toBeGreaterThan(0);
    expect(
      result.links?.every(
        (link) =>
          !!link.label && /co-occurred in journal/i.test(link.label),
      ),
    ).toBe(true);
  });

  it("reuses generated concept and link identities", () => {
    const first = buildConceptGraphFromJournals([
      { name: "Journal", content: "[[Alpha]] [[Beta]]" },
    ]);
    const second = buildConceptGraphFromJournals(
      [{ name: "Journal", content: "[[Alpha]] [[Beta]]" }],
      first,
    );

    expect(second.root.children.map((node) => node.id)).toEqual(
      first.root.children.map((node) => node.id),
    );
    expect(second.links?.map((link) => link.id)).toEqual(
      first.links?.map((link) => link.id),
    );
    expect(second.root.children.every((node) => node.provenance)).toBe(true);
    expect(second.links?.every((link) => link.provenance)).toBe(true);
  });

  it("removes only stale generated concepts and links", () => {
    const first = buildConceptGraphFromJournals([
      { name: "Journal", content: "[[Alpha]] [[Beta]] [[Gamma]]" },
    ]);
    const alpha = first.root.children.find((node) => node.text === "Alpha")!;
    alpha.style = { fill: "purple" };
    alpha.note = "curated note";
    first.positions = { [alpha.id]: { x: 12, y: 34 } };
    first.root.children.push({
      id: "manual-child",
      text: "Manual",
      children: [],
    });

    const second = buildConceptGraphFromJournals(
      [{ name: "Journal", content: "[[Alpha]] [[Beta]]" }],
      first,
    );

    expect(second.root.children.some((node) => node.text === "Gamma")).toBe(false);
    expect(second.links).toHaveLength(1);
    expect(second.links?.[0].provenance?.key).toBe("alpha|beta");
    expect(second.links?.[0].label).toMatch(/Co-occurred in Journal/i);
    expect(second.root.children).toContainEqual(
      expect.objectContaining({ id: "manual-child", text: "Manual" }),
    );
    expect(second.root.children).toContainEqual(
      expect.objectContaining({
        id: alpha.id,
        style: { fill: "purple" },
        note: "curated note",
      }),
    );
    expect(second.positions?.[alpha.id]).toEqual({ x: 12, y: 34 });
  });

  it("keeps a stale generated node when a manual link curates it", () => {
    const first = buildConceptGraphFromJournals([
      { name: "Journal", content: "[[Alpha]] [[Beta]]" },
    ]);
    const beta = first.root.children.find((node) => node.text === "Beta")!;
    first.root.children.push({ id: "manual", text: "Manual", children: [] });
    first.links!.push({
      id: "manual-link",
      fromId: beta.id,
      toId: "manual",
      label: "keep",
    });

    const second = buildConceptGraphFromJournals(
      [{ name: "Journal", content: "[[Alpha]]" }],
      first,
    );
    const preserved = second.root.children.find((node) => node.id === beta.id);
    expect(preserved?.provenance).toBeUndefined();
    expect(second.links).toContainEqual(
      expect.objectContaining({ id: "manual-link", label: "keep" }),
    );
  });
});

describe("legacy journal migration helpers", () => {
  it("uses only the continuous journal when legacy sources coexist", () => {
    const sources = conceptJournalSources([
      { name: "2026-07-21", content: "[[Alpha]]" },
      { name: "Journal", content: "[[Alpha]]" },
    ]);
    expect(sources).toEqual([{ name: "Journal", content: "[[Alpha]]" }]);
  });

  it("recognizes merged daily content for idempotent archive retries", () => {
    const daily = { name: "2026-07-21", content: "Worked on [[Alpha]]." };
    const merged = mergeDailyJournals([daily]);
    expect(isDailyJournalMerged(merged, daily)).toBe(true);
    expect(
      isDailyJournalMerged("# Tuesday\n\nSomething else", daily),
    ).toBe(false);
  });
});
