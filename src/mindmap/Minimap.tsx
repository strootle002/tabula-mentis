import { useMemo, useRef } from "react";
import type { LayoutResult } from "./types";

interface MinimapProps {
  layout: LayoutResult;
  panX: number;
  panY: number;
  zoom: number;
  viewWidth: number;
  viewHeight: number;
  onNavigate: (panX: number, panY: number) => void;
}

const MM_W = 168;
const MM_H = 118;
const MM_PAD = 8;

export function Minimap({
  layout,
  panX,
  panY,
  zoom,
  viewWidth,
  viewHeight,
  onNavigate,
}: MinimapProps) {
  const dragging = useRef(false);

  const world = useMemo(() => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of layout.nodes) {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + n.width);
      maxY = Math.max(maxY, n.y + n.height);
    }
    if (!Number.isFinite(minX)) {
      minX = 0;
      minY = 0;
      maxX = 400;
      maxY = 300;
    }
    minX -= 40;
    minY -= 40;
    maxX += 40;
    maxY += 40;
    return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
  }, [layout.nodes]);

  const innerW = MM_W - MM_PAD * 2;
  const innerH = MM_H - MM_PAD * 2;
  const scale = Math.min(
    innerW / Math.max(world.w, 1),
    innerH / Math.max(world.h, 1),
  );
  // Center the fitted content inside the minimap (avoids top/left bias when
  // the map aspect ratio doesn't match the preview).
  const offsetX = MM_PAD + (innerW - world.w * scale) / 2;
  const offsetY = MM_PAD + (innerH - world.h * scale) / 2;

  const toMini = (x: number, y: number) => ({
    x: offsetX + (x - world.minX) * scale,
    y: offsetY + (y - world.minY) * scale,
  });

  const viewWorld = {
    x: -panX / zoom,
    y: -panY / zoom,
    w: viewWidth / zoom,
    h: viewHeight / zoom,
  };
  const tl = toMini(viewWorld.x, viewWorld.y);
  const br = toMini(viewWorld.x + viewWorld.w, viewWorld.y + viewWorld.h);

  const navigateFromClient = (
    clientX: number,
    clientY: number,
    el: HTMLElement,
  ) => {
    const rect = el.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    const wx = world.minX + (mx - offsetX) / scale;
    const wy = world.minY + (my - offsetY) / scale;
    const nextPanX = viewWidth / 2 - wx * zoom;
    const nextPanY = viewHeight / 2 - wy * zoom;
    onNavigate(nextPanX, nextPanY);
  };

  return (
    <div
      className="minimap"
      title="Map overview — click or drag to navigate"
      onPointerDown={(e) => {
        e.stopPropagation();
        dragging.current = true;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        navigateFromClient(e.clientX, e.clientY, e.currentTarget);
      }}
      onPointerMove={(e) => {
        if (!dragging.current) return;
        navigateFromClient(e.clientX, e.clientY, e.currentTarget);
      }}
      onPointerUp={(e) => {
        dragging.current = false;
        try {
          (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      }}
    >
      <svg width={MM_W} height={MM_H} className="minimap-svg">
        <rect
          x={0}
          y={0}
          width={MM_W}
          height={MM_H}
          className="minimap-bg"
          rx={6}
        />
        {layout.nodes.map((n) => {
          const p = toMini(n.x, n.y);
          return (
            <rect
              key={n.id}
              x={p.x}
              y={p.y}
              width={Math.max(2, n.width * scale)}
              height={Math.max(2, n.height * scale)}
              className={`minimap-node ${n.parentId == null && !n.floating ? "root" : ""}`}
              rx={1}
            />
          );
        })}
        <rect
          x={Math.min(tl.x, br.x)}
          y={Math.min(tl.y, br.y)}
          width={Math.max(4, Math.abs(br.x - tl.x))}
          height={Math.max(4, Math.abs(br.y - tl.y))}
          className="minimap-viewport"
        />
      </svg>
    </div>
  );
}
