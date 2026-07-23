import { useEffect, useRef, useState } from "react";

export interface ContextMenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  separator?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const maxX = typeof window !== "undefined" ? window.innerWidth - 200 : x;
  const maxY = typeof window !== "undefined" ? window.innerHeight - 40 : y;
  const left = Math.min(x, maxX);
  const top = Math.min(y, maxY);

  return (
    <div
      ref={ref}
      className="context-menu"
      style={{ left, top }}
      role="menu"
    >
      {items.map((item, i) =>
        item.separator ? (
          <div key={`sep-${i}`} className="context-menu-sep" />
        ) : (
          <button
            key={`${item.label}-${i}`}
            type="button"
            className={`context-menu-item ${item.danger ? "danger" : ""}`}
            disabled={item.disabled}
            onClick={() => {
              if (item.disabled) return;
              item.onClick();
              onClose();
            }}
          >
            {item.label}
          </button>
        ),
      )}
    </div>
  );
}

export function useContextMenu() {
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    items: ContextMenuItem[];
  } | null>(null);

  return {
    menu,
    openMenu: (x: number, y: number, items: ContextMenuItem[]) =>
      setMenu({ x, y, items }),
    closeMenu: () => setMenu(null),
  };
}
