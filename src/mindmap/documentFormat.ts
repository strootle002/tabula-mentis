import type {
  FlowDir,
  MapContentProvenance,
  MapLayoutStyle,
  MindMapDocument,
  NodeImage,
  NodeStyle,
  RadialDir,
} from "./types";

export const CURRENT_DOCUMENT_VERSION = 1;
export const DEFAULT_DOCUMENT_LIMITS = {
  maxDepth: 256,
  maxNodes: 50_000,
  maxLinks: 100_000,
  maxImages: 100_000,
} as const;

export interface DocumentValidationLimits {
  maxDepth?: number;
  maxNodes?: number;
  maxLinks?: number;
  maxImages?: number;
}

export class MindMapFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MindMapFormatError";
  }
}

function fail(path: string, message: string): never {
  throw new MindMapFormatError(`${path}: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requireString(
  value: unknown,
  path: string,
  opts?: { nonEmpty?: boolean },
): asserts value is string {
  if (typeof value !== "string") fail(path, "must be a string");
  if (opts?.nonEmpty && !value.trim()) fail(path, "must not be empty");
}

function requireFiniteNumber(
  value: unknown,
  path: string,
  opts?: { positive?: boolean },
): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(path, "must be a finite number");
  }
  if (opts?.positive && value <= 0) fail(path, "must be greater than zero");
}

function assertOptionalString(value: unknown, path: string): void {
  if (value !== undefined) requireString(value, path);
}

const LAYOUT_STYLES = new Set<MapLayoutStyle>([
  "right",
  "left",
  "down",
  "radial",
  "flowchart",
  "concept",
]);
const FLOW_DIRS = new Set<FlowDir>(["right", "left", "down"]);
const RADIAL_DIRS = new Set<RadialDir>(["right", "left", "down", "up"]);

function normalizeLegacyNode(
  value: unknown,
  path: string,
  depth: number,
  limits: Required<DocumentValidationLimits>,
  seen: WeakSet<object>,
  count: { nodes: number },
): unknown {
  if (!isRecord(value)) return value;
  if (seen.has(value)) fail(path, "contains a cycle or repeated node object");
  seen.add(value);
  if (depth > limits.maxDepth) {
    fail(path, `exceeds maximum depth ${limits.maxDepth}`);
  }
  count.nodes += 1;
  if (count.nodes > limits.maxNodes) {
    fail("$", `exceeds maximum node count ${limits.maxNodes}`);
  }

  const normalized: Record<string, unknown> = { ...value };
  if (value.image !== undefined && typeof value.image !== "string") {
    fail(`${path}.image`, "must be a string");
  }
  if (
    typeof value.image === "string" &&
    value.image.trim() &&
    (!Array.isArray(value.images) || value.images.length === 0)
  ) {
    const nodeId =
      typeof value.id === "string" && value.id.trim() ? value.id : "node";
    normalized.images = [
      {
        id: `legacy-${nodeId}`,
        src: value.image,
        width: 56,
        height: 42,
      },
    ];
  }
  delete normalized.image;

  if (Array.isArray(value.children)) {
    normalized.children = value.children.map((child, index) =>
      normalizeLegacyNode(
        child,
        `${path}.children[${index}]`,
        depth + 1,
        limits,
        seen,
        count,
      ),
    );
  }
  return normalized;
}

function migrateDocument(
  value: unknown,
  limits: Required<DocumentValidationLimits>,
): unknown {
  if (!isRecord(value)) return value;
  const rawVersion = value.version;
  if (
    rawVersion !== undefined &&
    (typeof rawVersion !== "number" || !Number.isInteger(rawVersion))
  ) {
    fail("$.version", "must be an integer");
  }
  if (typeof rawVersion === "number" && rawVersion > CURRENT_DOCUMENT_VERSION) {
    throw new MindMapFormatError(
      `This map uses document version ${rawVersion}, but this app supports up to version ${CURRENT_DOCUMENT_VERSION}. Update the app before opening it.`,
    );
  }
  if (typeof rawVersion === "number" && rawVersion < 1) {
    fail("$.version", `unsupported document version ${rawVersion}`);
  }

  const seen = new WeakSet<object>();
  const count = { nodes: 0 };
  const migrated: Record<string, unknown> = {
    ...value,
    version: CURRENT_DOCUMENT_VERSION,
  };
  const now = new Date().toISOString();
  if (value.createdAt === undefined) migrated.createdAt = now;
  if (value.updatedAt === undefined) migrated.updatedAt = now;
  if (value.layoutStyle === "fishbone") migrated.layoutStyle = "right";
  migrated.root = normalizeLegacyNode(
    value.root,
    "$.root",
    0,
    limits,
    seen,
    count,
  );
  if (Array.isArray(value.floatingNodes)) {
    migrated.floatingNodes = value.floatingNodes.map((node, index) =>
      normalizeLegacyNode(
        node,
        `$.floatingNodes[${index}]`,
        0,
        limits,
        seen,
        count,
      ),
    );
  }
  return migrated;
}

function validateStyle(value: unknown, path: string): asserts value is NodeStyle {
  if (!isRecord(value)) fail(path, "must be an object");
  assertOptionalString(value.fill, `${path}.fill`);
  assertOptionalString(value.stroke, `${path}.stroke`);
  assertOptionalString(value.textColor, `${path}.textColor`);
  if (value.fontSize !== undefined) {
    requireFiniteNumber(value.fontSize, `${path}.fontSize`, { positive: true });
  }
  if (value.scale !== undefined) {
    requireFiniteNumber(value.scale, `${path}.scale`, { positive: true });
  }
}

function validateImage(
  value: unknown,
  path: string,
  ids: Set<string>,
): asserts value is NodeImage {
  if (!isRecord(value)) fail(path, "must be an object");
  requireString(value.id, `${path}.id`, { nonEmpty: true });
  if (ids.has(value.id)) fail(`${path}.id`, `duplicate image ID "${value.id}"`);
  ids.add(value.id);
  requireString(value.src, `${path}.src`, { nonEmpty: true });
  requireFiniteNumber(value.width, `${path}.width`, { positive: true });
  requireFiniteNumber(value.height, `${path}.height`, { positive: true });
}

function validateTimestamp(value: unknown, path: string): void {
  requireString(value, path, { nonEmpty: true });
  if (!Number.isFinite(Date.parse(value))) {
    fail(path, "must be a valid timestamp");
  }
}

function validateProvenance(
  value: unknown,
  path: string,
): asserts value is MapContentProvenance {
  if (!isRecord(value)) fail(path, "must be an object");
  if (value.kind !== "journal-concept") {
    fail(`${path}.kind`, 'must be "journal-concept"');
  }
  requireString(value.key, `${path}.key`, { nonEmpty: true });
}

/** Validate every reachable field and return the value with its runtime type narrowed. */
export function assertMindMapDocument(
  value: unknown,
  options: DocumentValidationLimits = {},
): asserts value is MindMapDocument {
  const limits = { ...DEFAULT_DOCUMENT_LIMITS, ...options };
  if (!isRecord(value)) fail("$", "must be an object");
  if (value.version !== CURRENT_DOCUMENT_VERSION) {
    fail("$.version", `must be ${CURRENT_DOCUMENT_VERSION}`);
  }
  requireString(value.title, "$.title");
  validateTimestamp(value.createdAt, "$.createdAt");
  validateTimestamp(value.updatedAt, "$.updatedAt");

  if (
    value.layoutStyle !== undefined &&
    (typeof value.layoutStyle !== "string" ||
      !LAYOUT_STYLES.has(value.layoutStyle as MapLayoutStyle))
  ) {
    fail("$.layoutStyle", "is not a supported layout");
  }
  if (
    value.flowDir !== undefined &&
    (typeof value.flowDir !== "string" ||
      !FLOW_DIRS.has(value.flowDir as FlowDir))
  ) {
    fail("$.flowDir", "is not a supported flow direction");
  }
  if (!isRecord(value.root)) fail("$.root", "must be a node object");
  if (value.floatingNodes !== undefined && !Array.isArray(value.floatingNodes)) {
    fail("$.floatingNodes", "must be an array");
  }

  const nodeIds = new Set<string>();
  const seen = new WeakSet<object>();
  const stack: { node: unknown; path: string; depth: number }[] = [
    { node: value.root, path: "$.root", depth: 0 },
  ];
  if (Array.isArray(value.floatingNodes)) {
    for (let i = value.floatingNodes.length - 1; i >= 0; i -= 1) {
      stack.push({
        node: value.floatingNodes[i],
        path: `$.floatingNodes[${i}]`,
        depth: 0,
      });
    }
  }

  let nodeCount = 0;
  let imageCount = 0;
  while (stack.length) {
    const { node, path, depth } = stack.pop()!;
    if (!isRecord(node)) fail(path, "must be a node object");
    if (seen.has(node)) fail(path, "contains a cycle or repeated node object");
    seen.add(node);
    if (depth > limits.maxDepth) {
      fail(path, `exceeds maximum depth ${limits.maxDepth}`);
    }
    nodeCount += 1;
    if (nodeCount > limits.maxNodes) {
      fail("$", `exceeds maximum node count ${limits.maxNodes}`);
    }

    requireString(node.id, `${path}.id`, { nonEmpty: true });
    if (nodeIds.has(node.id)) {
      fail(`${path}.id`, `duplicate node ID "${node.id}"`);
    }
    nodeIds.add(node.id);
    requireString(node.text, `${path}.text`);
    assertOptionalString(node.note, `${path}.note`);
    if (node.image !== undefined) {
      requireString(node.image, `${path}.image`, { nonEmpty: true });
    }
    if (node.collapsed !== undefined && typeof node.collapsed !== "boolean") {
      fail(`${path}.collapsed`, "must be a boolean");
    }
    if (node.style !== undefined) validateStyle(node.style, `${path}.style`);
    if (node.provenance !== undefined) {
      validateProvenance(node.provenance, `${path}.provenance`);
    }
    if (node.images !== undefined) {
      if (!Array.isArray(node.images)) fail(`${path}.images`, "must be an array");
      imageCount += node.images.length;
      if (imageCount > limits.maxImages) {
        fail("$", `exceeds maximum image count ${limits.maxImages}`);
      }
      const imageIds = new Set<string>();
      node.images.forEach((image, index) =>
        validateImage(image, `${path}.images[${index}]`, imageIds),
      );
    }
    if (!Array.isArray(node.children)) {
      fail(`${path}.children`, "must be an array");
    }
    for (let i = node.children.length - 1; i >= 0; i -= 1) {
      stack.push({
        node: node.children[i],
        path: `${path}.children[${i}]`,
        depth: depth + 1,
      });
    }
  }

  if (value.positions !== undefined) {
    if (!isRecord(value.positions)) fail("$.positions", "must be an object");
    for (const [id, position] of Object.entries(value.positions)) {
      if (!id.trim()) fail("$.positions", "contains an empty node ID");
      if (!nodeIds.has(id)) fail(`$.positions.${id}`, "references an unknown node");
      if (!isRecord(position)) fail(`$.positions.${id}`, "must be an object");
      requireFiniteNumber(position.x, `$.positions.${id}.x`);
      requireFiniteNumber(position.y, `$.positions.${id}.y`);
    }
  }

  if (value.radialDirs !== undefined) {
    if (!isRecord(value.radialDirs)) fail("$.radialDirs", "must be an object");
    for (const [id, direction] of Object.entries(value.radialDirs)) {
      if (!id.trim()) fail("$.radialDirs", "contains an empty node ID");
      if (!nodeIds.has(id)) fail(`$.radialDirs.${id}`, "references an unknown node");
      if (
        typeof direction !== "string" ||
        !RADIAL_DIRS.has(direction as RadialDir)
      ) {
        fail(`$.radialDirs.${id}`, "is not a supported radial direction");
      }
    }
  }

  if (value.links !== undefined) {
    if (!Array.isArray(value.links)) fail("$.links", "must be an array");
    if (value.links.length > limits.maxLinks) {
      fail("$.links", `exceeds maximum link count ${limits.maxLinks}`);
    }
    const linkIds = new Set<string>();
    value.links.forEach((link, index) => {
      const path = `$.links[${index}]`;
      if (!isRecord(link)) fail(path, "must be an object");
      requireString(link.id, `${path}.id`, { nonEmpty: true });
      if (linkIds.has(link.id)) {
        fail(`${path}.id`, `duplicate link ID "${link.id}"`);
      }
      linkIds.add(link.id);
      requireString(link.fromId, `${path}.fromId`, { nonEmpty: true });
      requireString(link.toId, `${path}.toId`, { nonEmpty: true });
      if (!nodeIds.has(link.fromId)) {
        fail(`${path}.fromId`, `references unknown node "${link.fromId}"`);
      }
      if (!nodeIds.has(link.toId)) {
        fail(`${path}.toId`, `references unknown node "${link.toId}"`);
      }
      assertOptionalString(link.label, `${path}.label`);
      if (link.provenance !== undefined) {
        validateProvenance(link.provenance, `${path}.provenance`);
      }
    });
  }
}

/**
 * Explicit read boundary: migrate supported legacy shapes, then rigorously
 * validate the normalized version-1 document.
 */
export function parseMindMapDocument(
  value: unknown,
  options: DocumentValidationLimits = {},
): MindMapDocument {
  const limits = { ...DEFAULT_DOCUMENT_LIMITS, ...options };
  const migrated = migrateDocument(value, limits);
  assertMindMapDocument(migrated, limits);
  return migrated;
}

export function parseMindMapJson(
  raw: string,
  source = "map file",
  options: DocumentValidationLimits = {},
): MindMapDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new MindMapFormatError(`${source}: invalid JSON`);
  }
  return parseMindMapDocument(parsed, options);
}

export function isMindMapDocument(value: unknown): value is MindMapDocument {
  try {
    assertMindMapDocument(value);
    return true;
  } catch {
    return false;
  }
}
