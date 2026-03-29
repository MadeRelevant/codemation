import type { CodemationConfig } from "../config/CodemationConfig";

export class CodemationConsumerConfigExportsResolver {
  resolveConfig(moduleExports: Readonly<Record<string, unknown>>): CodemationConfig | null {
    const defaultExport = moduleExports.default;
    if (this.isConfig(defaultExport)) {
      return defaultExport;
    }
    const namedConfig = moduleExports.codemationHost ?? moduleExports.config;
    if (this.isConfig(namedConfig)) {
      return namedConfig;
    }
    return null;
  }

  private isConfig(value: unknown): value is CodemationConfig {
    if (!value || typeof value !== "object") {
      return false;
    }
    return (
      "app" in value ||
      "register" in value ||
      "credentials" in value ||
      "runtime" in value ||
      "workflows" in value ||
      "workflowDiscovery" in value ||
      "plugins" in value ||
      "whitelabel" in value ||
      "auth" in value ||
      "log" in value
    );
  }
}
