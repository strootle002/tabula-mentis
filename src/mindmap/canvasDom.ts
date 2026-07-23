/** Locate the currently mounted canvas without importing the canvas renderer. */
export function getCanvasSvg(): SVGSVGElement | null {
  return document.querySelector(".mindmap-svg");
}
