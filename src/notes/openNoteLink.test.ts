import { describe, expect, it, vi } from "vitest";
import { handleNoteEditorLinkClick, isExternalHref } from "./openNoteLink";

describe("openNoteLink", () => {
  it("classifies external hrefs", () => {
    expect(isExternalHref("https://example.com")).toBe(true);
    expect(isExternalHref("mailto:a@b.c")).toBe(true);
    expect(isExternalHref("wiki:Page")).toBe(false);
  });

  it("routes legacy wiki hrefs to onWikiTarget", () => {
    const onError = vi.fn();
    const onWikiTarget = vi.fn();
    const preventDefault = vi.fn();
    const anchor = document.createElement("a");
    anchor.setAttribute("href", "wiki:Existing");
    const handled = handleNoteEditorLinkClick(
      { preventDefault, target: anchor },
      { onError, onWikiTarget },
    );
    expect(handled).toBe(true);
    expect(preventDefault).toHaveBeenCalled();
    expect(onWikiTarget).toHaveBeenCalledWith("Existing");
    expect(onError).not.toHaveBeenCalled();
  });

  it("opens wiki link spans via onWikiTarget", () => {
    const onWikiTarget = vi.fn();
    const preventDefault = vi.fn();
    const span = document.createElement("span");
    span.className = "note-wiki-link";
    span.setAttribute("data-wiki", "My Note");
    const handled = handleNoteEditorLinkClick(
      { preventDefault, target: span },
      { onWikiTarget },
    );
    expect(handled).toBe(true);
    expect(onWikiTarget).toHaveBeenCalledWith("My Note");
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
