import { describe, expect, it } from "vitest";
import { exportRasterSize } from "./exportPng";

describe("exportRasterSize", () => {
  it("keeps small maps at 1:1", () => {
    expect(exportRasterSize(800, 600)).toEqual({
      width: 800,
      height: 600,
      scale: 1,
    });
  });

  it("caps the longest edge at maxEdge", () => {
    const result = exportRasterSize(8192, 2048, 4096);
    expect(result.width).toBe(4096);
    expect(result.height).toBe(1024);
    expect(result.scale).toBe(0.5);
  });

  it("guards non-finite dimensions", () => {
    expect(exportRasterSize(Number.POSITIVE_INFINITY, NaN).width).toBe(1);
    expect(exportRasterSize(0, 0).height).toBe(1);
  });
});
