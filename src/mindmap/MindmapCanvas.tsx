import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { resolveLayout, nodeImagesLayout, wrapNodeTextLines } from "./layout";
import {
  dropIntentLabel,
  findDropTarget,
  nodeCenter,
  nodesOverlap,
  resolveDropIntent,
  type DropIntent,
} from "./dropZones";
import { collectDescendantIdsInDoc, findNodeInDoc, focusPathIds } from "./mapDoc";
import { Minimap } from "./Minimap";
import { normalizeLayoutStyle } from "./layoutCatalog";
import { resolveKeyAction } from "./keymap";
import { handleNodeImagePaste } from "./pasteNodeImages";
import { useAppStore } from "../store/appStore";
import { ContextMenu, useContextMenu } from "../components/ContextMenu";
import { useAccessibleDialog } from "../components/useAccessibleDialog";
import type { LayoutNode, RadialDir } from "./types";
import { assetDisplayUrl } from "../vault/imageAssets";

function NodeLabelText({
  text,
  width,
  centerY,
  fontSize,
  fill,
  fontWeight,
  scale = 1,
}: {
  text: string;
  width: number;
  centerY: number;
  fontSize: number;
  fill: string;
  fontWeight: number;
  scale?: number;
}) {
  const lines = wrapNodeTextLines(text, fontSize, scale, width);
  const lineHeight = fontSize * 1.35;
  const blockH = lines.length * lineHeight;
  const startY = centerY - blockH / 2 + lineHeight / 2;
  return (
    <text
      className="node-label"
      textAnchor="middle"
      fill={fill}
      fontSize={fontSize}
      fontWeight={fontWeight}
    >
      {lines.map((line, i) => (
        <tspan key={i} x={width / 2} y={startY + i * lineHeight}>
          {line || " "}
        </tspan>
      ))}
    </text>
  );
}

function DropZoneOverlay({
  node,
  intent,
  layoutStyle,
}: {
  node: LayoutNode;
  intent: DropIntent;
  layoutStyle: string;
}) {
  const accent = cssVar("--accent", "#1a7a62");
  const soft = "color-mix(in srgb, var(--accent, #1a7a62) 28%, transparent)";
  const w = node.width;
  const h = node.height;
  const isRoot = node.parentId == null && !node.floating;

  if (layoutStyle === "radial" && isRoot && intent.radialDir) {
    const midX = w / 2;
    const midY = h / 2;
    // Diamond wedges matching |dx| >= |dy| dominant-axis logic
    const half = Math.min(w, h) / 2;
    const wedges: Record<RadialDir, string> = {
      right: `M ${midX} ${midY} L ${midX + half} ${midY - half} L ${w} ${midY - half} L ${w} ${midY + half} L ${midX + half} ${midY + half} Z`,
      left: `M ${midX} ${midY} L ${midX - half} ${midY - half} L 0 ${midY - half} L 0 ${midY + half} L ${midX - half} ${midY + half} Z`,
      down: `M ${midX} ${midY} L ${midX - half} ${midY + half} L ${midX - half} ${h} L ${midX + half} ${h} L ${midX + half} ${midY + half} Z`,
      up: `M ${midX} ${midY} L ${midX - half} ${midY - half} L ${midX - half} 0 L ${midX + half} 0 L ${midX + half} ${midY - half} Z`,
    };
    const tips: Record<RadialDir, { x1: number; y1: number; x2: number; y2: number }> = {
      right: { x1: w + 4, y1: midY, x2: w + 18, y2: midY },
      left: { x1: -4, y1: midY, x2: -18, y2: midY },
      down: { x1: midX, y1: h + 4, x2: midX, y2: h + 18 },
      up: { x1: midX, y1: -4, x2: midX, y2: -18 },
    };
    const tip = tips[intent.radialDir];
    return (
      <g className="drop-zone-overlay" pointerEvents="none">
        <path
          d={wedges[intent.radialDir]}
          fill={soft}
          stroke={accent}
          strokeWidth={1.5}
        />
        <line
          x1={tip.x1}
          y1={tip.y1}
          x2={tip.x2}
          y2={tip.y2}
          stroke={accent}
          strokeWidth={3}
          strokeLinecap="round"
        />
      </g>
    );
  }

  if (intent.kind === "child") {
    let x = 0;
    let y = 0;
    let rw = w;
    let rh = h;
    if (layoutStyle === "left") {
      rw = w * 0.42;
    } else if (layoutStyle === "down") {
      y = h * 0.58;
      rh = h * 0.42;
    } else if (layoutStyle === "radial" || layoutStyle === "concept") {
      // Full-node child highlight — approach-based wedges only at root.
      x = 0;
      y = 0;
      rw = w;
      rh = h;
    } else {
      x = w * 0.58;
      rw = w * 0.42;
    }
    return (
      <rect
        className="drop-zone-overlay"
        x={x}
        y={y}
        width={rw}
        height={rh}
        fill={soft}
        stroke={accent}
        strokeWidth={1.25}
        rx={6}
        pointerEvents="none"
      />
    );
  }

  if (layoutStyle === "down") {
    const left = intent.kind === "sibling-before";
    return (
      <rect
        className="drop-zone-overlay"
        x={left ? 0 : w * 0.5}
        y={0}
        width={w * 0.5}
        height={h * 0.58}
        fill={soft}
        stroke={accent}
        strokeWidth={1.25}
        rx={6}
        pointerEvents="none"
      />
    );
  }

  const top = intent.kind === "sibling-before";
  const childCut =
    layoutStyle === "left" ? 0.42 : layoutStyle === "radial" ? 0.55 : 0.58;
  const zoneX = layoutStyle === "left" ? childCut * w : 0;
  const zoneW =
    layoutStyle === "left" ? w * (1 - childCut) : w * childCut;

  return (
    <>
      <rect
        className="drop-zone-overlay"
        x={zoneX}
        y={top ? 0 : h * 0.5}
        width={zoneW}
        height={h * 0.5}
        fill={soft}
        stroke={accent}
        strokeWidth={1.25}
        rx={6}
        pointerEvents="none"
      />
      <line
        x1={zoneX + 4}
        y1={top ? 3 : h - 3}
        x2={zoneX + zoneW - 4}
        y2={top ? 3 : h - 3}
        stroke={accent}
        strokeWidth={2.5}
        strokeLinecap="round"
        pointerEvents="none"
      />
    </>
  );
}

export function MindmapCanvas() {
  const activeMap = useAppStore((s) => s.activeMap);
  const selectedNodeId = useAppStore((s) => s.selectedNodeId);
  const editingNodeId = useAppStore((s) => s.editingNodeId);
  const vaultSettings = useAppStore((s) => s.vaultSettings);
  const panX = useAppStore((s) => s.panX);
  const panY = useAppStore((s) => s.panY);
  const zoom = useAppStore((s) => s.zoom);
  const setSelectedNode = useAppStore((s) => s.setSelectedNode);
  const setEditingNode = useAppStore((s) => s.setEditingNode);
  const updateSelectedText = useAppStore((s) => s.updateSelectedText);
  const resizeNodeImage = useAppStore((s) => s.resizeNodeImage);
  const vaultPath = useAppStore((s) => s.vaultPath);
  const addChildToSelected = useAppStore((s) => s.addChildToSelected);
  const addSiblingToSelected = useAppStore((s) => s.addSiblingToSelected);
  const deleteSelected = useAppStore((s) => s.deleteSelected);
  const toggleCollapseSelected = useAppStore((s) => s.toggleCollapseSelected);
  const toggleNodePanel = useAppStore((s) => s.toggleNodePanel);
  const applyDropIntentAction = useAppStore((s) => s.applyDropIntent);
  const moveSubtree = useAppStore((s) => s.moveSubtree);
  const navigate = useAppStore((s) => s.navigate);
  const setPanZoom = useAppStore((s) => s.setPanZoom);
  const undo = useAppStore((s) => s.undo);
  const redo = useAppStore((s) => s.redo);
  const linkingFromId = useAppStore((s) => s.linkingFromId);
  const beginLinkFrom = useAppStore((s) => s.beginLinkFrom);
  const cancelLinking = useAppStore((s) => s.cancelLinking);
  const completeLinkTo = useAppStore((s) => s.completeLinkTo);
  const removeLink = useAppStore((s) => s.removeLink);
  const removeLinksForNode = useAppStore((s) => s.removeLinksForNode);
  const pendingLink = useAppStore((s) => s.pendingLink);
  const confirmPendingLink = useAppStore((s) => s.confirmPendingLink);
  const cancelPendingLink = useAppStore((s) => s.cancelPendingLink);
  const minimapVisible = useAppStore((s) => s.minimapVisible);
  const selectedNodeIds = useAppStore((s) => s.selectedNodeIds);
  const toggleNodeSelection = useAppStore((s) => s.toggleNodeSelection);
  const deleteSelectedNodes = useAppStore((s) => s.deleteSelectedNodes);
  const copySelectedSubtree = useAppStore((s) => s.copySelectedSubtree);
  const pasteSubtreeFromClipboard = useAppStore(
    (s) => s.pasteSubtreeFromClipboard,
  );
  const focusSelectedNode = useAppStore((s) => s.focusSelectedNode);
  const snapToGrid = useAppStore((s) => s.snapToGrid);
  const pushToast = useAppStore((s) => s.pushToast);
  const updateVaultSettings = useAppStore((s) => s.updateVaultSettings);
  const presentationMode = useAppStore((s) => s.presentationMode);

  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const nodeRefs = useRef(new Map<string, SVGGElement>());
  const [panning, setPanning] = useState(false);
  const panStart = useRef<{
    x: number;
    y: number;
    panX: number;
    panY: number;
  } | null>(null);
  const [editValue, setEditValue] = useState("");
  const editInputRef = useRef<HTMLTextAreaElement>(null);
  const editValueRef = useRef("");
  /** Keep true until select-all succeeds on a mounted textarea. */
  const pendingSelectAllRef = useRef(false);
  /** Ignore blur while edit UI is mounting / double-click is finishing. */
  const suppressEditBlurRef = useRef(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropIntent, setDropIntent] = useState<DropIntent | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const dragOrigin = useRef<{ x: number; y: number; id: string } | null>(null);
  const dropIntentRef = useRef<DropIntent | null>(null);
  const dragIdRef = useRef<string | null>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const imageResize = useRef<{
    nodeId: string;
    imageId: string;
    startX: number;
    startY: number;
    startW: number;
    startH: number;
  } | null>(null);
  const [lightbox, setLightbox] = useState<{
    src: string;
    url: string;
  } | null>(null);
  const { menu, openMenu, closeMenu } = useContextMenu();
  const lightboxDialog = useAccessibleDialog(
    !!lightbox,
    () => setLightbox(null),
  );
  const linkDialog = useAccessibleDialog(
    !!pendingLink,
    cancelPendingLink,
  );

  const layoutStyle = normalizeLayoutStyle(
    activeMap?.layoutStyle ?? vaultSettings.defaultLayoutStyle ?? "right",
  );
  const flowDir = activeMap?.flowDir ?? "down";

  const layout = useMemo(() => {
    if (!activeMap) return null;
    return resolveLayout(
      activeMap.root,
      vaultSettings.defaultNodeStyle,
      layoutStyle,
      activeMap.positions,
      dragId ? { id: dragId, dx: dragOffset.x, dy: dragOffset.y } : null,
      activeMap.radialDirs,
      activeMap.floatingNodes,
      activeMap.links,
      activeMap.flowDir,
    );
  }, [
    activeMap,
    vaultSettings.defaultNodeStyle,
    layoutStyle,
    dragId,
    dragOffset.x,
    dragOffset.y,
  ]);

  const presentPath = useMemo(
    () =>
      presentationMode && activeMap
        ? focusPathIds(activeMap, selectedNodeId)
        : null,
    [presentationMode, activeMap, selectedNodeId],
  );

  const panningRef = useRef(false);
  useEffect(() => {
    panningRef.current = panning;
  });

  useEffect(() => {
    if (!presentationMode || !selectedNodeId) return;
    const timer = window.setTimeout(() => {
      if (panningRef.current || dragIdRef.current) return;
      focusSelectedNode();
    }, 150);
    return () => window.clearTimeout(timer);
  }, [presentationMode, selectedNodeId, focusSelectedNode]);

  const [viewSize, setViewSize] = useState({ w: 800, h: 600 });
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const sync = () =>
      setViewSize({ w: el.clientWidth, h: el.clientHeight });
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [activeMap?.root.id]);

  const [linkLabel, setLinkLabel] = useState("");
  useEffect(() => {
    if (pendingLink) setLinkLabel("");
  }, [pendingLink]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      // Don't steal focus from the node text editor.
      if (useAppStore.getState().editingNodeId) return;
      if (!selectedNodeId) return;
      const target = nodeRefs.current.get(selectedNodeId);
      if (!target) return;
      const focused = document.activeElement;
      if (focused && target.contains(focused)) return;
      if (
        focused === document.body ||
        focused === wrapRef.current ||
        (focused instanceof Element && focused.closest(".node-group"))
      ) {
        target.focus();
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [activeMap?.root.id, selectedNodeId]);

  // Global paste → selected node (focus often isn't on the canvas wrap).
  useEffect(() => {
    const isNoteEditorTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      return !!target.closest(".ProseMirror, .note-editor-wrap, .note-view");
    };

    const onPaste = (e: ClipboardEvent) => {
      if (isNoteEditorTarget(e.target)) return;
      handleNodeImagePaste(e);
    };

    window.addEventListener("paste", onPaste, true);
    return () => window.removeEventListener("paste", onPaste, true);
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheelNative = (e: WheelEvent) => {
      e.preventDefault();
      const state = useAppStore.getState();

      if (e.altKey) {
        if (e.deltaY === 0) return;
        const steps = Math.max(
          1,
          Math.min(3, Math.round(Math.abs(e.deltaY) / 100)),
        );
        for (let i = 0; i < steps; i++) {
          // Scroll up = collapse (zoom out outline); scroll down = expand.
          if (e.deltaY < 0) state.collapseOneLevelSelected();
          else state.expandOneLevelSelected();
        }
        return;
      }

      if (e.ctrlKey || e.metaKey) {
        const { panX, panY, zoom } = state;
        const next = Math.min(2.5, Math.max(0.35, zoom - e.deltaY * 0.0015));
        if (next === zoom) return;
        // Keep the world point under the cursor fixed (zoom toward pointer).
        const rect = el.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const ratio = next / zoom;
        state.setPanZoom(
          sx - (sx - panX) * ratio,
          sy - (sy - panY) * ratio,
          next,
        );
        return;
      }

      if (e.shiftKey) {
        const amount =
          Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        state.setPanZoom(state.panX - amount, state.panY, state.zoom);
        return;
      }

      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        state.setPanZoom(state.panX - e.deltaX, state.panY, state.zoom);
        return;
      }

      state.setPanZoom(state.panX, state.panY - e.deltaY, state.zoom);
    };
    el.addEventListener("wheel", onWheelNative, { passive: false });
    return () => el.removeEventListener("wheel", onWheelNative);
  }, []);

  // Seed edit value + arm select-all in layout phase so select-all can run
  // in the same commit (Tab/Enter create never goes through beginEdit).
  useLayoutEffect(() => {
    if (!editingNodeId) {
      pendingSelectAllRef.current = false;
      return;
    }
    const map = useAppStore.getState().activeMap;
    if (!map) return;
    const node = findNodeInDoc(map, editingNodeId);
    const text = node?.text ?? "";
    editValueRef.current = text;
    setEditValue(text);
    pendingSelectAllRef.current = true;
    suppressEditBlurRef.current = true;
  }, [editingNodeId]);

  // Select-all after the edit field mounts with the seeded controlled value.
  useLayoutEffect(() => {
    if (!editingNodeId || !pendingSelectAllRef.current) return;
    if (!layout?.nodes.some((n) => n.id === editingNodeId)) return;
    const map = useAppStore.getState().activeMap;
    const expected = map
      ? (findNodeInDoc(map, editingNodeId)?.text ?? "")
      : "";
    // Wait until React has applied the controlled value, otherwise select()
    // is wiped by the next value commit.
    if (editValue !== expected) return;

    const selectAll = () => {
      const input = editInputRef.current;
      if (!input) return false;
      if (useAppStore.getState().editingNodeId !== editingNodeId) return false;
      input.focus({ preventScroll: true });
      const len = input.value.length;
      if (len === 0) return false;
      input.setSelectionRange(0, len);
      input.select();
      return (
        document.activeElement === input &&
        input.selectionStart === 0 &&
        input.selectionEnd === len
      );
    };

    if (selectAll()) {
      pendingSelectAllRef.current = false;
      suppressEditBlurRef.current = false;
      return;
    }

    let cancelled = false;
    const trySelect = () => {
      if (cancelled) return false;
      if (selectAll()) {
        pendingSelectAllRef.current = false;
        suppressEditBlurRef.current = false;
        return true;
      }
      return false;
    };

    const t0 = window.requestAnimationFrame(() => {
      if (trySelect()) return;
      window.requestAnimationFrame(() => {
        if (trySelect()) return;
      });
    });
    const t1 = window.setTimeout(() => {
      if (trySelect()) return;
    }, 0);
    const t2 = window.setTimeout(() => {
      trySelect();
      pendingSelectAllRef.current = false;
      suppressEditBlurRef.current = false;
    }, 80);

    return () => {
      cancelled = true;
      cancelAnimationFrame(t0);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [editingNodeId, layout, editValue]);

  const beginEdit = (nodeId: string) => {
    if (useAppStore.getState().presentationMode) return;
    suppressEditBlurRef.current = true;
    pendingSelectAllRef.current = true;
    // Single store update — setSelectedNode alone would clear editingNodeId.
    useAppStore.setState({ selectedNodeId: nodeId, editingNodeId: nodeId });
  };

  const commitEdit = () => {
    const value = editInputRef.current?.value ?? editValueRef.current;
    updateSelectedText(value);
    setEditingNode(null);
    suppressEditBlurRef.current = false;
  };

  const cancelEdit = () => {
    suppressEditBlurRef.current = true;
    setEditingNode(null);
    requestAnimationFrame(() => {
      suppressEditBlurRef.current = false;
    });
  };

  if (!activeMap || !layout) {
    return (
      <div className="empty-state">
        <div>
          <h2>No map open</h2>
          <p>Create or open a mindmap from the sidebar.</p>
        </div>
      </div>
    );
  }

  const setDropIntentState = (intent: DropIntent | null) => {
    dropIntentRef.current = intent;
    setDropIntent(intent);
  };

  /** Hit-test ignoring the dragged subtree so we can detect drop parents. */
  const hitDropIntentAt = (
    clientX: number,
    clientY: number,
    movingId: string,
  ): DropIntent | null => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const x = (clientX - rect.left - panX) / zoom;
    const y = (clientY - rect.top - panY) / zoom;
    const blocked = new Set(collectDescendantIdsInDoc(activeMap, movingId));
    const base = layout.nodes.find((n) => n.id === movingId) ?? null;
    if (!base) return null;

    // Layout may lag one frame behind dragOffsetRef; unwrap baked drag then
    // apply the latest ref offset so body-overlap matches what the user sees.
    const baked =
      dragId === movingId ? dragOffset : { x: 0, y: 0 };
    const refOff = dragOffsetRef.current;
    const moving: LayoutNode = {
      ...base,
      x: base.x - baked.x + refOff.x,
      y: base.y - baked.y + refOff.y,
    };
    const anchor = nodeCenter(moving);

    // Prefer radial root when the dragged node overlaps it — direction comes
    // from where the floating node sits relative to the root center.
    if (layoutStyle === "radial") {
      const root = layout.nodes.find((n) => n.parentId == null);
      if (root && !blocked.has(root.id) && nodesOverlap(moving, root, 12)) {
        return resolveDropIntent(root, anchor.x, anchor.y, layoutStyle, anchor, flowDir);
      }
    }

    // Find target by pointer or by dragged-body overlap; resolve zones from
    // the dragged node center so grab-offset doesn't force "child to the right".
    const target =
      findDropTarget(layout.nodes, x, y, blocked, moving) ??
      findDropTarget(layout.nodes, anchor.x, anchor.y, blocked, moving);
    if (!target) return null;
    return resolveDropIntent(target, anchor.x, anchor.y, layoutStyle, anchor, flowDir);
  };

  const clearPointerInteraction = () => {
    setDragId(null);
    dragIdRef.current = null;
    setDropIntentState(null);
    setDragOffset({ x: 0, y: 0 });
    dragOffsetRef.current = { x: 0, y: 0 };
    dragOrigin.current = null;
    imageResize.current = null;
    setPanning(false);
    panStart.current = null;
  };

  const commitDragFromRefs = (shiftKey = false) => {
    const id = dragIdRef.current;
    if (!id) return;
    const { x: dx, y: dy } = dragOffsetRef.current;
    const intent = dropIntentRef.current;
    if (intent && intent.targetId !== id) {
      applyDropIntentAction(id, intent);
    } else if (Math.hypot(dx, dy) > 1) {
      moveSubtree(id, dx, dy, { snap: shiftKey || snapToGrid });
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    // Only primary (left) button pans the canvas. Right-click must not grab.
    if (e.button !== 0) return;
    if ((e.target as Element).closest(".node-group")) return;
    closeMenu();
    setPanning(true);
    panStart.current = { x: e.clientX, y: e.clientY, panX, panY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (imageResize.current && (e.buttons & 1) === 1) {
      const r = imageResize.current;
      const dx = (e.clientX - r.startX) / zoom;
      const ratio = r.startH / Math.max(r.startW, 1);
      const newW = r.startW + dx;
      const newH = newW * ratio;
      resizeNodeImage(r.nodeId, r.imageId, newW, newH, { coalesce: true });
      return;
    }

    // Require primary button still held — avoids "stuck grab" after right-click
    // or a missed pointerup.
    if (dragOrigin.current && (e.buttons & 1) === 1) {
      const dx = e.clientX - dragOrigin.current.x;
      const dy = e.clientY - dragOrigin.current.y;
      const movingId = dragOrigin.current.id;
      const nextOffset = { x: dx / zoom, y: dy / zoom };
      dragOffsetRef.current = nextOffset;
      if (!dragId && Math.hypot(dx, dy) > 6) {
        setDragId(movingId);
        dragIdRef.current = movingId;
        setSelectedNode(movingId);
      }
      if (dragId || Math.hypot(dx, dy) > 6) {
        if (!dragIdRef.current) dragIdRef.current = movingId;
        setDragOffset(nextOffset);
        const intent = hitDropIntentAt(e.clientX, e.clientY, movingId);
        setDropIntentState(intent);
        return;
      }
    } else if (dragOrigin.current || dragId) {
      // Button released outside our pointerup path — still commit the drag.
      commitDragFromRefs();
      clearPointerInteraction();
    }

    if (!panning || !panStart.current) return;
    if ((e.buttons & 1) !== 1) {
      clearPointerInteraction();
      return;
    }
    const dx = e.clientX - panStart.current.x;
    const dy = e.clientY - panStart.current.y;
    setPanZoom(panStart.current.panX + dx, panStart.current.panY + dy, zoom);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (dragIdRef.current) {
      commitDragFromRefs(e.shiftKey);
    }
    clearPointerInteraction();
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const onLostPointerCapture = () => {
    if (dragIdRef.current) {
      commitDragFromRefs();
    }
    clearPointerInteraction();
  };

  const onCanvasContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    clearPointerInteraction();
    closeMenu();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const presenting = presentationMode;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.altKey && !editingNodeId && !presenting) {
      const key = e.key.toLowerCase();
      if (key === "c" && selectedNodeId) {
        e.preventDefault();
        void copySelectedSubtree().then((ok) => {
          if (ok) pushToast("Copied subtree", "success");
        });
        return;
      }
      if (key === "v") {
        e.preventDefault();
        void pasteSubtreeFromClipboard().then((ok) => {
          if (ok) pushToast("Pasted subtree", "success");
        });
        return;
      }
    }
    const action = resolveKeyAction(e.nativeEvent);
    if (!action) return;
    e.preventDefault();
    switch (action) {
      case "nav-left":
        navigate("left");
        break;
      case "nav-right":
        navigate("right");
        break;
      case "nav-up":
        navigate("up");
        break;
      case "nav-down":
        navigate("down");
        break;
      case "add-child":
        if (!presenting) addChildToSelected();
        break;
      case "add-sibling":
        if (!presenting) addSiblingToSelected();
        break;
      case "delete":
        if (!presenting) deleteSelectedNodes();
        break;
      case "edit":
        if (!presenting && selectedNodeId) beginEdit(selectedNodeId);
        break;
      case "toggle-collapse":
        toggleCollapseSelected();
        break;
      case "toggle-node-panel":
        if (!presenting) toggleNodePanel();
        break;
      case "focus-node":
        focusSelectedNode();
        break;
      case "undo":
        if (!presenting) undo();
        break;
      case "redo":
        if (!presenting) redo();
        break;
      case "escape":
        if (lightbox) {
          setLightbox(null);
          break;
        }
        if (presenting) break;
        cancelEdit();
        cancelLinking();
        cancelPendingLink();
        closeMenu();
        break;
    }
  };

  const openNodeMenu = (e: React.MouseEvent, nodeId: string) => {
    e.preventDefault();
    e.stopPropagation();
    clearPointerInteraction();
    setSelectedNode(nodeId);
    const nodeHasLinks = (activeMap.links ?? []).some(
      (l) => l.fromId === nodeId || l.toId === nodeId,
    );
    openMenu(e.clientX, e.clientY, [
      { label: "Edit", onClick: () => beginEdit(nodeId) },
      {
        label: "Link to…",
        onClick: () => beginLinkFrom(nodeId),
      },
      ...(nodeHasLinks
        ? [
            {
              label: "Remove all links",
              onClick: () => removeLinksForNode(nodeId),
            },
          ]
        : []),
      { separator: true, label: "", onClick: () => undefined },
      {
        label: "Add child",
        onClick: () => {
          setSelectedNode(nodeId);
          addChildToSelected();
        },
      },
      {
        label: "Add sibling",
        onClick: () => {
          setSelectedNode(nodeId);
          addSiblingToSelected();
        },
      },
      {
        label: "Collapse / expand",
        onClick: () => {
          setSelectedNode(nodeId);
          toggleCollapseSelected();
        },
      },
      { separator: true, label: "", onClick: () => undefined },
      {
        label: "Delete",
        danger: true,
        disabled: nodeId === activeMap.root.id,
        onClick: () => {
          setSelectedNode(nodeId);
          deleteSelected();
        },
      },
    ]);
  };

  const openLinkMenu = (e: React.MouseEvent, linkId: string) => {
    e.preventDefault();
    e.stopPropagation();
    clearPointerInteraction();
    openMenu(e.clientX, e.clientY, [
      {
        label: "Remove link",
        danger: true,
        onClick: () => removeLink(linkId),
      },
    ]);
  };

  const editingNode = layout.nodes.find((n) => n.id === editingNodeId);
  const isEmptyMap =
    activeMap.root.children.length === 0 &&
    !(activeMap.floatingNodes?.length);
  const showOnboarding = isEmptyMap && !vaultSettings.mapHintsDismissed;

  return (
    <div
      className="canvas-wrap"
      ref={wrapRef}
      onKeyDown={onKeyDown}
      onPaste={(e) => {
        handleNodeImagePaste(e);
      }}
      style={
        vaultSettings.canvasBackground
          ? ({ "--canvas": vaultSettings.canvasBackground } as React.CSSProperties)
          : undefined
      }
      data-svg-export-root
    >
      {dragId && (
        <div className="drag-hint">
          {dropIntentLabel(dropIntent, layoutStyle, flowDir)}
        </div>
      )}
      {linkingFromId && !dragId && (
        <div className="drag-hint">
          Click a node to link · Esc to cancel
        </div>
      )}
      {showOnboarding && !presentationMode && (
        <div className="canvas-onboarding">
          <span>
            This map is empty. Press <kbd>Tab</kbd> or use “+ Child” in the
            toolbar to add your first idea.
          </span>
          <button
            type="button"
            onClick={() => void updateVaultSettings({ mapHintsDismissed: true })}
          >
            Dismiss
          </button>
        </div>
      )}
      <svg
        ref={svgRef}
        role="tree"
        aria-label={`Map: ${activeMap.title}. Use arrow keys to move between nodes.`}
        className={`mindmap-svg ${panning ? "panning" : ""} ${dragId ? "dragging" : ""} ${linkingFromId ? "linking" : ""} ${presentationMode ? "presentation" : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onLostPointerCapture={onLostPointerCapture}
        onContextMenu={onCanvasContextMenu}
      >
        <defs>
          <marker
            id="arrowhead"
            markerWidth="8"
            markerHeight="8"
            refX="7"
            refY="3"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M0,0 L7,3 L0,6 Z" fill={cssVar("--edge", "#958b7c")} />
          </marker>
          <marker
            id="arrowhead-link"
            markerWidth="8"
            markerHeight="8"
            refX="7"
            refY="3"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M0,0 L7,3 L0,6 Z" fill={cssVar("--accent", "#1a7a62")} />
          </marker>
        </defs>
        <g
          data-export-content
          transform={`translate(${panX}, ${panY}) scale(${zoom})`}
        >
          {layout.edges.map((edge) => {
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
            const d = useVerticalCurve
              ? `M ${edge.x1} ${edge.y1} C ${edge.x1} ${my}, ${edge.x2} ${my}, ${edge.x2} ${edge.y2}`
              : useHorizontalCurve
                ? `M ${edge.x1} ${edge.y1} C ${mx} ${edge.y1}, ${mx} ${edge.y2}, ${edge.x2} ${edge.y2}`
                : isLink
                  ? `M ${edge.x1} ${edge.y1} Q ${mx} ${my - 28}, ${edge.x2} ${edge.y2}`
                  : `M ${edge.x1} ${edge.y1} C ${mx} ${edge.y1}, ${mx} ${edge.y2}, ${edge.x2} ${edge.y2}`;
            const showArrow =
              isLink || layoutStyle === "flowchart" || layoutStyle === "concept";
            const edgeOnPath =
              !presentPath ||
              (presentPath.has(edge.fromId) && presentPath.has(edge.toId));
            return (
              <g
                key={`${edge.kind ?? "tree"}-${edge.fromId}-${edge.toId}-${edge.linkId ?? ""}`}
                className={`${isLink ? "edge-link-group" : ""} ${edgeOnPath ? "" : "present-dim"}`.trim()}
                opacity={edgeOnPath ? 1 : 0.28}
                onContextMenu={
                  isLink && edge.linkId && !presentationMode
                    ? (e) => openLinkMenu(e, edge.linkId!)
                    : undefined
                }
              >
                {isLink && edge.linkId && (
                  <path
                    className="edge-link-hit"
                    d={d}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={14}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      removeLink(edge.linkId!);
                    }}
                  >
                    <title>Right-click or double-click to remove link</title>
                  </path>
                )}
                <path
                  className={`edge-path ${isLink ? "edge-link" : ""}`}
                  d={d}
                  fill="none"
                  stroke={
                    isLink
                      ? cssVar("--accent", "#1a7a62")
                      : cssVar("--edge", "#958b7c")
                  }
                  strokeWidth={isLink ? 1.75 : 1.5}
                  strokeDasharray={isLink ? "6 4" : undefined}
                  pointerEvents={isLink ? "stroke" : "none"}
                  markerEnd={
                    showArrow
                      ? isLink
                        ? "url(#arrowhead-link)"
                        : "url(#arrowhead)"
                      : undefined
                  }
                />
                {edge.label && (
                  <text
                    x={mx}
                    y={my - 10}
                    textAnchor="middle"
                    className="edge-label"
                    fill={cssVar("--text-muted", "#7a7166")}
                    fontSize={11}
                    pointerEvents={isLink ? "auto" : "none"}
                    onContextMenu={
                      isLink && edge.linkId
                        ? (e) => openLinkMenu(e, edge.linkId!)
                        : undefined
                    }
                    onDoubleClick={
                      isLink && edge.linkId
                        ? (e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            removeLink(edge.linkId!);
                          }
                        : undefined
                    }
                  >
                    <title>
                      {isLink
                        ? `${edge.label} — right-click or double-click to remove`
                        : edge.label}
                    </title>
                    {edge.label.length > 36
                      ? `${edge.label.slice(0, 34)}…`
                      : edge.label}
                  </text>
                )}
              </g>
            );
          })}
          {layout.nodes.map((node) => {
            const selected = node.id === selectedNodeId;
            const multiSelected =
              selectedNodeIds.includes(node.id) && node.id !== selectedNodeId;
            const isDrop = dropIntent?.targetId === node.id;
            const isDrag = node.id === dragId;
            const isRoot = !node.parentId && !node.floating;
            const isRadialRoot = layoutStyle === "radial" && isRoot;
            const isLinkSource = linkingFromId === node.id;
            const onPresentPath = presentPath?.has(node.id) ?? false;
            const presentDim = !!presentPath && !onPresentPath;
            const presentFocus = !!presentPath && onPresentPath;
            const fill = node.style.fill || cssVar("--node-fill", "#f4f1ea");
            const stroke = isLinkSource
              ? cssVar("--accent", "#1a7a62")
              : isDrop
                ? cssVar("--accent", "#1a7a62")
                : selected || multiSelected
                  ? cssVar("--focus", "#1a7a62")
                  : presentFocus
                    ? cssVar("--accent", "#1a7a62")
                  : isRadialRoot
                    ? cssVar("--accent", "#1a7a62")
                    : node.floating
                      ? cssVar("--text-muted", "#7a7166")
                      : node.style.stroke || cssVar("--node-stroke", "#5a5348");
            const textColor =
              node.style.textColor || cssVar("--node-text", "#3a342c");
            const fontSize = node.style.fontSize ?? 14;
            return (
              <g
                key={node.id}
                ref={(element) => {
                  if (element) nodeRefs.current.set(node.id, element);
                  else nodeRefs.current.delete(node.id);
                }}
                role="treeitem"
                tabIndex={selected ? 0 : -1}
                aria-selected={selected}
                aria-label={`${node.text || "Untitled node"}${node.hasChildren ? `, ${node.collapsed ? "collapsed" : "expanded"}` : ""}`}
                aria-expanded={node.hasChildren ? !node.collapsed : undefined}
                className={`node-group ${isRadialRoot ? "radial-root" : ""} ${node.floating ? "floating-node" : ""} ${multiSelected ? "multi-selected" : ""} ${presentFocus ? "present-focus" : ""} ${presentDim ? "present-dim" : ""} ${selected && presentationMode ? "present-selected" : ""}`}
                opacity={isDrag ? 0.9 : presentDim ? 0.32 : 1}
                transform={`translate(${node.x}, ${node.y})`}
                style={{
                  cursor: linkingFromId
                    ? "crosshair"
                    : presentationMode
                      ? "pointer"
                      : dragId
                        ? "grabbing"
                        : "grab",
                }}
                onFocus={() => setSelectedNode(node.id)}
                onKeyDown={(e) => {
                  // Space keeps a fast collapse affordance on the focused node;
                  // Enter/Tab are handled by the canvas keymap (sibling/child).
                  if (e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    setSelectedNode(node.id);
                    if (node.hasChildren) toggleCollapseSelected();
                  }
                }}
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  e.stopPropagation();
                  closeMenu();
                  if (linkingFromId && !presentationMode) {
                    completeLinkTo(node.id);
                    return;
                  }
                  if (e.shiftKey && !presentationMode) {
                    toggleNodeSelection(node.id);
                    return;
                  }
                  // Double-click (detail >= 2): enter edit like F2, skip drag.
                  if (e.detail >= 2) {
                    e.preventDefault();
                    if (!presentationMode) beginEdit(node.id);
                    return;
                  }
                  if (!presentationMode) {
                    dragOrigin.current = {
                      x: e.clientX,
                      y: e.clientY,
                      id: node.id,
                    };
                  }
                  setSelectedNode(node.id);
                  nodeRefs.current.get(node.id)?.focus();
                  if (!presentationMode) {
                    try {
                      svgRef.current?.setPointerCapture(e.pointerId);
                    } catch {
                      /* ignore */
                    }
                  }
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (linkingFromId || e.shiftKey) return;
                  setSelectedNode(node.id);
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  if (!presentationMode) beginEdit(node.id);
                }}
                onContextMenu={(e) => {
                  if (presentationMode) {
                    e.preventDefault();
                    e.stopPropagation();
                    setSelectedNode(node.id);
                    return;
                  }
                  openNodeMenu(e, node.id);
                }}
              >
                <rect
                  className={`node-rect ${selected ? "selected" : ""} ${multiSelected ? "multi-selected" : ""} ${isDrop ? "drop-target" : ""} ${isRadialRoot ? "root-node" : ""} ${node.floating ? "floating" : ""} ${presentFocus ? "present-focus" : ""} ${selected && presentationMode ? "present-selected" : ""}`}
                  width={node.width}
                  height={node.height}
                  rx={isRadialRoot ? 14 : node.floating ? 4 : 10}
                  ry={isRadialRoot ? 14 : node.floating ? 4 : 10}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={
                    selected && presentationMode
                      ? 3.5
                      : presentFocus
                        ? 2.75
                        : selected
                          ? 3.25
                          : isLinkSource || isDrop || multiSelected
                            ? 2.5
                            : isRadialRoot
                              ? 2.75
                              : 1.5
                  }
                  strokeDasharray={node.floating ? "5 3" : undefined}
                />
                {(() => {
                  const scale = node.style.scale ?? 1;
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
                  const textCenterY = imgLayout
                    ? imgLayout.textCenterY
                    : node.height / 2;
                  return (
                    <>
                      {hasImages &&
                        imgLayout &&
                        vaultPath &&
                        imgLayout.placements.map((p) => {
                          const handle = 7;
                          return (
                            <g key={p.id} className="node-image-group">
                              <image
                                href={assetDisplayUrl(vaultPath, p.src)}
                                x={p.x}
                                y={p.y}
                                width={p.w}
                                height={p.h}
                                preserveAspectRatio="xMidYMid meet"
                                className="node-image"
                                style={{ cursor: "zoom-in" }}
                                onPointerDown={(e) => {
                                  // Prevent node edit from starting on image dblclick.
                                  if (e.detail >= 2) {
                                    e.stopPropagation();
                                    e.preventDefault();
                                  }
                                }}
                                onDoubleClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  setSelectedNode(node.id);
                                  setLightbox({
                                    src: p.src,
                                    url: assetDisplayUrl(vaultPath, p.src),
                                  });
                                }}
                              />
                              {selected && (
                                <rect
                                  className="node-image-resize"
                                  x={p.x + p.w - handle / 2}
                                  y={p.y + p.h - handle / 2}
                                  width={handle}
                                  height={handle}
                                  rx={1.5}
                                  fill={cssVar("--accent", "#1a7a62")}
                                  stroke={cssVar("--bg-elevated", "#f0ebe3")}
                                  strokeWidth={1}
                                  style={{ cursor: "nwse-resize" }}
                                  onPointerDown={(e) => {
                                    if (e.button !== 0) return;
                                    e.stopPropagation();
                                    e.preventDefault();
                                    closeMenu();
                                    setSelectedNode(node.id);
                                    const srcImg = images.find(
                                      (img) => img.id === p.id,
                                    );
                                    imageResize.current = {
                                      nodeId: node.id,
                                      imageId: p.id,
                                      startX: e.clientX,
                                      startY: e.clientY,
                                      startW: srcImg?.width ?? p.w / scale,
                                      startH: srcImg?.height ?? p.h / scale,
                                    };
                                    dragOrigin.current = null;
                                    try {
                                      svgRef.current?.setPointerCapture(
                                        e.pointerId,
                                      );
                                    } catch {
                                      /* ignore */
                                    }
                                  }}
                                />
                              )}
                            </g>
                          );
                        })}
                      <NodeLabelText
                        text={node.text}
                        width={node.width}
                        centerY={textCenterY}
                        fontSize={fontSize}
                        fill={textColor}
                        fontWeight={isRadialRoot ? 700 : 500}
                        scale={node.style.scale ?? 1}
                      />
                    </>
                  );
                })()}
                {node.hasChildren && (
                  <g
                    className="collapse-badge"
                    role="button"
                    tabIndex={0}
                    aria-label={`${node.collapsed ? "Expand" : "Collapse"} ${node.text || "node"}`}
                    transform={`translate(${node.width + 6}, ${node.height / 2 - 8})`}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter" && e.key !== " ") return;
                      e.preventDefault();
                      e.stopPropagation();
                      setSelectedNode(node.id);
                      toggleCollapseSelected();
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedNode(node.id);
                      toggleCollapseSelected();
                    }}
                  >
                    <circle
                      r={8}
                      cx={8}
                      cy={8}
                      fill={cssVar("--bg-elevated", "#f0ebe3")}
                      stroke={cssVar("--edge", "#958b7c")}
                    />
                    <text
                      x={8}
                      y={9}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={11}
                      fill={cssVar("--text-muted", "#7a7166")}
                    >
                      {node.collapsed ? "+" : "−"}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
          {/* Draw drop zones above all nodes so the dragged body doesn't cover them. */}
          {dropIntent &&
            (() => {
              const target = layout.nodes.find(
                (n) => n.id === dropIntent.targetId,
              );
              if (!target || target.id === dragId) return null;
              const overlayStyle =
                layoutStyle === "flowchart"
                  ? flowDir === "left"
                    ? "left"
                    : flowDir === "right"
                      ? "right"
                      : "down"
                  : layoutStyle;
              return (
                <g
                  className="drop-zone-layer"
                  transform={`translate(${target.x}, ${target.y})`}
                  pointerEvents="none"
                >
                  <DropZoneOverlay
                    node={target}
                    intent={dropIntent}
                    layoutStyle={overlayStyle}
                  />
                </g>
              );
            })()}
        </g>
      </svg>

      {editingNode && (
        <textarea
          key={editingNodeId ?? "edit"}
          ref={editInputRef}
          className="node-edit-input"
          rows={Math.max(1, editValue.split("\n").length)}
          style={{
            left: panX + editingNode.x * zoom,
            top: panY + editingNode.y * zoom,
            width: Math.max(120, editingNode.width * zoom),
            height: Math.max(28, editingNode.height * zoom),
            fontSize: (editingNode.style.fontSize ?? 14) * zoom,
          }}
          value={editValue}
          autoFocus
          onFocus={(e) => {
            if (pendingSelectAllRef.current) {
              const el = e.currentTarget;
              const len = el.value.length;
              el.setSelectionRange(0, len);
              el.select();
            }
          }}
          onChange={(e) => {
            editValueRef.current = e.target.value;
            setEditValue(e.target.value);
            // User started typing / editing — stop forcing select-all.
            pendingSelectAllRef.current = false;
          }}
          onBlur={() => {
            if (suppressEditBlurRef.current || pendingSelectAllRef.current) {
              // Spurious blur from dblclick / Strict Mode remount — keep editing.
              requestAnimationFrame(() => {
                const el = editInputRef.current;
                if (!el) return;
                el.focus();
                if (pendingSelectAllRef.current) el.select();
              });
              return;
            }
            commitEdit();
          }}
          onPaste={(e) => {
            handleNodeImagePaste(e);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              commitEdit();
              if (selectedNodeId) nodeRefs.current.get(selectedNodeId)?.focus();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              cancelEdit();
              if (selectedNodeId) nodeRefs.current.get(selectedNodeId)?.focus();
            }
            e.stopPropagation();
          }}
        />
      )}

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menu.items}
          onClose={closeMenu}
        />
      )}

      {lightbox && (
        <div
          className="image-lightbox"
          onClick={() => setLightbox(null)}
        >
          <div
            {...lightboxDialog.dialogProps}
            className="image-lightbox-card"
            aria-label="Image preview"
            aria-labelledby={undefined}
            onClick={(e) => e.stopPropagation()}
          >
            <img src={lightbox.url} alt="Full-size node image" />
            <button
              type="button"
              className="primary-btn"
              onClick={() => setLightbox(null)}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {pendingLink && (
        <div className="link-label-dialog">
          <div
            {...linkDialog.dialogProps}
            className="link-label-dialog-card"
          >
            <h3 id={linkDialog.titleId}>Link nodes</h3>
            <p className="hint">Optional relationship label for this connection.</p>
            <input
              className="link-label-input"
              placeholder='e.g. "leads to", "depends on"'
              value={linkLabel}
              onChange={(e) => setLinkLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  confirmPendingLink(linkLabel);
                }
                if (e.key === "Escape") {
                  cancelPendingLink();
                }
                e.stopPropagation();
              }}
            />
            <div className="link-label-actions">
              <button
                type="button"
                className="ghost-btn"
                onClick={() => cancelPendingLink()}
              >
                Cancel
              </button>
              <button
                type="button"
                className="ghost-btn"
                onClick={() => confirmPendingLink("")}
              >
                Skip label
              </button>
              <button
                type="button"
                className="primary-btn"
                onClick={() => confirmPendingLink(linkLabel)}
              >
                Create link
              </button>
            </div>
          </div>
        </div>
      )}

      {minimapVisible && !presentationMode && layout && (
        <Minimap
          layout={layout}
          panX={panX}
          panY={panY}
          zoom={zoom}
          viewWidth={viewSize.w}
          viewHeight={viewSize.h}
          onNavigate={(nx, ny) => setPanZoom(nx, ny, zoom)}
        />
      )}
    </div>
  );
}

function cssVar(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}
