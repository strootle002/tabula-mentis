import { openUrl } from "@tauri-apps/plugin-opener";

/** http(s) / mailto / tel — open in the OS browser or handler, not the webview. */
export function isExternalHref(href: string): boolean {
  return /^(https?:|mailto:|tel:)/i.test(href.trim());
}

export async function openExternalHref(href: string): Promise<void> {
  await openUrl(href.trim());
}

export type NoteLinkHandlers = {
  onError?: (message: string) => void;
  /** Open a note by wiki target title (e.g. from [[Target]]). */
  onWikiTarget?: (target: string) => void;
};

/**
 * Handle an editor anchor / wiki-link / tag click. Always preventDefault for
 * `<a>` so the Tauri webview never tries to navigate.
 *
 * Returns true when the event targeted a link-like element.
 */
export function handleNoteEditorLinkClick(
  e: { preventDefault: () => void; target: EventTarget | null },
  onErrorOrHandlers?: ((message: string) => void) | NoteLinkHandlers,
): boolean {
  const handlers: NoteLinkHandlers =
    typeof onErrorOrHandlers === "function"
      ? { onError: onErrorOrHandlers }
      : (onErrorOrHandlers ?? {});

  const el = e.target;
  if (!(el instanceof Element)) return false;

  const wikiEl = el.closest(".note-wiki-link");
  if (wikiEl instanceof HTMLElement) {
    e.preventDefault();
    const target =
      wikiEl.getAttribute("data-wiki") ||
      (wikiEl.textContent ?? "").trim();
    if (target) handlers.onWikiTarget?.(target);
    return true;
  }

  const tagEl = el.closest(".note-tag");
  if (tagEl instanceof HTMLElement) {
    e.preventDefault();
    return true; // caller may still handle tags separately
  }

  const link = el.closest("a");
  if (!(link instanceof HTMLAnchorElement)) return false;

  e.preventDefault();
  const href = link.getAttribute("href")?.trim() ?? "";
  if (!href || href === "#") return true;

  // Ignore legacy wiki: hrefs from older notes — do not create pages.
  if (href.toLowerCase().startsWith("wiki:")) {
    const target = href.slice("wiki:".length).trim();
    if (target) handlers.onWikiTarget?.(decodeURIComponent(target));
    return true;
  }

  if (isExternalHref(href)) {
    void openExternalHref(href).catch((err) => {
      handlers.onError?.(
        `Could not open link: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
    return true;
  }

  handlers.onError?.(
    `Cannot open “${href}” inside Tabula Mentis. Use an https://… web link or [[WikiLink]] instead.`,
  );
  return true;
}
