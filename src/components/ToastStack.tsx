import { useEffect, useRef } from "react";
import { useAppStore } from "../store/appStore";

const AUTO_DISMISS_MS = 3500;

export function ToastStack() {
  const toasts = useAppStore((s) => s.toasts);
  const dismissToast = useAppStore((s) => s.dismissToast);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const active = new Set(toasts.map((t) => t.id));
    for (const [id, timer] of timers.current) {
      if (!active.has(id)) {
        clearTimeout(timer);
        timers.current.delete(id);
      }
    }
    for (const toast of toasts) {
      if (timers.current.has(toast.id)) continue;
      timers.current.set(
        toast.id,
        setTimeout(() => {
          timers.current.delete(toast.id);
          dismissToast(toast.id);
        }, AUTO_DISMISS_MS),
      );
    }
  }, [toasts, dismissToast]);

  useEffect(
    () => () => {
      for (const timer of timers.current.values()) clearTimeout(timer);
      timers.current.clear();
    },
    [],
  );

  if (toasts.length === 0) return null;

  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          type="button"
          className={`toast ${toast.tone ? `toast-${toast.tone}` : ""}`}
          onClick={() => dismissToast(toast.id)}
          title="Dismiss"
        >
          {toast.message}
        </button>
      ))}
    </div>
  );
}
