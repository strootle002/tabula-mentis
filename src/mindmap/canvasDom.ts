/** Locate the currently mounted canvas without importing the canvas renderer. */
export function getCanvasSvg(): SVGSVGElement | null {
  return document.querySelector(".mindmap-svg");
}

/** Locate the scrollable canvas viewport (for size/visible-region math). */
export function getCanvasWrap(): HTMLElement | null {
  return document.querySelector(".canvas-wrap");
}
