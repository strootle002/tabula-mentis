import { describe, expect, it, vi } from "vitest";
import { handleNoteEditorLinkClick, isExternalHref } from "./openNoteLink";

describe("openNoteLink", () => {
  it("classifies external hrefs", () => {
    expect(isExternalHref("https://example.com")).toBe(true);
    expect(isExternalHref("mailto:a@b.c")).toBe(true);
    expect(isExternalHref("wiki:Page")).toBe(false);
  });

  it("ignores legacy wiki hrefs without navigating", () => {
    const onError = vi.fn();
    const preventDefault = vi.fn();
    const anchor = document.createElement("a");
    anchor.setAttribute("href", "wiki:Existing");
    const handled = handleNoteEditorLinkClick(
      { preventDefault, target: anchor },
      onError,
    );
    expect(handled).toBe(true);
    expect(preventDefault).toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("rejects relative hrefs instead of navigating the webview", () => {
    const onError = vi.fn();
    const preventDefault = vi.fn();
    const anchor = document.createElement("a");
    anchor.setAttribute("href", "notes/foo.md");
    const handled = handleNoteEditorLinkClick(
      { preventDefault, target: anchor },
      onError,
    );
    expect(handled).toBe(true);
    expect(preventDefault).toHaveBeenCalled();
    expect(onError).toHaveBeenCalled();
  });
});
