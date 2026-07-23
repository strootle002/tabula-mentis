// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import { HashTag } from "./wikiAndTags";

let editor: Editor | null = null;

afterEach(() => {
  editor?.destroy();
  editor = null;
});

function typeText(ed: Editor, text: string) {
  for (const ch of text) {
    const { from, to } = ed.state.selection;
    // Input rules listen on handleTextInput; the DOM event arg is unused.
    const handled = ed.view.someProp("handleTextInput", (f) =>
      // @ts-expect-error ProseMirror types require a 5th event/factory arg unused here
      f(ed.view, from, to, ch),
    );
    if (!handled) {
      ed.view.dispatch(ed.state.tr.insertText(ch));
    }
  }
}

describe("HashTag input rule", () => {
  it("lets the full tag text be typed and marks it after a trailing space", () => {
    editor = new Editor({
      extensions: [StarterKit, HashTag, Markdown],
      content: "<p></p>",
    });

    typeText(editor, "Hello #focus ");

    expect(editor.getText()).toBe("Hello #focus ");
    const marks: string[] = [];
    editor.state.doc.descendants((node) => {
      for (const mark of node.marks) {
        if (mark.type.name === "hashTag") {
          marks.push(String(mark.attrs.tag ?? ""));
        }
      }
    });
    expect(marks).toContain("focus");
  });

  it("does not swallow letters while composing a tag", () => {
    editor = new Editor({
      extensions: [StarterKit, HashTag, Markdown],
      content: "<p></p>",
    });

    typeText(editor, "#ab");

    expect(editor.getText()).toBe("#ab");
  });

  it("marks hashtags when loading markdown content", () => {
    editor = new Editor({
      extensions: [StarterKit, HashTag, Markdown],
      content: "See #focus today.",
      contentType: "markdown",
    });

    expect(editor.getText()).toContain("#focus");
    const marks: string[] = [];
    editor.state.doc.descendants((node) => {
      for (const mark of node.marks) {
        if (mark.type.name === "hashTag") {
          marks.push(String(mark.attrs.tag ?? ""));
        }
      }
    });
    expect(marks).toContain("focus");
  });
});
