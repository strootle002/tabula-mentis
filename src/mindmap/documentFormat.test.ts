import { describe, expect, it } from "vitest";
import {
  assertMindMapDocument,
  parseMindMapDocument,
  parseMindMapJson,
} from "./documentFormat";

function validDocument(): Record<string, unknown> {
  return {
    version: 1,
    title: "Test",
    root: {
      id: "root",
      text: "Root",
      children: [{ id: "child", text: "Child", children: [] }],
    },
    floatingNodes: [
      { id: "floating", text: "Floating", children: [] },
    ],
    positions: {
      root: { x: 0, y: -1 },
      floating: { x: 10.5, y: 20 },
    },
    radialDirs: { child: "left" },
    links: [{ id: "link-1", fromId: "child", toId: "floating" }],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
  };
}

describe("mind map document format", () => {
  it("validates complete tree and floating-node descendants", () => {
    const doc = validDocument();
    const floating = (doc.floatingNodes as Record<string, unknown>[])[0]!;
    floating.children = [{ id: "bad", text: "Bad", children: "not-an-array" }];

    expect(() => parseMindMapDocument(doc)).toThrow(
      "$.floatingNodes[0].children[0].children: must be an array",
    );
  });

  it("rejects duplicate node IDs across all forests", () => {
    const doc = validDocument();
    (doc.floatingNodes as Record<string, unknown>[])[0]!.id = "child";

    expect(() => parseMindMapDocument(doc)).toThrow(
      'duplicate node ID "child"',
    );
  });

  it("rejects dangling link endpoints", () => {
    const doc = validDocument();
    (doc.links as Record<string, unknown>[])[0]!.toId = "missing";

    expect(() => parseMindMapDocument(doc)).toThrow(
      'references unknown node "missing"',
    );
  });

  it("strips retired generator provenance from nodes and links", () => {
    const doc = validDocument();
    const child = (
      (doc.root as Record<string, unknown>).children as Record<string, unknown>[]
    )[0]!;
    child.provenance = { kind: "journal-concept", key: "child" };
    (doc.links as Record<string, unknown>[])[0]!.provenance = {
      kind: "journal-concept",
      key: "a|b",
    };

    const parsed = parseMindMapDocument(doc);
    expect("provenance" in parsed.root.children[0]!).toBe(false);
    expect("provenance" in (parsed.links?.[0] ?? {})).toBe(false);
  });

  it("rejects unsupported future versions with upgrade guidance", () => {
    const doc = validDocument();
    doc.version = 2;

    expect(() => parseMindMapDocument(doc)).toThrow(
      "version 2, but this app supports up to version 1",
    );
  });

  it("normalizes safe legacy fields before validation", () => {
    const doc = validDocument();
    delete doc.version;
    delete doc.createdAt;
    delete doc.updatedAt;
    doc.layoutStyle = "fishbone";
    const child = (
      (doc.root as Record<string, unknown>).children as Record<string, unknown>[]
    )[0]!;
    child.image = "assets/legacy.png";

    const parsed = parseMindMapDocument(doc);

    expect(parsed.version).toBe(1);
    expect(Number.isFinite(Date.parse(parsed.createdAt))).toBe(true);
    expect(parsed.updatedAt).toBe(parsed.createdAt);
    expect(parsed.layoutStyle).toBe("right");
    expect(parsed.root.children[0]?.image).toBeUndefined();
    expect(parsed.root.children[0]?.images).toEqual([
      {
        id: "legacy-child",
        src: "assets/legacy.png",
        width: 56,
        height: 42,
      },
    ]);
  });

  it("enforces configurable depth and document size limits", () => {
    const deep = validDocument();
    const child = (
      (deep.root as Record<string, unknown>).children as Record<string, unknown>[]
    )[0]!;
    child.children = [{ id: "grandchild", text: "Grandchild", children: [] }];
    expect(() =>
      parseMindMapDocument(deep, { maxDepth: 1 }),
    ).toThrow("exceeds maximum depth 1");

    expect(() =>
      parseMindMapDocument(validDocument(), { maxNodes: 2 }),
    ).toThrow("exceeds maximum node count 2");
    expect(() =>
      parseMindMapDocument(validDocument(), { maxLinks: 0 }),
    ).toThrow("exceeds maximum link count 0");

    const withImage = validDocument();
    (withImage.root as Record<string, unknown>).images = [
      { id: "image", src: "assets/image.png", width: 40, height: 30 },
    ];
    expect(() =>
      parseMindMapDocument(withImage, { maxImages: 0 }),
    ).toThrow("exceeds maximum image count 0");
  });

  it("protects direct runtime callers from cyclic node objects", () => {
    const doc = validDocument();
    const root = doc.root as Record<string, unknown>;
    (root.children as unknown[]).push(root);

    expect(() => parseMindMapDocument(doc)).toThrow(
      "contains a cycle or repeated node object",
    );
  });

  it("reports invalid JSON with its source and does not accept partial roots", () => {
    expect(() => parseMindMapJson("{", "/vault/maps/broken.map.json")).toThrow(
      "/vault/maps/broken.map.json: invalid JSON",
    );
    expect(() =>
      assertMindMapDocument({
        ...validDocument(),
        root: { id: "root", text: "Root", children: [{}] },
      }),
    ).toThrow("$.root.children[0].id");
  });
});
