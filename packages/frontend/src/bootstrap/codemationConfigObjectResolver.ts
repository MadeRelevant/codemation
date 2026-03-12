import type { CodemationConfig } from "./codemationBootstrapTypes";

export class CodemationConfigObjectResolver {
  resolve(moduleExports: Readonly<Record<string, unknown>>): CodemationConfig | null {
    const defaultExport = moduleExports.default;
    if (this.isConfigObject(defaultExport)) return defaultExport;
    const namedConfig = moduleExports.config;
    if (this.isConfigObject(namedConfig)) return namedConfig;
    return null;
  }

  private isConfigObject(value: unknown): value is CodemationConfig {
    if (!value || typeof value !== "object") return false;
    return "credentials" in value || "runtime" in value || "workflows" in value || "bootHook" in value;
  }
}
