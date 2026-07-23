// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { useAccessibleDialog } from "./useAccessibleDialog";

function Dialog({ onClose }: { onClose: () => void }) {
  const { dialogProps, titleId } = useAccessibleDialog(true, onClose);
  return (
    <div {...dialogProps}>
      <h2 id={titleId}>Test dialog</h2>
      <button type="button">First</button>
      <button type="button">Last</button>
    </div>
  );
}

describe("accessible dialog behavior", () => {
  it("focuses, contains focus, closes with Escape, and restores focus", async () => {
    const originalRaf = globalThis.requestAnimationFrame;
    const originalCancelRaf = globalThis.cancelAnimationFrame;
    globalThis.requestAnimationFrame = (callback) =>
      window.setTimeout(() => callback(performance.now()), 0);
    globalThis.cancelAnimationFrame = (handle) => clearTimeout(handle);

    const trigger = document.createElement("button");
    const host = document.createElement("div");
    document.body.append(trigger, host);
    trigger.focus();
    const root = createRoot(host);
    const close = vi.fn();

    await act(async () => {
      root.render(<Dialog onClose={close} />);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });

    const buttons = host.querySelectorAll("button");
    expect(document.activeElement).toBe(buttons[0]);
    buttons[1].focus();
    buttons[1].dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", bubbles: true }),
    );
    expect(document.activeElement).toBe(buttons[0]);

    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(close).toHaveBeenCalledOnce();

    await act(async () => {
      root.unmount();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
    expect(document.activeElement).toBe(trigger);

    trigger.remove();
    host.remove();
    globalThis.requestAnimationFrame = originalRaf;
    globalThis.cancelAnimationFrame = originalCancelRaf;
  });
});
