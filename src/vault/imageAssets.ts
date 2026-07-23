import { convertFileSrc } from "@tauri-apps/api/core";
import { exists, mkdir } from "@tauri-apps/plugin-fs";
import { joinPath, vaultAssetsDir, writeFileSafely } from "./vaultFs";

const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"]);

export function extensionFromName(name: string, mime?: string): string {
  const fromName = name.split(".").pop()?.toLowerCase();
  if (fromName && IMAGE_EXT.has(fromName)) {
    return fromName === "jpeg" ? "jpg" : fromName;
  }
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/gif") return "gif";
  if (mime === "image/webp") return "webp";
  if (mime === "image/svg+xml") return "svg";
  return "png";
}

export function isImageFileName(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase();
  return !!ext && IMAGE_EXT.has(ext);
}

/** Absolute path for a vault-relative asset like `assets/foo.png`. */
export function absoluteAssetPath(
  vaultPath: string,
  relativePath: string,
): string {
  const cleaned = relativePath.replace(/^[/\\]+/, "");
  return joinPath(vaultPath, ...cleaned.split(/[/\\]/).filter(Boolean));
}

/**
 * Browser URL for a vault asset.
 * Accepts vault-relative paths (`assets/…`), absolute paths, or already-resolved URLs.
 */
export function assetDisplayUrl(
  vaultPath: string,
  relativeOrAbsolute: string,
): string {
  if (
    relativeOrAbsolute.startsWith("asset:") ||
    relativeOrAbsolute.startsWith("blob:") ||
    relativeOrAbsolute.startsWith("data:") ||
    /^https?:\/\//i.test(relativeOrAbsolute)
  ) {
    return relativeOrAbsolute;
  }

  const looksAbsolute =
    relativeOrAbsolute.startsWith("/") ||
    /^[A-Za-z]:[\\/]/.test(relativeOrAbsolute);

  const abs = looksAbsolute
    ? relativeOrAbsolute
    : absoluteAssetPath(
        vaultPath,
        relativeOrAbsolute.startsWith("assets/") ||
          relativeOrAbsolute.startsWith("assets\\")
          ? relativeOrAbsolute
          : `assets/${relativeOrAbsolute.replace(/^[/\\]+/, "")}`,
      );

  return convertFileSrc(abs);
}

/** Persist image bytes under vault/assets/; returns vault-relative path. */
export async function saveImageAsset(
  vaultPath: string,
  bytes: Uint8Array,
  fileNameHint: string,
  mime?: string,
): Promise<{ relativePath: string; absolutePath: string }> {
  const dir = vaultAssetsDir(vaultPath);
  if (!(await exists(dir))) {
    await mkdir(dir, { recursive: true });
  }
  const ext = extensionFromName(fileNameHint, mime);
  const stamp = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  const fileName = `img-${stamp}-${rand}.${ext}`;
  const absolutePath = joinPath(dir, fileName);
  await writeFileSafely(absolutePath, bytes);
  return { relativePath: `assets/${fileName}`, absolutePath };
}

export async function saveImageFromFile(
  vaultPath: string,
  file: File,
): Promise<{ relativePath: string; absolutePath: string }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return saveImageAsset(vaultPath, bytes, file.name || "paste.png", file.type);
}
