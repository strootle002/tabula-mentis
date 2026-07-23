import { openUrl } from "@tauri-apps/plugin-opener";

/** http(s) / mailto / tel — open in the OS browser or handler, not the webview. */
export function isExternalHref(href: string): boolean {
  return /^(https?:|mailto:|tel:)/i.test(href.trim());
}

export async function openExternalHref(href: string): Promise<void> {
  await openUrl(href.trim());
}

/**
 * Handle an editor anchor click. Always preventDefault for `<a>` so the Tauri
 * webview never tries to navigate (which shows "URL could not be displayed"
 * and can trigger bogus disk reads).
 *
 * Returns true when the event targeted a link (handled or intentionally ignored).
 */
export function handleNoteEditorLinkClick(
  e: { preventDefault: () => void; target: EventTarget | null },
  onError?: (message: string) => void,
): boolean {
  const el = e.target;
  if (!(el instanceof Element)) return false;

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
    return true;
  }

  if (isExternalHref(href)) {
    void openExternalHref(href).catch((err) => {
      onError?.(
        `Could not open link: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
    return true;
  }

  onError?.(
    `Cannot open “${href}” inside Tabula Mentis. Use an https://… web link instead.`,
  );
  return true;
}
