/**
 * Standalone HTML export of a map in visual (SVG) form — same layout as the canvas.
 * Text stays selectable; images are inlined as data URLs (portable, Tauri-safe).
 */
import { readFile } from "@tauri-apps/plugin-fs";
import { isTauri } from "@tauri-apps/api/core";
import { nodeImagesLayout, wrapNodeTextLines } from "../mindmap/layout";
import type {
  FlowDir,
  LayoutEdge,
  LayoutNode,
  LayoutResult,
  MapLayoutStyle,
} from "../mindmap/types";
import {
  absoluteAssetPath,
  assetDisplayUrl,
} from "../vault/imageAssets";
import {
  assetMimeFromPath,
  edgePathD,
  type ExportPngColors,
} from "./exportPng";

export interface MapVisualHtmlOptions {
  layoutStyle: MapLayoutStyle;
  flowDir?: FlowDir | null;
  colors: ExportPngColors;
  /** Extra margin around the layout bounds. */
  padding?: number;
  /** Vault root — needed to embed node images. */
  vaultPath?: string | null;
  /** Pre-resolved data URLs keyed by image src (tests / callers). */
  imageDataUrls?: Map<string, string | null>;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function uint8ToBase64(bytes: Uint8Array): string {
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function bytesToDataUrl(bytes: Uint8Array, mime: string): Promise<string> {
  return `data:${mime};base64,${uint8ToBase64(bytes)}`;
}

async function fetchAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    const mime =
      res.headers.get("content-type")?.split(";")[0]?.trim() ||
      "application/octet-stream";
    return bytesToDataUrl(buf, mime);
  } catch {
    return null;
  }
}

/** Load a vault image as a data URL for embedding in exported HTML/SVG. */
export async function loadNodeImageDataUrl(
  vaultPath: string | null | undefined,
  src: string,
): Promise<string | null> {
  if (!vaultPath || !src) return null;

  if (isTauri()) {
    try {
      const abs = absoluteAssetPath(vaultPath, src);
      const bytes = await readFile(abs);
      return await bytesToDataUrl(bytes, assetMimeFromPath(src));
    } catch {
      /* fall through */
    }
  }

  return fetchAsDataUrl(assetDisplayUrl(vaultPath, src));
}

async function resolveImageDataUrls(
  layout: LayoutResult,
  options: MapVisualHtmlOptions,
): Promise<Map<string, string | null>> {
  if (options.imageDataUrls) return options.imageDataUrls;

  const cache = new Map<string, string | null>();
  const unique = new Set<string>();
  for (const node of layout.nodes) {
    for (const img of node.images ?? []) {
      if (img.src) unique.add(img.src);
    }
  }
  await Promise.all(
    [...unique].map(async (src) => {
      cache.set(src, await loadNodeImageDataUrl(options.vaultPath, src));
    }),
  );
  return cache;
}

function arrowheadPoints(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): string {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const size = 8;
  const ax = x2 - size * Math.cos(angle - 0.4);
  const ay = y2 - size * Math.sin(angle - 0.4);
  const bx = x2 - size * Math.cos(angle + 0.4);
  const by = y2 - size * Math.sin(angle + 0.4);
  return `${x2},${y2} ${ax},${ay} ${bx},${by}`;
}

function edgeSvg(
  edge: LayoutEdge,
  layoutStyle: MapLayoutStyle,
  flowDir: FlowDir | null | undefined,
  colors: ExportPngColors,
): string {
  const isLink = edge.kind === "link";
  const stroke = isLink ? colors.accent : colors.edge;
  const dash = isLink ? ' stroke-dasharray="6 4"' : "";
  const d = edgePathD(edge, layoutStyle, flowDir);
  const parts = [
    `<path d="${d}" fill="none" stroke="${escapeXml(stroke)}" stroke-width="${isLink ? 1.75 : 1.5}"${dash} />`,
  ];

  const showArrow =
    isLink || layoutStyle === "flowchart" || layoutStyle === "concept";
  if (showArrow) {
    parts.push(
      `<polygon points="${arrowheadPoints(edge.x1, edge.y1, edge.x2, edge.y2)}" fill="${escapeXml(stroke)}" />`,
    );
  }

  if (edge.label) {
    const mx = (edge.x1 + edge.x2) / 2;
    const my = (edge.y1 + edge.y2) / 2;
    const label =
      edge.label.length > 36 ? `${edge.label.slice(0, 34)}…` : edge.label;
    parts.push(
      `<text x="${mx}" y="${my - 10}" text-anchor="middle" fill="${escapeXml(colors.textMuted)}" font-size="11" font-family="system-ui,Segoe UI,sans-serif">${escapeXml(label)}</text>`,
    );
  }

  return parts.join("\n");
}

function nodeSvg(
  node: LayoutNode,
  colors: ExportPngColors,
  layoutStyle: MapLayoutStyle,
  imageCache: Map<string, string | null>,
): string {
  const isRoot = !node.parentId && !node.floating;
  const isRadialRoot = layoutStyle === "radial" && isRoot;
  const fill = node.style.fill || colors.nodeFill;
  const stroke = isRadialRoot
    ? colors.accent
    : node.floating
      ? colors.textMuted
      : node.style.stroke || colors.nodeStroke;
  const textColor = node.style.textColor || colors.nodeText;
  const fontSize = node.style.fontSize ?? 14;
  const scale = node.style.scale ?? 1;
  const radius = isRadialRoot ? 14 : node.floating ? 4 : 10;
  const strokeWidth = isRadialRoot ? 2.75 : 1.5;
  const dash = node.floating ? ' stroke-dasharray="5 3"' : "";
  const fontWeight = isRadialRoot ? 700 : 500;

  const images = node.images ?? [];
  const imgLayout =
    images.length > 0
      ? nodeImagesLayout(node.width, scale, fontSize, node.text || " ", images)
      : null;
  const textCenterY = imgLayout ? imgLayout.textCenterY : node.height / 2;

  const imageEls =
    imgLayout?.placements
      .map((p) => {
        const href = imageCache.get(p.src);
        if (!href) return "";
        return `<image href="${escapeXml(href)}" x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" preserveAspectRatio="xMidYMid meet" />`;
      })
      .filter(Boolean)
      .join("\n") ?? "";

  const lines = wrapNodeTextLines(node.text, fontSize, scale, node.width);
  const lineHeight = fontSize * 1.35;
  const startY = textCenterY - ((lines.length - 1) * lineHeight) / 2;
  const textEls = lines
    .map(
      (line, i) =>
        `<text x="${node.width / 2}" y="${startY + i * lineHeight}" text-anchor="middle" dominant-baseline="middle" fill="${escapeXml(textColor)}" font-size="${fontSize}" font-weight="${fontWeight}" font-family="system-ui,Segoe UI,sans-serif">${escapeXml(line)}</text>`,
    )
    .join("\n");

  let badge = "";
  if (node.hasChildren) {
    const bx = node.width + 14;
    const by = node.height / 2;
    badge = `
      <circle cx="${bx}" cy="${by}" r="8" fill="${escapeXml(colors.bgElevated)}" stroke="${escapeXml(colors.edge)}" stroke-width="1" />
      <text x="${bx}" y="${by + 1}" text-anchor="middle" dominant-baseline="middle" fill="${escapeXml(colors.textMuted)}" font-size="11" font-family="system-ui,Segoe UI,sans-serif">${node.collapsed ? "+" : "−"}</text>`;
  }

  return `<g transform="translate(${node.x},${node.y})">
    <rect width="${node.width}" height="${node.height}" rx="${radius}" ry="${radius}" fill="${escapeXml(fill)}" stroke="${escapeXml(stroke)}" stroke-width="${strokeWidth}"${dash} />
    ${imageEls}
    ${textEls}
    ${badge}
  </g>`;
}

/** Build an SVG fragment for the laid-out map (no HTML wrapper). */
export async function mapLayoutToSvg(
  layout: LayoutResult,
  options: MapVisualHtmlOptions,
): Promise<string> {
  const pad = options.padding ?? 24;
  const w = Math.max(1, layout.width + pad * 2);
  const h = Math.max(1, layout.height + pad * 2);
  const imageCache = await resolveImageDataUrls(layout, options);
  const edges = layout.edges
    .map((e) =>
      edgeSvg(e, options.layoutStyle, options.flowDir, options.colors),
    )
    .join("\n");
  const nodes = layout.nodes
    .map((n) => nodeSvg(n, options.colors, options.layoutStyle, imageCache))
    .join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${-pad} ${-pad} ${w} ${h}" width="100%" height="100%" role="img" aria-label="Mind map">
  <rect x="${-pad}" y="${-pad}" width="${w}" height="${h}" fill="${escapeXml(options.colors.canvas)}" />
  <g class="edges">${edges}</g>
  <g class="nodes">${nodes}</g>
</svg>`;
}

/** Standalone HTML page containing the map as an SVG mind map (not an outline). */
export async function mapLayoutToVisualHtml(
  title: string,
  layout: LayoutResult,
  options: MapVisualHtmlOptions,
): Promise<string> {
  const svg = await mapLayoutToSvg(layout, options);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeXml(title)}</title>
<style>
  html, body { margin: 0; height: 100%; background: ${escapeXml(options.colors.canvas)}; }
  body { display: flex; flex-direction: column; font-family: system-ui, "Segoe UI", sans-serif; color: ${escapeXml(options.colors.nodeText)}; }
  header { flex: 0 0 auto; padding: 0.75rem 1.25rem; border-bottom: 1px solid ${escapeXml(options.colors.nodeStroke)}33; }
  header h1 { margin: 0; font-size: 1.1rem; font-weight: 600; }
  main { flex: 1 1 auto; min-height: 0; padding: 0.5rem; }
  main svg { display: block; max-width: 100%; max-height: 100%; margin: 0 auto; }
</style>
</head>
<body>
<header><h1>${escapeXml(title)}</h1></header>
<main>${svg}</main>
</body>
</html>
`;
}
