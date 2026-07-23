import { describe, expect, it } from "vitest";
import { resolveTransientLinkingState } from "./transientInteraction";

const linking = {
  linkingFromId: "source",
  pendingLink: { fromId: "source", toId: "target" },
};

describe("transient map interaction navigation", () => {
  it.each(["note", "settings", "tag", "data", "history", "welcome"])(
    "clears link state when navigating to %s",
    (view) => {
      expect(resolveTransientLinkingState(view, linking)).toEqual({
        linkingFromId: null,
        pendingLink: null,
      });
    },
  );

  it("preserves link state while remaining on the map", () => {
    expect(resolveTransientLinkingState("map", linking)).toBe(linking);
  });
});
