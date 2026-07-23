import { assetDisplayUrl } from "../vault/imageAssets";

export interface MarkdownParts {
  frontmatter: string;
  body: string;
}

/** Keep YAML frontmatter byte-for-byte outside the rich-text editor. */
export function splitMarkdownFrontmatter(content: string): MarkdownParts {
  const match = content.match(
    /^(---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$))/,
  );
  if (!match) return { frontmatter: "", body: content };
  return {
    frontmatter: match[1],
    body: content.slice(match[1].length),
  };
}

function escapeAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function rewriteVaultImages(line: string, vaultPath: string): string {
  return line.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    (source, alt: string, rawTarget: string) => {
      const target = rawTarget.trim();
      if (
        /^https?:\/\//i.test(target) ||
        target.startsWith("data:") ||
        target.startsWith("blob:")
      ) {
        return source;
      }
      const display = assetDisplayUrl(vaultPath, target);
      return `<img src="${escapeAttribute(display)}" alt="${escapeAttribute(alt)}" data-asset="${escapeAttribute(target)}">`;
    },
  );
}

/**
 * Resolve vault-relative images for display while leaving all other Markdown
 * for Tiptap's Markdown extension. Fenced code is deliberately untouched.
 */
export function markdownForEditor(
  markdown: string,
  vaultPath: string | null,
): string {
  if (!vaultPath) return markdown;
  let fence: "```" | "~~~" | null = null;
  return markdown
    .split(/\n/)
    .map((line) => {
      const marker = line.match(/^\s*(```|~~~)/)?.[1] as
        | "```"
        | "~~~"
        | undefined;
      if (marker) {
        fence = fence === marker ? null : marker;
        return line;
      }
      return fence ? line : rewriteVaultImages(line, vaultPath);
    })
    .join("\n");
}
