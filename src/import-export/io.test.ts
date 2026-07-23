import { describe, expect, it } from "vitest";
import type { MindMapDocument } from "../mindmap/types";
import {
  exportMapToCsv,
  importCsvToMap,
  mindMapToTable,
  tableToMapDocument,
} from "./io";

const document: MindMapDocument = {
  version: 1,
  title: "Plan",
  root: {
    id: "root",
    text: "Plan",
    children: [
      { id: "a", text: "Alpha", children: [] },
      { id: "b", text: "Beta", children: [{ id: "b1", text: "Beta leaf", children: [] }] },
    ],
  },
  floatingNodes: [
    {
      id: "float",
      text: "Satellite",
      children: [{ id: "f1", text: "Moon", children: [] }],
    },
  ],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("CSV mindmap table interchange", () => {
  it("omits Forest column when there are no floating nodes", () => {
    const { headers } = mindMapToTable({ ...document, floatingNodes: undefined });
    expect(headers[0]).toBe("Level 1");
    expect(headers).not.toContain("Forest");
  });

  it("exports and reimports floating forests via a Forest column", () => {
    const { headers, rows } = mindMapToTable(document);
    expect(headers[0]).toBe("Forest");
    expect(rows.some((row) => row[0] === "root")).toBe(true);
    expect(rows.some((row) => row[0] === "floating:float")).toBe(true);

    const restored = tableToMapDocument(headers, rows, "Plan");
    expect(restored.root.text).toBe("Plan");
    expect(restored.floatingNodes).toEqual([
      expect.objectContaining({
        id: "float",
        text: "Satellite",
        children: [expect.objectContaining({ text: "Moon" })],
      }),
    ]);

    const viaCsv = importCsvToMap(exportMapToCsv(document), {
      mode: "columns-as-levels",
      hasHeader: true,
      title: "Plan",
    });
    expect(viaCsv.floatingNodes?.[0]?.id).toBe("float");
  });
});
