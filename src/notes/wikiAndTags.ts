import {
  InputRule,
  Mark,
  mergeAttributes,
} from "@tiptap/core";

/** Inline #tag — colored metadata chip for filtering. */
export const HashTag = Mark.create({
  name: "hashTag",
  inclusive: false,

  addAttributes() {
    return {
      tag: {
        default: null,
        parseHTML: (el) =>
          (el as HTMLElement).getAttribute("data-tag") ||
          (el as HTMLElement).textContent?.replace(/^#/, "") ||
          null,
      },
    };
  },

  parseHTML() {
    return [{ tag: "span.note-tag" }, { tag: "span[data-tag]" }];
  },

  renderHTML({ mark }) {
    const tag = String(mark.attrs.tag ?? "");
    return [
      "span",
      mergeAttributes({
        class: "note-tag",
        "data-tag": tag,
      }),
      0,
    ];
  },

  markdownTokenName: "hashTag",

  markdownTokenizer: {
    name: "hashTag",
    level: "inline" as const,
    start(src: string) {
      const re = /(^|[\s([{])(#[a-zA-Z])/;
      const match = re.exec(src);
      if (!match) return -1;
      return match.index + match[1].length;
    },
    tokenize(src: string) {
      const match = /^#([a-zA-Z][\w]*(?:\/[\w]+)*)/.exec(src);
      if (!match) return undefined;
      return {
        type: "hashTag",
        raw: match[0],
        text: match[0],
        tag: match[1],
      };
    },
  },

  parseMarkdown(token, helpers) {
    const tag = String(
      (token as { tag?: string }).tag ??
        String(token.text ?? "").replace(/^#/, ""),
    ).trim();
    if (!tag) return [];
    return helpers.applyMark(
      "hashTag",
      [helpers.createTextNode(`#${tag}`)],
      { tag },
    );
  },

  renderMarkdown(node, helpers) {
    return helpers.renderChildren(node);
  },

  addInputRules() {
    const type = this.type;
    // markInputRule is for closed delimiters like **bold**. Matching an
    // open-ended #tag on every letter swallows keystrokes and freezes typing.
    // Trigger only when a trailing delimiter finishes the tag, then mark the
    // #tag span and re-insert that delimiter (InputRules consume the typed char).
    return [
      new InputRule({
        find: /(^|[\s([{])(#[a-zA-Z][\w]*(?:\/[\w]+)*)([\s.,!?;:)\]}])$/,
        handler: ({ state, range, match }) => {
          const raw = match[2] ?? "";
          const trailing = match[3] ?? "";
          const tag = raw.replace(/^#/, "");
          if (!tag || !trailing) return null;

          const fullMatch = match[0] ?? "";
          // `range` covers the match minus the just-typed trailing character.
          const matchedInDoc = fullMatch.slice(
            0,
            fullMatch.length - trailing.length,
          );
          const offset = matchedInDoc.indexOf(raw);
          if (offset < 0) return null;
          const textStart = range.from + offset;
          const textEnd = textStart + raw.length;

          const { tr } = state;
          tr.insertText(trailing, range.to);
          tr.addMark(textStart, textEnd, type.create({ tag }));
          tr.removeStoredMark(type);
        },
      }),
    ];
  },
});

/** Parse `[[Target]]` or `[[Target|Label]]` into target + display label. */
export function parseWikiTarget(raw: string): { target: string; label: string } {
  const trimmed = raw.trim();
  const pipe = trimmed.indexOf("|");
  if (pipe < 0) return { target: trimmed, label: trimmed };
  const target = trimmed.slice(0, pipe).trim();
  const label = trimmed.slice(pipe + 1).trim() || target;
  return { target, label };
}

/** Inline [[WikiLink]] — navigable note reference. */
export const WikiLink = Mark.create({
  name: "wikiLink",
  inclusive: false,

  addAttributes() {
    return {
      target: {
        default: null,
        parseHTML: (el) =>
          (el as HTMLElement).getAttribute("data-wiki") ||
          (el as HTMLElement).textContent?.replace(/^\[\[|\]\]$/g, "") ||
          null,
      },
    };
  },

  parseHTML() {
    return [{ tag: "span.note-wiki-link" }, { tag: "span[data-wiki]" }];
  },

  renderHTML({ mark }) {
    const target = String(mark.attrs.target ?? "");
    return [
      "span",
      mergeAttributes({
        class: "note-wiki-link",
        "data-wiki": target,
        title: target ? `Open [[${target}]]` : undefined,
      }),
      0,
    ];
  },

  markdownTokenName: "wikiLink",

  markdownTokenizer: {
    name: "wikiLink",
    level: "inline" as const,
    start(src: string) {
      return src.indexOf("[[");
    },
    tokenize(src: string) {
      const match = /^\[\[([^\]]+)\]\]/.exec(src);
      if (!match) return undefined;
      const { target, label } = parseWikiTarget(match[1] ?? "");
      if (!target) return undefined;
      return {
        type: "wikiLink",
        raw: match[0],
        text: label,
        target,
        label,
      };
    },
  },

  parseMarkdown(token, helpers) {
    const target = String((token as { target?: string }).target ?? "").trim();
    const label = String(
      (token as { label?: string }).label ?? token.text ?? target,
    ).trim();
    if (!target) return [];
    return helpers.applyMark(
      "wikiLink",
      [helpers.createTextNode(label || target)],
      { target },
    );
  },

  renderMarkdown(node) {
    const target = String(node.attrs?.target ?? "").trim();
    const label = String(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (node.content?.[0] as any)?.text ?? target,
    ).trim();
    if (!target) return label;
    if (!label || label === target) return `[[${target}]]`;
    return `[[${target}|${label}]]`;
  },

  addInputRules() {
    const type = this.type;
    return [
      new InputRule({
        find: /\[\[([^\]]+)\]\]$/,
        handler: ({ state, range, match }) => {
          const inner = match[1] ?? "";
          const { target, label } = parseWikiTarget(inner);
          if (!target) return null;
          const { tr } = state;
          tr.insertText(label, range.from, range.to);
          tr.addMark(
            range.from,
            range.from + label.length,
            type.create({ target }),
          );
          tr.removeStoredMark(type);
        },
      }),
    ];
  },
});
