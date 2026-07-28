import { describe, expect, it } from "vitest";
import {
  buildFolderTree,
  expandFolderAncestors,
  filterFolderTree,
  filterLibraryBundles,
  filterLibraryEntries,
  isFolderUnder,
  parentFolderPath,
  remapFolderOrderPaths,
  reorderSiblingFolders,
  sortFolderNodes,
  withRecentPath,
  type LibraryEntry,
  type MapNoteBundle,
} from "./libraryTree";

describe("libraryTree", () => {
  it("expands intermediate ancestors", () => {
    expect(expandFolderAncestors(["Projects/Ideas/Deep"]).sort()).toEqual([
      "Projects",
      "Projects/Ideas",
      "Projects/Ideas/Deep",
    ]);
  });

  it("builds a nested folder tree with segment names", () => {
    const items = new Map<string, LibraryEntry[]>([
      [
        "Projects/Ideas",
        [{ kind: "note", name: "A", path: "/a", folder: "Projects/Ideas" }],
      ],
    ]);
    const bundles = new Map<string, MapNoteBundle[]>();
    const tree = buildFolderTree(["Projects/Ideas"], items, bundles);
    expect(tree).toHaveLength(1);
    expect(tree[0]?.name).toBe("Projects");
    expect(tree[0]?.path).toBe("Projects");
    expect(tree[0]?.children).toHaveLength(1);
    expect(tree[0]?.children[0]?.name).toBe("Ideas");
    expect(tree[0]?.children[0]?.items).toHaveLength(1);
  });

  it("sorts siblings alphabetically and by custom order", () => {
    const items = new Map<string, LibraryEntry[]>();
    const bundles = new Map<string, MapNoteBundle[]>();
    const tree = buildFolderTree(["Zebra", "Alpha", "Beta"], items, bundles);
    const alpha = sortFolderNodes(tree, "alpha", {}, []);
    expect(alpha.map((n) => n.name)).toEqual(["Alpha", "Beta", "Zebra"]);

    const custom = sortFolderNodes(tree, "custom", {}, [
      "Zebra",
      "Alpha",
      "Beta",
    ]);
    expect(custom.map((n) => n.name)).toEqual(["Zebra", "Alpha", "Beta"]);
  });

  it("sorts by modified / created using folder stats", () => {
    const items = new Map<string, LibraryEntry[]>();
    const bundles = new Map<string, MapNoteBundle[]>();
    const tree = buildFolderTree(["Old", "New"], items, bundles);
    const stats = {
      Old: { mtime: 100, birthtime: 50 },
      New: { mtime: 200, birthtime: 40 },
    };
    const byMod = sortFolderNodes(tree, "modified", stats, []);
    expect(byMod.map((n) => n.name)).toEqual(["New", "Old"]);
    const byCreated = sortFolderNodes(tree, "created", stats, []);
    expect(byCreated.map((n) => n.name)).toEqual(["Old", "New"]);
  });

  it("reorders siblings in the flat custom order list", () => {
    expect(parentFolderPath("Projects/Ideas")).toBe("Projects");
    const next = reorderSiblingFolders(
      ["Projects/A", "Projects/B", "Other"],
      ["Projects/A", "Projects/B", "Other"],
      "Projects/B",
      "Projects/A",
      "before",
    );
    expect(next).toEqual(["Projects/B", "Projects/A", "Other"]);

    const after = reorderSiblingFolders(
      ["Projects/A", "Projects/B", "Other"],
      ["Projects/A", "Projects/B", "Other"],
      "Projects/A",
      "Projects/B",
      "after",
    );
    expect(after).toEqual(["Projects/B", "Projects/A", "Other"]);
  });

  it("rejects reorder across different parents", () => {
    expect(
      reorderSiblingFolders(
        ["Projects/A", "Other"],
        ["Projects/A", "Other"],
        "Projects/A",
        "Other",
      ),
    ).toBeNull();
  });

  it("detects folder ancestry and remaps order paths after a move", () => {
    expect(isFolderUnder("Projects/Ideas", "Projects")).toBe(true);
    expect(isFolderUnder("Projects", "Projects/Ideas")).toBe(false);
    expect(
      remapFolderOrderPaths(
        ["Ideas", "Ideas/Deep", "Other"],
        "Ideas",
        "Projects/Ideas",
      ),
    ).toEqual(["Projects/Ideas", "Projects/Ideas/Deep", "Other"]);
  });

  it("filters root entries and bundles case-insensitively", () => {
    const entries: LibraryEntry[] = [
      { kind: "note", name: "Recipes", path: "/a", folder: "" },
      { kind: "map", name: "Budget", path: "/b", folder: "" },
    ];
    expect(filterLibraryEntries(entries, "rec").map((e) => e.name)).toEqual([
      "Recipes",
    ]);
    expect(filterLibraryEntries(entries, "")).toEqual(entries);

    const bundles: MapNoteBundle[] = [
      {
        map: { kind: "map", name: "Trip", path: "/m", folder: "" },
        notes: [{ kind: "note", name: "Packing list", path: "/n", folder: "" }],
        expandKey: "map-notes:/m",
      },
    ];
    expect(filterLibraryBundles(bundles, "packing")).toHaveLength(1);
    expect(filterLibraryBundles(bundles, "nope")).toHaveLength(0);
  });

  it("filters a folder tree, keeping matching folders and matching descendants", () => {
    const items = new Map<string, LibraryEntry[]>([
      [
        "Projects/Ideas",
        [{ kind: "note", name: "Rocket", path: "/a", folder: "Projects/Ideas" }],
      ],
      [
        "Projects/Notes",
        [{ kind: "note", name: "Groceries", path: "/b", folder: "Projects/Notes" }],
      ],
    ]);
    const bundles = new Map<string, MapNoteBundle[]>();
    const tree = buildFolderTree(
      ["Projects/Ideas", "Projects/Notes"],
      items,
      bundles,
    );

    const byDescendant = filterFolderTree(tree, "rocket");
    expect(byDescendant).toHaveLength(1);
    expect(byDescendant[0]?.children.map((c) => c.name)).toEqual(["Ideas"]);
    expect(byDescendant[0]?.children[0]?.items).toHaveLength(1);

    // A folder-name match keeps its full, unfiltered subtree.
    const byFolderName = filterFolderTree(tree, "notes");
    expect(byFolderName[0]?.children.map((c) => c.name)).toEqual(["Notes"]);

    expect(filterFolderTree(tree, "nomatch")).toEqual([]);
    expect(filterFolderTree(tree, "")).toBe(tree);
  });

  it("pushes recent paths to the front, deduped and capped", () => {
    const initial = withRecentPath(undefined, {
      kind: "map",
      path: "/a",
      name: "A",
    });
    expect(initial).toEqual([{ kind: "map", path: "/a", name: "A" }]);

    const withB = withRecentPath(initial, {
      kind: "note",
      path: "/b",
      name: "B",
    });
    expect(withB.map((r) => r.path)).toEqual(["/b", "/a"]);

    // Re-opening "/a" moves it back to the front instead of duplicating it.
    const reopened = withRecentPath(withB, {
      kind: "map",
      path: "/a",
      name: "A renamed",
    });
    expect(reopened.map((r) => r.path)).toEqual(["/a", "/b"]);
    expect(reopened[0]?.name).toBe("A renamed");

    const many = Array.from({ length: 5 }, (_, i) => ({
      kind: "note" as const,
      path: `/p${i}`,
      name: `P${i}`,
    }));
    const capped = withRecentPath(many, {
      kind: "note",
      path: "/new",
      name: "New",
    });
    expect(capped).toHaveLength(5);
    expect(capped[0]?.path).toBe("/new");
  });
});
