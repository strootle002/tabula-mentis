import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const tauriConfig = JSON.parse(
  readFileSync("src-tauri/tauri.conf.json", "utf8"),
);
const capability = JSON.parse(
  readFileSync("src-tauri/capabilities/default.json", "utf8"),
);

describe("desktop security configuration", () => {
  it("uses a restrictive CSP with only required local image sources", () => {
    const csp: string = tauriConfig.app.security.csp;
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("img-src 'self' asset: http://asset.localhost blob: data:");
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toContain("*");
    expect(csp).not.toContain("https:");
  });

  it("has no pre-authorized personal-folder or asset scope", () => {
    expect(tauriConfig.app.security.assetProtocol.scope.allow).toEqual([]);
    const serialized = JSON.stringify(capability.permissions);
    expect(serialized).not.toMatch(
      /allow-(?:home|document|desktop|download)-.*recursive/,
    );
    expect(serialized).not.toContain("$HOME");
    expect(capability.permissions).not.toContain("fs:default");
    expect(capability.permissions).not.toContain("store:default");
    expect(capability.permissions).not.toContain("store:allow-load");
  });

  it("does not load network fonts", () => {
    const css = readFileSync("src/styles/global.css", "utf8");
    expect(css).not.toMatch(/fonts\.(?:googleapis|gstatic)\.com/);
  });
});
