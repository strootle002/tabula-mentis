export const PLUGIN_API_VERSION = "1.0";

export type PluginCapability =
  | "commands:register"
  | "search:provide"
  | "interchange:import"
  | "interchange:export";

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  apiVersion: string;
  capabilities: PluginCapability[];
}

export interface PluginCommand {
  id: string;
  label: string;
  run: () => void | Promise<void>;
}

export interface PluginSearchProvider {
  search(query: string): readonly {
    id: string;
    title: string;
    snippet?: string;
  }[];
}

export interface PluginInterchangeAdapter {
  extensions: readonly string[];
  import?: (content: string) => unknown;
  export?: (value: unknown) => string;
}

export interface BuiltinPluginAdapter {
  commands?: readonly PluginCommand[];
  search?: PluginSearchProvider;
  interchange?: PluginInterchangeAdapter;
}

export class PluginValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PluginValidationError";
  }
}

const CAPABILITIES = new Set<PluginCapability>([
  "commands:register",
  "search:provide",
  "interchange:import",
  "interchange:export",
]);
const ID = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function validatePluginManifest(value: unknown): PluginManifest {
  if (!record(value)) throw new PluginValidationError("Plugin manifest must be an object");
  const allowed = new Set(["id", "name", "version", "apiVersion", "capabilities"]);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) {
    throw new PluginValidationError(`Unknown manifest field "${unknown[0]}"`);
  }
  if (typeof value.id !== "string" || !ID.test(value.id)) {
    throw new PluginValidationError("Plugin id must be lowercase dot/dash notation");
  }
  if (typeof value.name !== "string" || !value.name.trim() || value.name.length > 80) {
    throw new PluginValidationError("Plugin name must be 1–80 characters");
  }
  if (typeof value.version !== "string" || !SEMVER.test(value.version)) {
    throw new PluginValidationError("Plugin version must be semantic versioning");
  }
  if (value.apiVersion !== PLUGIN_API_VERSION) {
    throw new PluginValidationError(
      `Plugin API ${String(value.apiVersion)} is incompatible with ${PLUGIN_API_VERSION}`,
    );
  }
  if (!Array.isArray(value.capabilities)) {
    throw new PluginValidationError("Plugin capabilities must be an array");
  }
  const capabilities = value.capabilities as unknown[];
  for (const capability of capabilities) {
    if (typeof capability !== "string" || !CAPABILITIES.has(capability as PluginCapability)) {
      throw new PluginValidationError(`Unsupported capability "${String(capability)}"`);
    }
  }
  if (new Set(capabilities).size !== capabilities.length) {
    throw new PluginValidationError("Plugin capabilities must be unique");
  }
  return {
    id: value.id,
    name: value.name,
    version: value.version,
    apiVersion: value.apiVersion,
    capabilities: capabilities as PluginCapability[],
  };
}

interface RegisteredPlugin {
  manifest: PluginManifest;
  adapter: BuiltinPluginAdapter;
  enabled: boolean;
}

/**
 * Registry for code bundled and reviewed with the application only.
 *
 * It intentionally has no filesystem loader, dynamic import, eval, webview
 * script bridge, or raw vault handle. Third-party manifests can be validated
 * and displayed, but cannot execute until a real isolated host exists.
 */
export class PluginRegistry {
  private readonly plugins = new Map<string, RegisteredPlugin>();

  registerBuiltin(manifestValue: unknown, adapter: BuiltinPluginAdapter): void {
    const manifest = validatePluginManifest(manifestValue);
    if (this.plugins.has(manifest.id)) {
      throw new PluginValidationError(`Plugin "${manifest.id}" is already registered`);
    }
    this.validateAdapterCapabilities(manifest, adapter);
    this.plugins.set(manifest.id, { manifest, adapter, enabled: false });
  }

  setEnabled(id: string, enabled: boolean): void {
    const plugin = this.plugins.get(id);
    if (!plugin) throw new PluginValidationError(`Unknown plugin "${id}"`);
    plugin.enabled = enabled;
  }

  list(): readonly { manifest: PluginManifest; enabled: boolean }[] {
    return [...this.plugins.values()]
      .map(({ manifest, enabled }) => ({ manifest, enabled }))
      .sort((a, b) => a.manifest.id.localeCompare(b.manifest.id));
  }

  commands(): readonly PluginCommand[] {
    return this.enabled()
      .filter(({ manifest }) => manifest.capabilities.includes("commands:register"))
      .flatMap(({ adapter }) => adapter.commands ?? []);
  }

  searchProviders(): readonly PluginSearchProvider[] {
    return this.enabled()
      .filter(({ manifest }) => manifest.capabilities.includes("search:provide"))
      .flatMap(({ adapter }) => (adapter.search ? [adapter.search] : []));
  }

  interchangeAdapters(): readonly PluginInterchangeAdapter[] {
    return this.enabled().flatMap(({ adapter }) =>
      adapter.interchange ? [adapter.interchange] : [],
    );
  }

  private enabled(): RegisteredPlugin[] {
    return [...this.plugins.values()].filter((plugin) => plugin.enabled);
  }

  private validateAdapterCapabilities(
    manifest: PluginManifest,
    adapter: BuiltinPluginAdapter,
  ): void {
    const required: PluginCapability[] = [];
    if (adapter.commands?.length) required.push("commands:register");
    if (adapter.search) required.push("search:provide");
    if (adapter.interchange?.import) required.push("interchange:import");
    if (adapter.interchange?.export) required.push("interchange:export");
    for (const capability of required) {
      if (!manifest.capabilities.includes(capability)) {
        throw new PluginValidationError(
          `Adapter uses undeclared capability "${capability}"`,
        );
      }
    }
  }
}
