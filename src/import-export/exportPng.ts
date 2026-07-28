/**
 * Rasterize a mind map via Canvas2D from layout geometry.
 *
 * Avoids WebKitGTK's SVG→Image→canvas path, which aborts the process with
 * `malloc(): unaligned fastbin chunk detected` on Linux Tauri builds.
 */
import { readFile } from "@tauri-apps/plugin-fs";
import { isTauri } from "@tauri-apps/api/core";
import {
  nodeImagesLayout,
  wrapNodeTextLines,
} from "../mindmap/layout";
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

const MAX_EDGE = 4096;

export interface ExportPngColors {
  canvas: string;
  edge: string;
  accent: string;
  textMuted: string;
  nodeFill: string;
  nodeStroke: string;
  nodeText: string;
  bgElevated: string;
}

export interface ExportLayoutToPngOptions {
  layoutStyle: MapLayoutStyle;
  flowDir?: FlowDir | null;
  colors: ExportPngColors;
  vaultPath?: string | null;
  /** World-space crop (e.g. the current viewport). Omit to render the full map. */
  region?: { x: number; y: number; width: number; height: number };
}

function cssColor(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  return (
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() ||
    fallback
  );
}

export function exportThemeColors(): ExportPngColors {
  return {
    canvas: cssColor("--canvas", "#ebe7df"),
    edge: cssColor("--edge", "#958b7c"),
    accent: cssColor("--accent", "#1a7a62"),
    textMuted: cssColor("--text-muted", "#7a7166"),
    nodeFill: cssColor("--node-fill", "#f4f1ea"),
    nodeStroke: cssColor("--node-stroke", "#5a5348"),
    nodeText: cssColor("--node-text", "#3a342c"),
    bgElevated: cssColor("--bg-elevated", "#f0ebe3"),
  };
}

/** Cap raster size so GPU/canvas allocation stays bounded. */
export function exportRasterSize(
  layoutWidth: number,
  layoutHeight: number,
  maxEdge = MAX_EDGE,
): { width: number; height: number; scale: number } {
  const lw = Number.isFinite(layoutWidth) ? Math.max(layoutWidth, 1) : 1;
  const lh = Number.isFinite(layoutHeight) ? Math.max(layoutHeight, 1) : 1;
  const scale = Math.min(1, maxEdge / Math.max(lw, lh));
  return {
    width: Math.max(1, Math.round(lw * scale)),
    height: Math.max(1, Math.round(lh * scale)),
    scale,
  };
}

function mimeFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "svg":
      return "image/svg+xml";
    case "bmp":
      return "image/bmp";
    default:
      return "image/png";
  }
}

/** MIME type for a vault asset path (used by PNG + HTML exporters). */
export function assetMimeFromPath(path: string): string {
  return mimeFromPath(path);
}

function loadHtmlImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image failed to load"));
    img.src = url;
  });
}

async function loadNodeImage(
  vaultPath: string | null | undefined,
  src: string,
): Promise<CanvasImageSource | null> {
  if (!vaultPath || !src) return null;

  // Prefer raw file bytes → ImageBitmap so we never touch asset:// inside a
  // canvas pipeline (CORS/taint and WebKit crashes).
  if (isTauri()) {
    try {
      const abs = absoluteAssetPath(vaultPath, src);
      const bytes = await readFile(abs);
      const blob = new Blob([bytes], { type: mimeFromPath(src) });
      return await createImageBitmap(blob);
    } catch {
      /* fall through */
    }
  }

  try {
    return await loadHtmlImage(assetDisplayUrl(vaultPath, src));
  } catch {
    return null;
  }
}

/** SVG/`Path2D` compatible edge curve (shared with visual HTML export). */
export function edgePathD(
  edge: LayoutEdge,
  layoutStyle: MapLayoutStyle,
  flowDir: FlowDir | null | undefined,
): string {
  const mx = (edge.x1 + edge.x2) / 2;
  const my = (edge.y1 + edge.y2) / 2;
  const isLink = edge.kind === "link";
  const dx = Math.abs(edge.x2 - edge.x1);
  const dy = Math.abs(edge.y2 - edge.y1);
  const radialOrConcept =
    layoutStyle === "radial" || layoutStyle === "concept";
  const useVerticalCurve =
    !isLink &&
    (layoutStyle === "down" ||
      (layoutStyle === "flowchart" && flowDir === "down") ||
      (radialOrConcept && dy >= dx));
  const useHorizontalCurve =
    !isLink &&
    (layoutStyle === "left" ||
      layoutStyle === "right" ||
      (layoutStyle === "flowchart" &&
        (flowDir === "left" || flowDir === "right")) ||
      (radialOrConcept && dx > dy));

  if (useVerticalCurve) {
    return `M ${edge.x1} ${edge.y1} C ${edge.x1} ${my}, ${edge.x2} ${my}, ${edge.x2} ${edge.y2}`;
  }
  if (useHorizontalCurve) {
    return `M ${edge.x1} ${edge.y1} C ${mx} ${edge.y1}, ${mx} ${edge.y2}, ${edge.x2} ${edge.y2}`;
  }
  if (isLink) {
    return `M ${edge.x1} ${edge.y1} Q ${mx} ${my - 28}, ${edge.x2} ${edge.y2}`;
  }
  return `M ${edge.x1} ${edge.y1} C ${mx} ${edge.y1}, ${mx} ${edge.y2}, ${edge.x2} ${edge.y2}`;
}

function edgePath(
  edge: LayoutEdge,
  layoutStyle: MapLayoutStyle,
  flowDir: FlowDir | null | undefined,
): Path2D {
  return new Path2D(edgePathD(edge, layoutStyle, flowDir));
}

function drawArrowhead(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  fill: string,
) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const size = 8;
  ctx.save();
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(
    x2 - size * Math.cos(angle - 0.4),
    y2 - size * Math.sin(angle - 0.4),
  );
  ctx.lineTo(
    x2 - size * Math.cos(angle + 0.4),
    y2 - size * Math.sin(angle + 0.4),
  );
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function roundRectPath(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): Path2D {
  const radius = Math.min(r, w / 2, h / 2);
  const path = new Path2D();
  path.moveTo(x + radius, y);
  path.arcTo(x + w, y, x + w, y + h, radius);
  path.arcTo(x + w, y + h, x, y + h, radius);
  path.arcTo(x, y + h, x, y, radius);
  path.arcTo(x, y, x + w, y, radius);
  path.closePath();
  return path;
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("PNG export failed")),
      "image/png",
    );
  });
}

async function drawNode(
  ctx: CanvasRenderingContext2D,
  node: LayoutNode,
  colors: ExportPngColors,
  layoutStyle: MapLayoutStyle,
  imageCache: Map<string, CanvasImageSource | null>,
  vaultPath: string | null | undefined,
) {
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

  ctx.save();
  ctx.translate(node.x, node.y);

  const body = roundRectPath(0, 0, node.width, node.height, radius);
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = isRadialRoot ? 2.75 : 1.5;
  if (node.floating) ctx.setLineDash([5, 3]);
  ctx.fill(body);
  ctx.stroke(body);
  ctx.setLineDash([]);

  const images = node.images ?? [];
  const hasImages = images.length > 0 && !!vaultPath;
  const imgLayout = hasImages
    ? nodeImagesLayout(
        node.width,
        scale,
        fontSize,
        node.text || " ",
        images,
      )
    : null;
  const textCenterY = imgLayout ? imgLayout.textCenterY : node.height / 2;

  if (hasImages && imgLayout) {
    for (const p of imgLayout.placements) {
      let bitmap = imageCache.get(p.src);
      if (bitmap === undefined) {
        bitmap = await loadNodeImage(vaultPath, p.src);
        imageCache.set(p.src, bitmap);
      }
      if (bitmap) {
        ctx.drawImage(bitmap, p.x, p.y, p.w, p.h);
      }
    }
  }

  const lines = wrapNodeTextLines(node.text, fontSize, scale, node.width);
  const lineHeight = fontSize * 1.35;
  const startY = textCenterY - ((lines.length - 1) * lineHeight) / 2;
  ctx.fillStyle = textColor;
  ctx.font = `${isRadialRoot ? 700 : 500} ${fontSize}px "Source Sans 3", "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i]!, node.width / 2, startY + i * lineHeight);
  }

  if (node.hasChildren) {
    const bx = node.width + 6;
    const by = node.height / 2 - 8;
    ctx.beginPath();
    ctx.arc(bx + 8, by + 8, 8, 0, Math.PI * 2);
    ctx.fillStyle = colors.bgElevated;
    ctx.strokeStyle = colors.edge;
    ctx.lineWidth = 1;
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = colors.textMuted;
    ctx.font = `11px "Source Sans 3", "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(node.collapsed ? "+" : "−", bx + 8, by + 9);
  }

  ctx.restore();
}

export async function exportLayoutToPng(
  layout: LayoutResult,
  options: ExportLayoutToPngOptions,
): Promise<Blob> {
  const region = options.region;
  const { width, height, scale } = exportRasterSize(
    region ? region.width : layout.width,
    region ? region.height : layout.height,
  );
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get canvas context");

  ctx.fillStyle = options.colors.canvas;
  ctx.fillRect(0, 0, width, height);
  ctx.scale(scale, scale);
  if (region) ctx.translate(-region.x, -region.y);

  const flowDir = options.flowDir;
  for (const edge of layout.edges) {
    const isLink = edge.kind === "link";
    const stroke = isLink ? options.colors.accent : options.colors.edge;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = isLink ? 1.75 : 1.5;
    ctx.setLineDash(isLink ? [6, 4] : []);
    ctx.stroke(edgePath(edge, options.layoutStyle, flowDir));
    ctx.setLineDash([]);

    const showArrow =
      isLink ||
      options.layoutStyle === "flowchart" ||
      options.layoutStyle === "concept";
    if (showArrow) {
      drawArrowhead(ctx, edge.x1, edge.y1, edge.x2, edge.y2, stroke);
    }

    if (edge.label) {
      const mx = (edge.x1 + edge.x2) / 2;
      const my = (edge.y1 + edge.y2) / 2;
      const label =
        edge.label.length > 36
          ? `${edge.label.slice(0, 34)}…`
          : edge.label;
      ctx.fillStyle = options.colors.textMuted;
      ctx.font = `11px "Source Sans 3", "Segoe UI", system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(label, mx, my - 10);
    }
  }

  const imageCache = new Map<string, CanvasImageSource | null>();
  // Prefetch unique image srcs so draw order stays stable.
  const uniqueSrcs = new Set<string>();
  for (const node of layout.nodes) {
    for (const img of node.images ?? []) uniqueSrcs.add(img.src);
  }
  await Promise.all(
    [...uniqueSrcs].map(async (src) => {
      imageCache.set(src, await loadNodeImage(options.vaultPath, src));
    }),
  );

  for (const node of layout.nodes) {
    await drawNode(
      ctx,
      node,
      options.colors,
      options.layoutStyle,
      imageCache,
      options.vaultPath,
    );
  }

  for (const bitmap of imageCache.values()) {
    if (bitmap && "close" in bitmap && typeof bitmap.close === "function") {
      try {
        bitmap.close();
      } catch {
        /* ignore */
      }
    }
  }

  return canvasToPngBlob(canvas);
}
