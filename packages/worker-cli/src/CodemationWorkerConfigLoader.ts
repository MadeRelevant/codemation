import { access, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { CodemationConfig } from "@codemation/frontend";
import type { NamespacedUnregister } from "tsx/esm/api";
import { register } from "tsx/esm/api";

export type WorkerConfigResolution = Readonly<{
  config: CodemationConfig;
  bootstrapSource: string | null;
  workflowSources: ReadonlyArray<string>;
}>;

export class CodemationWorkerConfigLoader {
  private static readonly importerRegistrationsByTsconfig = new Map<string, NamespacedUnregister>();

  async load(args: Readonly<{ consumerRoot: string; configPathOverride?: string }>): Promise<WorkerConfigResolution> {
    const bootstrapSource = await this.resolveConfigPath(args.consumerRoot, args.configPathOverride);
    if (!bootstrapSource) {
      throw new Error('Codemation config not found. Expected "codemation.config.ts" in the consumer project root or "src/".');
    }
    const moduleExports = await this.importModule(bootstrapSource);
    const config = this.resolveConfig(moduleExports);
    if (!config) {
      throw new Error(`Config file does not export a Codemation config object: ${bootstrapSource}`);
    }
    return {
      config,
      bootstrapSource,
      workflowSources: config.workflows && config.workflows.length > 0 ? [bootstrapSource] : [],
    };
  }

  private async resolveConfigPath(consumerRoot: string, configPathOverride: string | undefined): Promise<string | null> {
    if (configPathOverride) {
      const explicitPath = path.isAbsolute(configPathOverride) ? configPathOverride : path.resolve(consumerRoot, configPathOverride);
      if (!(await this.exists(explicitPath))) {
        throw new Error(`Config file not found: ${explicitPath}`);
      }
      return explicitPath;
    }
    for (const candidate of this.getConventionCandidates(consumerRoot)) {
      if (await this.exists(candidate)) {
        return candidate;
      }
    }
    return null;
  }

  private getConventionCandidates(consumerRoot: string): ReadonlyArray<string> {
    return [
      path.resolve(consumerRoot, "codemation.config.ts"),
      path.resolve(consumerRoot, "codemation.config.js"),
      path.resolve(consumerRoot, "src", "codemation.config.ts"),
      path.resolve(consumerRoot, "src", "codemation.config.js"),
    ];
  }

  private resolveConfig(moduleExports: Readonly<Record<string, unknown>>): CodemationConfig | null {
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
    return "credentials" in value || "runtime" in value || "workflows" in value || "bootHook" in value || "slots" in value;
  }

  private async importModule(modulePath: string): Promise<Record<string, unknown>> {
    const tsconfigPath = await this.resolveTsconfigPath(modulePath);
    const importedModule = await this.getOrCreateImporter(tsconfigPath).import(await this.createImportSpecifier(modulePath), import.meta.url);
    return importedModule as Record<string, unknown>;
  }

  private async resolveTsconfigPath(modulePath: string): Promise<string | false> {
    const discoveredPath = await this.findNearestTsconfig(modulePath);
    return discoveredPath ?? false;
  }

  private getOrCreateImporter(tsconfigPath: string | false): NamespacedUnregister {
    const cacheKey = tsconfigPath || "default";
    const existingImporter = CodemationWorkerConfigLoader.importerRegistrationsByTsconfig.get(cacheKey);
    if (existingImporter) {
      return existingImporter;
    }
    const nextImporter = register({
      namespace: this.toNamespace(cacheKey),
      tsconfig: tsconfigPath,
    });
    CodemationWorkerConfigLoader.importerRegistrationsByTsconfig.set(cacheKey, nextImporter);
    return nextImporter;
  }

  private toNamespace(cacheKey: string): string {
    return `codemation_worker_${cacheKey.replace(/[^a-zA-Z0-9_-]+/g, "_")}`;
  }

  private async findNearestTsconfig(modulePath: string): Promise<string | null> {
    let currentDirectory = path.dirname(modulePath);
    while (true) {
      const candidate = path.resolve(currentDirectory, "tsconfig.json");
      if (await this.exists(candidate)) {
        return candidate;
      }
      const parentDirectory = path.dirname(currentDirectory);
      if (parentDirectory === currentDirectory) {
        return null;
      }
      currentDirectory = parentDirectory;
    }
  }

  private async createImportSpecifier(modulePath: string): Promise<string> {
    const moduleUrl = pathToFileURL(modulePath);
    const moduleStats = await stat(modulePath);
    moduleUrl.searchParams.set("t", String(moduleStats.mtimeMs));
    return moduleUrl.href;
  }

  private async exists(filePath: string): Promise<boolean> {
    try {
      await access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
