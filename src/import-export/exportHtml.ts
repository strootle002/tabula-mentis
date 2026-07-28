/** Minimal, dependency-free Markdown → HTML export (no external renderer). */
import type { MindNode } from "../mindmap/types";

const MAX_OUTLINE_DEPTH = 64;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inlineToHtml(text: string): string {
  let out = escapeHtml(text);
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return out;
}

/** Basic line-based Markdown body → HTML (headings, lists, emphasis, links, paragraphs). */
export function markdownBodyToHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let inList = false;
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      html.push(`<p>${inlineToHtml(paragraph.join(" "))}</p>`);
      paragraph = [];
    }
  };
  const closeList = () => {
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
  };

  for (const line of lines) {
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph();
      closeList();
      const level = heading[1]!.length;
      html.push(`<h${level}>${inlineToHtml(heading[2]!)}</h${level}>`);
      continue;
    }
    const listItem = /^\s*[-*+]\s+(.*)$/.exec(line);
    if (listItem) {
      flushParagraph();
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${inlineToHtml(listItem[1]!)}</li>`);
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      closeList();
      continue;
    }
    closeList();
    paragraph.push(line.trim());
  }
  flushParagraph();
  closeList();
  return html.join("\n");
}

const HTML_STYLE = `
  body { font-family: -apple-system, "Segoe UI", system-ui, sans-serif; max-width: 46rem; margin: 2rem auto; padding: 0 1.5rem; line-height: 1.6; color: #222; }
  h1, h2, h3 { line-height: 1.25; }
  code { background: #f2f2f2; padding: 0.1em 0.3em; border-radius: 4px; }
  a { color: #1a7a62; }
  ul { padding-left: 1.4rem; }
`;

function htmlDocument(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>${HTML_STYLE}</style>
</head>
<body>
${body}
</body>
</html>
`;
}

/** Export a note's Markdown body as a standalone HTML page. */
export function noteContentToHtml(title: string, markdown: string): string {
  return htmlDocument(title, markdownBodyToHtml(markdown));
}

/** Nested outline HTML for one node. Guards cycles and extreme depth. */
function nodeOutlineToHtml(
  node: MindNode,
  depth: number,
  seen: Set<string>,
): string {
  if (!node || typeof node !== "object") return "";
  const label = escapeHtml(node.text || "Untitled");
  if (seen.has(node.id)) return `<li>${label}</li>`;
  if (depth > MAX_OUTLINE_DEPTH) return `<li>${label} …</li>`;

  seen.add(node.id);
  const children = Array.isArray(node.children) ? node.children : [];
  const kids =
    children.length > 0
      ? `<ul>${children
          .map((c) => nodeOutlineToHtml(c, depth + 1, seen))
          .join("")}</ul>`
      : "";
  seen.delete(node.id);
  return `<li>${label}${kids}</li>`;
}

/** Export a mind map's tree structure as a nested HTML outline. */
export function mapOutlineToHtml(title: string, root: MindNode): string {
  const body = `<h1>${escapeHtml(title)}</h1>\n<ul>${nodeOutlineToHtml(root, 0, new Set())}</ul>`;
  return htmlDocument(title, body);
}
