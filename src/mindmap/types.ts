export interface NodeStyle {
  fill?: string;
  stroke?: string;
  textColor?: string;
  fontSize?: number;
  scale?: number;
}

export type MapLayoutStyle =
  | "right"
  | "left"
  | "down"
  | "radial"
  | "flowchart"
  | "concept";

export type RadialDir = "right" | "left" | "down" | "up";

/** Growth direction for flowchart layout. */
export type FlowDir = "right" | "left" | "down";

/** Free associative / labeled link (not part of the tree hierarchy). */
export interface MapLink {
  id: string;
  fromId: string;
  toId: string;
  label?: string;
}

export interface MindNode {
  id: string;
  text: string;
  note?: string;
  /**
   * Images shown on the node (vault-relative `src`).
   * Prefer this over legacy `image`.
   */
  images?: NodeImage[];
  /** @deprecated Use `images`. Migrated on read. */
  image?: string;
  collapsed?: boolean;
  style?: NodeStyle;
  children: MindNode[];
}

export interface NodeImage {
  id: string;
  /** Vault-relative path, e.g. `assets/img-….png`. */
  src: string;
  /** Display width in mindmap units. */
  width: number;
  /** Display height in mindmap units. */
  height: number;
}

export interface MindMapDocument {
  version: 1;
  title: string;
  root: MindNode;
  layoutStyle?: MapLayoutStyle;
  /** Flowchart growth direction (when layoutStyle is flowchart). */
  flowDir?: FlowDir;
  /** Absolute canvas positions when manually arranged. Absent = auto-layout. */
  positions?: Record<string, { x: number; y: number }>;
  /** Preferred radial arm for root-level children (radial layout). */
  radialDirs?: Record<string, RadialDir>;
  /** Cross-links between any nodes (tree or floating). */
  links?: MapLink[];
  /** Independent node forests not attached under the root. */
  floatingNodes?: MindNode[];
  createdAt: string;
  updatedAt: string;
}

export interface LayoutNode {
  id: string;
  text: string;
  note?: string;
  images: NodeImage[];
  collapsed: boolean;
  style: NodeStyle;
  x: number;
  y: number;
  width: number;
  height: number;
  depth: number;
  parentId: string | null;
  childIds: string[];
  hasChildren: boolean;
  /** True when this node is from floatingNodes (not under root). */
  floating?: boolean;
}

export interface LayoutEdge {
  fromId: string;
  toId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Tree hierarchy vs free associative link. */
  kind?: "tree" | "link";
  label?: string;
  linkId?: string;
}

export interface LayoutResult {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  width: number;
  height: number;
}

export type LibraryFolderSort = "alpha" | "modified" | "created" | "custom";

/** A recently opened map or note, newest first. */
export interface RecentPathEntry {
  kind: "map" | "note";
  path: string;
  name: string;
}

export interface VaultSettings {
  themeId: string;
  canvasBackground?: string;
  defaultNodeStyle: NodeStyle;
  defaultLayoutStyle?: MapLayoutStyle;
  /** How Library folder siblings are ordered. */
  libraryFolderSort?: LibraryFolderSort;
  /** Full relative folder paths; used when libraryFolderSort is "custom". */
  libraryFolderOrder?: string[];
  /** Debounce delay before autosaving map/note edits, in milliseconds. */
  autosaveMs?: number;
  /** Recently opened maps/notes, newest first (max 10). */
  recentPaths?: RecentPathEntry[];
  /** Favorited (pinned) library map/note paths. */
  favoritePaths?: string[];
  /** Dismissed the empty-map onboarding hint once; do not show it again. */
  mapHintsDismissed?: boolean;
}

export interface VaultEntry {
  name: string;
  path: string;
  kind: "map" | "note";
}

export type ViewKind =
  | "map"
  | "note"
  | "settings"
  | "welcome"
  | "about"
  | "tag"
  | "data"
  | "history";
