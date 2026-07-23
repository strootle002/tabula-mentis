import type { MindNode, NodeImage } from "./types";

/** Default long edge for newly pasted/attached node images (mindmap units). */
export const DEFAULT_NODE_IMAGE_MAX = 56;
export const MIN_NODE_IMAGE = 24;
/** Max long edge when resizing — keep defaults small, allow large expansion. */
export const MAX_NODE_IMAGE = 720;
export const NODE_IMAGE_GAP = 6;
export const NODE_IMAGE_PAD = 4;

export function createNodeImageId(): string {
  return `img_${Math.random().toString(36).slice(2, 10)}`;
}

/** Fit an intrinsic size into a small mindmap-friendly box. */
export function fitDefaultImageSize(
  naturalW: number,
  naturalH: number,
  maxSide = DEFAULT_NODE_IMAGE_MAX,
): { width: number; height: number } {
  const w = Math.max(1, naturalW);
  const h = Math.max(1, naturalH);
  const scale = maxSide / Math.max(w, h);
  return {
    width: Math.max(MIN_NODE_IMAGE, Math.round(w * scale)),
    height: Math.max(MIN_NODE_IMAGE, Math.round(h * scale)),
  };
}

export async function sizeFromImageFile(
  file: File,
): Promise<{ width: number; height: number }> {
  try {
    const bmp = await createImageBitmap(file);
    const size = fitDefaultImageSize(bmp.width, bmp.height);
    bmp.close();
    return size;
  } catch {
    return fitDefaultImageSize(DEFAULT_NODE_IMAGE_MAX, DEFAULT_NODE_IMAGE_MAX * 0.75);
  }
}

/** Resolve legacy `image` string into `images[]`. */
export function normalizeNodeImages(
  node: Pick<MindNode, "image" | "images">,
): NodeImage[] {
  if (node.images?.length) return node.images;
  if (node.image) {
    const size = fitDefaultImageSize(
      DEFAULT_NODE_IMAGE_MAX,
      DEFAULT_NODE_IMAGE_MAX * 0.75,
    );
    return [
      {
        id: "legacy",
        src: node.image,
        width: size.width,
        height: size.height,
      },
    ];
  }
  return [];
}

export function withNodeImages(
  node: MindNode,
  images: NodeImage[],
): MindNode {
  const { image: _legacy, ...rest } = node;
  void _legacy;
  if (images.length === 0) {
    const { images: _imgs, ...noImgs } = rest as MindNode & { images?: NodeImage[] };
    void _imgs;
    return noImgs;
  }
  return { ...rest, images };
}

export type ImagePlacement = {
  id: string;
  src: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

export function packNodeImages(
  images: NodeImage[],
  scale: number,
  maxRowWidth: number,
): { width: number; height: number; placements: ImagePlacement[] } {
  if (images.length === 0) {
    return { width: 0, height: 0, placements: [] };
  }

  const gap = NODE_IMAGE_PAD * scale;
  const placements: ImagePlacement[] = [];
  let x = 0;
  let y = 0;
  let rowH = 0;
  let maxW = 0;

  for (const img of images) {
    const w = Math.max(MIN_NODE_IMAGE, img.width) * scale;
    const h = Math.max(MIN_NODE_IMAGE, img.height) * scale;
    if (x > 0 && x + w > maxRowWidth) {
      y += rowH + gap;
      x = 0;
      rowH = 0;
    }
    placements.push({ id: img.id, src: img.src, x, y, w, h });
    x += w + gap;
    rowH = Math.max(rowH, h);
    maxW = Math.max(maxW, x - gap);
  }

  return { width: maxW, height: y + rowH, placements };
}

export function collectClipboardImageFiles(
  data: DataTransfer | null | undefined,
): File[] {
  if (!data) return [];
  const out: File[] = [];
  const seen = new Set<string>();

  const push = (file: File | null | undefined) => {
    if (!file) return;
    const looksImage =
      file.type.startsWith("image/") ||
      (!file.type && /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(file.name)) ||
      (!file.type && file.size > 0);
    if (!looksImage && file.type && !file.type.startsWith("image/")) return;
    const key = `${file.name}:${file.size}:${file.type}:${file.lastModified}`;
    if (seen.has(key)) return;
    seen.add(key);
    // Clipboard pastes sometimes omit MIME — tag as png so savers accept them.
    if (!file.type) {
      out.push(
        new File([file], file.name || "paste.png", { type: "image/png" }),
      );
    } else {
      out.push(file);
    }
  };

  for (const file of Array.from(data.files ?? [])) push(file);

  for (const item of Array.from(data.items ?? [])) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      push(item.getAsFile());
    }
  }

  // Copied web images often arrive as HTML with a data URL.
  const html = data.getData("text/html");
  if (html && out.length === 0) {
    const matches = html.matchAll(
      /<img[^>]+src=["'](data:image\/[a-zA-Z+]+;base64,[^"']+)["']/gi,
    );
    for (const match of matches) {
      const file = dataUrlToFile(match[1]);
      if (file) push(file);
    }
  }

  return out;
}

/**
 * File-manager copy/paste often puts `file:///…/photo.png` on the clipboard
 * as text/uri-list or text/plain instead of image bytes.
 */
export function collectClipboardImagePaths(
  data: DataTransfer | null | undefined,
): string[] {
  if (!data) return [];
  const raw = [
    data.getData("text/uri-list"),
    data.getData("text/plain"),
  ]
    .filter(Boolean)
    .join("\n");

  const paths: string[] = [];
  const seen = new Set<string>();
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const path = fileUrlOrPathToLocalPath(trimmed);
    if (!path || !/\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(path)) continue;
    if (seen.has(path)) continue;
    seen.add(path);
    paths.push(path);
  }
  return paths;
}

function fileUrlOrPathToLocalPath(value: string): string | null {
  const trimmed = value.trim().replace(/^['"]|['"]$/g, "");
  if (!trimmed) return null;

  if (/^file:/i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      let path = decodeURIComponent(url.pathname);
      // Windows: file:///C:/Users/... → /C:/Users/...
      if (/^\/[A-Za-z]:\//.test(path)) path = path.slice(1);
      return path;
    } catch {
      try {
        return decodeURIComponent(trimmed.replace(/^file:\/\//i, ""));
      } catch {
        return null;
      }
    }
  }

  if (trimmed.startsWith("/") || /^[A-Za-z]:[\\/]/.test(trimmed)) {
    return trimmed;
  }
  return null;
}

/** True when clipboard paste looks like an image file path / image payload. */
export function clipboardHasNodeImage(
  data: DataTransfer | null | undefined,
): boolean {
  return (
    collectClipboardImageFiles(data).length > 0 ||
    collectClipboardImagePaths(data).length > 0
  );
}

function dataUrlToFile(dataUrl: string): File | null {
  try {
    const [header, b64] = dataUrl.split(",");
    if (!header || !b64) return null;
    const mime = /data:(image\/[a-zA-Z0-9+.-]+);base64/i.exec(header)?.[1];
    if (!mime) return null;
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const ext = extensionFromMime(mime);
    return new File([bytes], `paste.${ext}`, { type: mime });
  } catch {
    return null;
  }
}

function extensionFromMime(mime: string): string {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/gif") return "gif";
  if (mime === "image/webp") return "webp";
  if (mime === "image/svg+xml") return "svg";
  return "png";
}

/** Async clipboard fallback when the paste event has no image files. */
export async function readImagesFromClipboard(): Promise<File[]> {
  if (!navigator.clipboard?.read) return [];
  try {
    const items = await navigator.clipboard.read();
    const files: File[] = [];
    for (const item of items) {
      const type = item.types.find((t) => t.startsWith("image/"));
      if (!type) continue;
      const blob = await item.getType(type);
      const ext = extensionFromMime(type);
      files.push(new File([blob], `paste.${ext}`, { type }));
    }
    return files;
  } catch {
    return [];
  }
}

export function clampImageSize(
  width: number,
  height: number,
): { width: number; height: number } {
  const ratio = height / Math.max(width, 1);
  let w = Math.max(MIN_NODE_IMAGE, Math.min(MAX_NODE_IMAGE, width));
  let h = w * ratio;
  if (h > MAX_NODE_IMAGE) {
    h = MAX_NODE_IMAGE;
    w = h / ratio;
  }
  if (h < MIN_NODE_IMAGE) {
    h = MIN_NODE_IMAGE;
    w = h / Math.max(ratio, 0.01);
  }
  return {
    width: Math.round(w),
    height: Math.round(h),
  };
}
