import { access, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { WorkflowDefinition } from "@codemation/core";
import type { CodemationConfig } from "../config/CodemationConfig";
import type { NamespacedUnregister } from "tsx/esm/api";
import { register } from "tsx/esm/api";

export type CodemationConsumerConfigResolution = Readonly<{
  config: CodemationConfig;
  bootstrapSource: string | null;
  workflowSources: ReadonlyArray<string>;
}>;

export class CodemationConsumerConfigLoader {
  private static readonly importerRegistrationsByTsconfig = new Map<string, NamespacedUnregister>();
  private static readonly defaultWorkflowDirectories = ["src/workflows", "workflows"] as const;
  private readonly workflowExtensions = new Set([".ts", ".js", ".mts", ".mjs"]);

  async load(args: Readonly<{ consumerRoot: string; configPathOverride?: string }>): Promise<CodemationConsumerConfigResolution> {
    const bootstrapSource = await this.resolveConfigPath(args.consumerRoot, args.configPathOverride);
    if (!bootstrapSource) {
      throw new Error('Codemation config not found. Expected "codemation.config.ts" in the consumer project root or "src/".');
    }
    const moduleExports = await this.importModule(bootstrapSource);
    const config = this.resolveConfig(moduleExports);
    if (!config) {
      throw new Error(`Config file does not export a Codemation config object: ${bootstrapSource}`);
    }
    const workflowSources = await this.resolveWorkflowSources(args.consumerRoot, config);
    const workflows = config.workflows ?? (await this.loadDiscoveredWorkflows(workflowSources));
    return {
      config: {
        ...config,
        workflows,
      },
      bootstrapSource,
      workflowSources,
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
    return (
      "credentials" in value ||
      "runtime" in value ||
      "workflows" in value ||
      "workflowDiscovery" in value ||
      "bindings" in value ||
      "bootHook" in value ||
      "slots" in value
    );
  }

  private async resolveWorkflowSources(consumerRoot: string, config: CodemationConfig): Promise<ReadonlyArray<string>> {
    if (config.workflows !== undefined) {
      return [];
    }
    const discoveredPaths = await this.discoverWorkflowModulePaths(consumerRoot, config.workflowDiscovery?.directories);
    return [...discoveredPaths].sort((left: string, right: string) => left.localeCompare(right));
  }

  private async discoverWorkflowModulePaths(
    consumerRoot: string,
    workflowDirectories: ReadonlyArray<string> | undefined,
  ): Promise<ReadonlyArray<string>> {
    const directories = workflowDirectories ?? CodemationConsumerConfigLoader.defaultWorkflowDirectories;
    const workflowModulePaths: string[] = [];
    for (const directory of directories) {
      const absoluteDirectory = path.resolve(consumerRoot, directory);
      if (!(await this.exists(absoluteDirectory))) {
        continue;
      }
      workflowModulePaths.push(...(await this.collectWorkflowModulePaths(absoluteDirectory)));
    }
    return workflowModulePaths;
  }

  private async collectWorkflowModulePaths(directoryPath: string): Promise<ReadonlyArray<string>> {
    const entries = await readdir(directoryPath, { withFileTypes: true });
    const workflowModulePaths: string[] = [];
    for (const entry of entries) {
      const entryPath = path.resolve(directoryPath, entry.name);
      if (entry.isDirectory()) {
        workflowModulePaths.push(...(await this.collectWorkflowModulePaths(entryPath)));
        continue;
      }
      if (this.isWorkflowModulePath(entryPath)) {
        workflowModulePaths.push(entryPath);
      }
    }
    return workflowModulePaths;
  }

  private isWorkflowModulePath(modulePath: string): boolean {
    const extension = path.extname(modulePath);
    return this.workflowExtensions.has(extension) && !modulePath.endsWith(".d.ts");
  }

  private async loadDiscoveredWorkflows(workflowSources: ReadonlyArray<string>): Promise<ReadonlyArray<WorkflowDefinition>> {
    const workflowsById = new Map<string, WorkflowDefinition>();
    for (const workflowSource of workflowSources) {
      const moduleExports = await this.importModule(workflowSource);
      for (const workflow of this.resolveWorkflows(moduleExports, workflowSource)) {
        workflowsById.set(workflow.id, workflow);
      }
    }
    return [...workflowsById.values()];
  }

  private resolveWorkflows(moduleExports: Readonly<Record<string, unknown>>, workflowSource: string): ReadonlyArray<WorkflowDefinition> {
    const workflows: WorkflowDefinition[] = [];
    for (const exportedValue of Object.values(moduleExports)) {
      if (this.isWorkflowDefinition(exportedValue)) {
        workflows.push(exportedValue);
      }
    }
    if (workflows.length === 0) {
      throw new Error(`Workflow module does not export a workflow definition: ${workflowSource}`);
    }
    return workflows;
  }

  private isWorkflowDefinition(value: unknown): value is WorkflowDefinition {
    if (!value || typeof value !== "object") {
      return false;
    }
    return "id" in value && "name" in value && "nodes" in value && "edges" in value;
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
    const existingImporter = CodemationConsumerConfigLoader.importerRegistrationsByTsconfig.get(cacheKey);
    if (existingImporter) {
      return existingImporter;
    }
    const nextImporter = register({
      namespace: this.toNamespace(cacheKey),
      tsconfig: tsconfigPath,
    });
    CodemationConsumerConfigLoader.importerRegistrationsByTsconfig.set(cacheKey, nextImporter);
    return nextImporter;
  }

  private toNamespace(cacheKey: string): string {
    return `codemation_consumer_${cacheKey.replace(/[^a-zA-Z0-9_-]+/g, "_")}`;
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
