// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { resolveKeyAction, setKeybindingOverrides } from "./keymap";

function key(key: string, options: KeyboardEventInit = {}) {
  return new KeyboardEvent("keydown", { key, ...options });
}

describe("mindmap keyboard resolution", () => {
  it("uses Tab for child and Enter for sibling by default", () => {
    setKeybindingOverrides({});
    expect(resolveKeyAction(key("Tab"))).toBe("add-child");
    expect(resolveKeyAction(key("Enter"))).toBe("add-sibling");
    expect(resolveKeyAction(key("F2"))).toBe("edit");
    expect(resolveKeyAction(key("t", { ctrlKey: true }))).toBe("add-child");
    expect(resolveKeyAction(key("Enter", { ctrlKey: true }))).toBe(
      "add-sibling",
    );
    expect(resolveKeyAction(key("n", { ctrlKey: true }))).toBe(
      "toggle-node-panel",
    );
  });

  it("honors user overrides", () => {
    setKeybindingOverrides({
      "add-child": [{ key: "c", mod: true }],
    });
    expect(resolveKeyAction(key("c", { ctrlKey: true }))).toBe("add-child");
    expect(resolveKeyAction(key("Tab"))).toBeNull();
    setKeybindingOverrides({});
  });
});
