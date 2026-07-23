import type {
  MapLink,
  MindMapDocument,
  MindNode,
  NodeStyle,
} from "../mindmap/types";

export type XmlInterchangeKind = "freeplane" | "opml";

export class XmlInterchangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "XmlInterchangeError";
  }
}

export interface XmlImportLimits {
  maxBytes?: number;
  maxDepth?: number;
  maxNodes?: number;
}

const DEFAULT_LIMITS: Required<XmlImportLimits> = {
  maxBytes: 10_000_000,
  maxDepth: 256,
  maxNodes: 50_000,
};

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function safeXml(raw: string, options: XmlImportLimits = {}): XMLDocument {
  const limits = { ...DEFAULT_LIMITS, ...options };
  if (new TextEncoder().encode(raw).byteLength > limits.maxBytes) {
    throw new XmlInterchangeError(`XML exceeds ${limits.maxBytes} byte limit`);
  }
  // DOMParser does not fetch browser external entities, but rejecting all DTD
  // constructs gives the same deterministic boundary in browsers and tests.
  if (/<!DOCTYPE|<!ENTITY|<\?xml-stylesheet/i.test(raw)) {
    throw new XmlInterchangeError("DTD, entity, and stylesheet declarations are not allowed");
  }
  const xml = new DOMParser().parseFromString(raw, "application/xml");
  const parserError = xml.querySelector("parsererror");
  if (parserError) throw new XmlInterchangeError("Invalid XML");
  return xml;
}

function requiredRoot(xml: XMLDocument, name: string): Element {
  const root = xml.documentElement;
  if (root.tagName.toLocaleLowerCase() !== name) {
    throw new XmlInterchangeError(`Expected <${name}> root element`);
  }
  return root;
}

function idFor(element: Element, fallback: string): string {
  return (
    element.getAttribute("ID") ??
    element.getAttribute("_id") ??
    element.getAttribute("id") ??
    fallback
  ).trim() || fallback;
}

function uniqueId(candidate: string, used: Set<string>): string {
  let id = candidate;
  let suffix = 2;
  while (used.has(id)) id = `${candidate}-${suffix++}`;
  used.add(id);
  return id;
}

function styleFromAttributes(element: Element, freeplane: boolean): NodeStyle | undefined {
  const fill = element.getAttribute(freeplane ? "BACKGROUND_COLOR" : "_fill") ?? undefined;
  const stroke = element.getAttribute(freeplane ? "COLOR" : "_stroke") ?? undefined;
  const textColor = element.getAttribute(freeplane ? "COLOR" : "_textColor") ?? undefined;
  const fontSizeRaw = element.getAttribute(freeplane ? "FONT_SIZE" : "_fontSize");
  const fontSize = fontSizeRaw ? Number(fontSizeRaw) : undefined;
  const style: NodeStyle = {
    ...(fill ? { fill } : {}),
    ...(stroke ? { stroke } : {}),
    ...(textColor ? { textColor } : {}),
    ...(Number.isFinite(fontSize) && fontSize! > 0 ? { fontSize } : {}),
  };
  return Object.keys(style).length ? style : undefined;
}

function textContent(element: Element): string {
  return (element.textContent ?? "").replace(/\s+/g, " ").trim();
}

function freeplaneNote(element: Element): string | undefined {
  const rich = [...element.children].find(
    (child) =>
      child.tagName.toLocaleLowerCase() === "richcontent" &&
      child.getAttribute("TYPE")?.toLocaleLowerCase() === "note",
  );
  const note = rich ? textContent(rich) : "";
  const externalLink = element.getAttribute("LINK");
  const parts = [note, externalLink ? `[Link](${externalLink})` : ""].filter(Boolean);
  return parts.length ? parts.join("\n\n") : undefined;
}

interface ParseContext {
  usedIds: Set<string>;
  links: MapLink[];
  nodeCount: number;
  limits: Required<XmlImportLimits>;
}

function parseFreeplaneNode(element: Element, depth: number, context: ParseContext): MindNode {
  if (depth > context.limits.maxDepth) {
    throw new XmlInterchangeError(`XML hierarchy exceeds depth ${context.limits.maxDepth}`);
  }
  context.nodeCount += 1;
  if (context.nodeCount > context.limits.maxNodes) {
    throw new XmlInterchangeError(`XML exceeds ${context.limits.maxNodes} node limit`);
  }
  const id = uniqueId(idFor(element, `fp-${context.nodeCount}`), context.usedIds);
  for (const child of [...element.children]) {
    if (child.tagName.toLocaleLowerCase() !== "arrowlink") continue;
    const destination = child.getAttribute("DESTINATION");
    if (!destination) continue;
    context.links.push({
      id: child.getAttribute("ID") || `link-${id}-${destination}-${context.links.length + 1}`,
      fromId: id,
      toId: destination,
      label: child.getAttribute("LABEL") ?? undefined,
    });
  }
  return {
    id,
    text: element.getAttribute("TEXT") ?? "Untitled",
    note: freeplaneNote(element),
    style: styleFromAttributes(element, true),
    collapsed: element.getAttribute("FOLDED")?.toLocaleLowerCase() === "true" || undefined,
    children: [...element.children]
      .filter((child) => child.tagName.toLocaleLowerCase() === "node")
      .map((child) => parseFreeplaneNode(child, depth + 1, context)),
  };
}

export function importFreeplane(
  raw: string,
  options: XmlImportLimits = {},
): MindMapDocument {
  const limits = { ...DEFAULT_LIMITS, ...options };
  const xml = safeXml(raw, limits);
  const map = requiredRoot(xml, "map");
  const topLevel = [...map.children].filter(
    (element) => element.tagName.toLocaleLowerCase() === "node",
  );
  if (!topLevel.length) throw new XmlInterchangeError("Freeplane map has no root node");
  const context: ParseContext = {
    usedIds: new Set(),
    links: [],
    nodeCount: 0,
    limits,
  };
  const root = parseFreeplaneNode(topLevel[0], 0, context);
  const floatingNodes = topLevel
    .slice(1)
    .map((element) => parseFreeplaneNode(element, 0, context));
  const validLinks = context.links.filter(
    (link) => context.usedIds.has(link.fromId) && context.usedIds.has(link.toId),
  );
  const now = new Date().toISOString();
  return {
    version: 1,
    title: root.text || "Imported Freeplane map",
    root,
    floatingNodes: floatingNodes.length ? floatingNodes : undefined,
    links: validLinks.length ? validLinks : undefined,
    createdAt: now,
    updatedAt: now,
  };
}

function freeplaneNodeXml(node: MindNode, links: MapLink[], depth: number): string {
  const indent = "  ".repeat(depth);
  const attributes = [
    `ID="${escapeXml(node.id)}"`,
    `TEXT="${escapeXml(node.text)}"`,
    node.collapsed ? 'FOLDED="true"' : "",
    node.style?.fill ? `BACKGROUND_COLOR="${escapeXml(node.style.fill)}"` : "",
    node.style?.textColor ? `COLOR="${escapeXml(node.style.textColor)}"` : "",
    node.style?.fontSize ? `FONT_SIZE="${node.style.fontSize}"` : "",
  ].filter(Boolean).join(" ");
  const children: string[] = [];
  if (node.note) {
    children.push(
      `${indent}  <richcontent TYPE="NOTE"><html><body><p>${escapeXml(node.note)}</p></body></html></richcontent>`,
    );
  }
  for (const link of links.filter((candidate) => candidate.fromId === node.id)) {
    children.push(
      `${indent}  <arrowlink ID="${escapeXml(link.id)}" DESTINATION="${escapeXml(link.toId)}"${link.label ? ` LABEL="${escapeXml(link.label)}"` : ""}/>`,
    );
  }
  children.push(...node.children.map((child) => freeplaneNodeXml(child, links, depth + 1)));
  if (!children.length) return `${indent}<node ${attributes}/>`;
  return `${indent}<node ${attributes}>\n${children.join("\n")}\n${indent}</node>`;
}

export function exportFreeplane(document: MindMapDocument): string {
  const links = document.links ?? [];
  const floatingXml = (document.floatingNodes ?? []).map((forest) =>
    freeplaneNodeXml(forest, links, 1),
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<map version="freeplane 1.11.5">',
    freeplaneNodeXml(document.root, links, 1),
    ...floatingXml,
    "</map>",
  ].join("\n");
}

function parseOpmlNode(element: Element, depth: number, context: ParseContext): MindNode {
  if (depth > context.limits.maxDepth) {
    throw new XmlInterchangeError(`XML hierarchy exceeds depth ${context.limits.maxDepth}`);
  }
  context.nodeCount += 1;
  if (context.nodeCount > context.limits.maxNodes) {
    throw new XmlInterchangeError(`XML exceeds ${context.limits.maxNodes} node limit`);
  }
  return {
    id: uniqueId(idFor(element, `opml-${context.nodeCount}`), context.usedIds),
    text: element.getAttribute("text") ?? element.getAttribute("title") ?? "Untitled",
    note: element.getAttribute("_note") ?? element.getAttribute("description") ?? undefined,
    style: styleFromAttributes(element, false),
    children: [...element.children]
      .filter((child) => child.tagName.toLocaleLowerCase() === "outline")
      .map((child) => parseOpmlNode(child, depth + 1, context)),
  };
}

export function importOpml(raw: string, options: XmlImportLimits = {}): MindMapDocument {
  const limits = { ...DEFAULT_LIMITS, ...options };
  const xml = safeXml(raw, limits);
  const opml = requiredRoot(xml, "opml");
  const title = textContent(opml.querySelector("head > title") ?? xml.createElement("title")) ||
    "Imported OPML";
  const outlines = [...opml.querySelectorAll("body > outline")];
  if (!outlines.length) throw new XmlInterchangeError("OPML document has no outlines");
  const context: ParseContext = {
    usedIds: new Set(),
    links: [],
    nodeCount: 0,
    limits,
  };
  const floatingMarked = outlines.filter(
    (outline) => outline.getAttribute("_floating") === "true",
  );
  const mainOutlines = outlines.filter(
    (outline) => outline.getAttribute("_floating") !== "true",
  );

  if (floatingMarked.length > 0) {
    if (!mainOutlines.length) {
      throw new XmlInterchangeError("OPML document has floating outlines but no root");
    }
    const parsedMain = mainOutlines.map((outline) =>
      parseOpmlNode(outline, 0, context),
    );
    const root =
      parsedMain.length === 1
        ? parsedMain[0]
        : {
            id: uniqueId("opml-root", context.usedIds),
            text: title,
            children: parsedMain,
          };
    const floatingNodes = floatingMarked.map((outline) =>
      parseOpmlNode(outline, 0, context),
    );
    const now = new Date().toISOString();
    return {
      version: 1,
      title,
      root,
      floatingNodes,
      createdAt: now,
      updatedAt: now,
    };
  }

  const parsed = outlines.map((outline) => parseOpmlNode(outline, 0, context));
  const root =
    parsed.length === 1
      ? parsed[0]
      : {
          id: uniqueId("opml-root", context.usedIds),
          text: title,
          children: parsed,
        };
  const now = new Date().toISOString();
  return { version: 1, title, root, createdAt: now, updatedAt: now };
}

function opmlNodeXml(node: MindNode, depth: number, floating = false): string {
  const indent = "  ".repeat(depth);
  const attributes = [
    `text="${escapeXml(node.text)}"`,
    `_id="${escapeXml(node.id)}"`,
    floating ? `_floating="true"` : "",
    node.note ? `_note="${escapeXml(node.note)}"` : "",
    node.style?.fill ? `_fill="${escapeXml(node.style.fill)}"` : "",
    node.style?.stroke ? `_stroke="${escapeXml(node.style.stroke)}"` : "",
    node.style?.textColor ? `_textColor="${escapeXml(node.style.textColor)}"` : "",
    node.style?.fontSize ? `_fontSize="${node.style.fontSize}"` : "",
  ].filter(Boolean).join(" ");
  if (!node.children.length) return `${indent}<outline ${attributes}/>`;
  return `${indent}<outline ${attributes}>\n${node.children
    .map((child) => opmlNodeXml(child, depth + 1, false))
    .join("\n")}\n${indent}</outline>`;
}

export function exportOpml(document: MindMapDocument): string {
  const floatingXml = (document.floatingNodes ?? []).map((forest) =>
    opmlNodeXml(forest, 2, true),
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<opml version="2.0">',
    `  <head><title>${escapeXml(document.title)}</title></head>`,
    "  <body>",
    opmlNodeXml(document.root, 2),
    ...floatingXml,
    "  </body>",
    "</opml>",
  ].join("\n");
}

export function detectXmlInterchange(fileName: string, raw: string): XmlInterchangeKind | null {
  if (/\.mm$/i.test(fileName)) return "freeplane";
  if (/\.opml$/i.test(fileName)) return "opml";
  const start = raw.slice(0, 1000);
  if (/<map(?:\s|>)/i.test(start)) return "freeplane";
  if (/<opml(?:\s|>)/i.test(start)) return "opml";
  return null;
}
