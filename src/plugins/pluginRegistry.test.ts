import { describe, expect, it, vi } from "vitest";
import {
  PluginRegistry,
  PluginValidationError,
  validatePluginManifest,
} from "./pluginRegistry";

const manifest = {
  id: "mindmap.example",
  name: "Example",
  version: "1.2.3",
  apiVersion: "1.0",
  capabilities: ["commands:register"] as const,
};

describe("safe plugin boundary", () => {
  it("strictly validates manifests and API compatibility", () => {
    expect(validatePluginManifest(manifest)).toEqual(manifest);
    expect(() => validatePluginManifest({ ...manifest, apiVersion: "2.0" })).toThrow(
      "incompatible",
    );
    expect(() =>
      validatePluginManifest({ ...manifest, capabilities: ["filesystem:raw"] }),
    ).toThrow("Unsupported capability");
    expect(() => validatePluginManifest({ ...manifest, entry: "./plugin.js" })).toThrow(
      "Unknown manifest field",
    );
  });

  it("keeps built-ins disabled by default and gates declared surfaces", async () => {
    const run = vi.fn();
    const registry = new PluginRegistry();
    registry.registerBuiltin(manifest, {
      commands: [{ id: "example.run", label: "Run example", run }],
    });
    expect(registry.commands()).toEqual([]);
    expect(registry.list()[0].enabled).toBe(false);

    registry.setEnabled("mindmap.example", true);
    await registry.commands()[0].run();
    expect(run).toHaveBeenCalledOnce();
  });

  it("rejects duplicate IDs and undeclared adapter capabilities", () => {
    const registry = new PluginRegistry();
    registry.registerBuiltin(manifest, {});
    expect(() => registry.registerBuiltin(manifest, {})).toThrow(PluginValidationError);
    expect(() =>
      new PluginRegistry().registerBuiltin(
        { ...manifest, capabilities: [] },
        { commands: [{ id: "x", label: "X", run: () => undefined }] },
      ),
    ).toThrow("undeclared capability");
  });
});
