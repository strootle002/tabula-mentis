import { describe, expect, it } from "vitest";
import {
  findDropTarget,
  resolveDropIntent,
  type DropIntent,
} from "./dropZones";
import type { LayoutNode } from "./types";

function node(
  id: string,
  x: number,
  y: number,
  width = 120,
  height = 40,
  parentId: string | null = "root",
): LayoutNode {
  return {
    id,
    parentId,
    text: id,
    x,
    y,
    width,
    height,
    depth: parentId ? 1 : 0,
    collapsed: false,
    hasChildren: false,
    style: {},
    images: [],
    childIds: [],
  };
}

describe("drop zone hit testing", () => {
  const target = node("a", 200, 100);
  const moving = node("b", 180, 90);

  it("finds a target from pointer inside, halo, or body overlap", () => {
    const nodes = [target];
    const blocked = new Set(["b"]);

    expect(
      findDropTarget(nodes, 220, 120, blocked, moving)?.id,
    ).toBe("a");
    expect(
      findDropTarget(nodes, 195, 95, blocked, null)?.id,
    ).toBe("a");
    expect(
      findDropTarget(nodes, 0, 0, blocked, moving)?.id,
    ).toBe("a");
    expect(findDropTarget(nodes, 0, 0, blocked, null)).toBeNull();
  });

  it("maps right-layout zones to child / sibling above / sibling below", () => {
    expect(resolveDropIntent(target, 290, 120, "right").kind).toBe("child");
    expect(resolveDropIntent(target, 220, 110, "right").kind).toBe(
      "sibling-before",
    );
    expect(resolveDropIntent(target, 220, 130, "right").kind).toBe(
      "sibling-after",
    );
  });

  it("maps exterior docks above/below a right-layout node to siblings", () => {
    const above: DropIntent = resolveDropIntent(target, 220, 90, "right");
    const below: DropIntent = resolveDropIntent(target, 220, 150, "right");
    expect(above).toEqual({ targetId: "a", kind: "sibling-before" });
    expect(below).toEqual({ targetId: "a", kind: "sibling-after" });
  });

  it("maps exterior docks left/right of a down-layout node to siblings", () => {
    expect(resolveDropIntent(target, 190, 120, "down").kind).toBe(
      "sibling-before",
    );
    expect(resolveDropIntent(target, 330, 120, "down").kind).toBe(
      "sibling-after",
    );
    expect(resolveDropIntent(target, 220, 135, "down").kind).toBe("child");
  });

  it("resolves zones from dragged body center (not grab offset)", () => {
    // Body over the upper half → sibling-before; body to the right → child.
    const upperX = target.x + target.width / 2;
    const upperY = target.y + target.height * 0.25;
    expect(resolveDropIntent(target, upperX, upperY, "right").kind).toBe(
      "sibling-before",
    );
    expect(
      resolveDropIntent(
        target,
        target.x + target.width + 10,
        target.y + target.height / 2,
        "right",
      ).kind,
    ).toBe("child");
  });
});
