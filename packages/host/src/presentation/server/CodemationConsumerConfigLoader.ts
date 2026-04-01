import type { WorkflowDefinition } from "@codemation/core";
import { access, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { NamespacedUnregister } from "tsx/esm/api";
import type { CodemationConfig } from "../config/CodemationConfig";
import { CodemationConfigNormalizer } from "../config/CodemationConfigNormalizer";
import type { NormalizedCodemationConfig } from "../config/CodemationConfigNormalizer";
import { logLevelPolicyFactory } from "../../infrastructure/logging/LogLevelPolicyFactory";
import { ServerLoggerFactory } from "../../infrastructure/logging/ServerLoggerFactory";
import { DiscoveredWorkflowsEmptyMessageFactory } from "./DiscoveredWorkflowsEmptyMessageFactory";
import { CodemationConsumerConfigExportsResolver } from "./CodemationConsumerConfigExportsResolver";
import { WorkflowDefinitionExportsResolver } from "./WorkflowDefinitionExportsResolver";
import { WorkflowDiscoveryPathSegmentsComputer } from "./WorkflowDiscoveryPathSegmentsComputer";
import { WorkflowModulePathFinder } from "./WorkflowModulePathFinder";

export type CodemationConsumerConfigResolution = Readonly<{
  config: NormalizedCodemationConfig;
  bootstrapSource: string | null;
  workflowSources: ReadonlyArray<string>;
}>;

export class CodemationConsumerConfigLoader {
  private static readonly importerRegistrationsByTsconfig = new Map<string, NamespacedUnregister>();
  private readonly configExportsResolver = new CodemationConsumerConfigExportsResolver();
  private readonly configNormalizer = new CodemationConfigNormalizer();
  private readonly workflowModulePathFinder = new WorkflowModulePathFinder();
  private readonly workflowDefinitionExportsResolver = new WorkflowDefinitionExportsResolver();
  private readonly discoveredWorkflowsEmptyMessageFactory = new DiscoveredWorkflowsEmptyMessageFactory();
  private readonly pathSegmentsComputer = new WorkflowDiscoveryPathSegmentsComputer();
  private readonly performanceDiagnosticsLogger = new ServerLoggerFactory(
    logLevelPolicyFactory,
  ).createPerformanceDiagnostics("codemation-config-loader.timing");

  async load(
    args: Readonly<{ consumerRoot: string; configPathOverride?: string }>,
  ): Promise<CodemationConsumerConfigResolution> {
    const loadStarted = performance.now();
    let mark = loadStarted;
    const phaseMs = (label: string): void => {
      const now = performance.now();
      const delta = now - mark;
      mark = now;
      this.performanceDiagnosticsLogger.info(
        `load.${label} +${delta.toFixed(1)}ms (cumulative ${(now - loadStarted).toFixed(1)}ms)`,
      );
    };
    const bootstrapSource = await this.resolveConfigPath(args.consumerRoot, args.configPathOverride);
    phaseMs("resolveConfigPath");
    if (!bootstrapSource) {
      throw new Error(
        'Codemation config not found. Expected "codemation.config.ts" in the consumer project root or "src/".',
      );
    }
    const moduleExports = await this.importModule(bootstrapSource);
    phaseMs("importConfigModule");
    const rawConfig = this.configExportsResolver.resolveConfig(moduleExports);
    if (!rawConfig) {
      throw new Error(`Config file does not export a Codemation config object: ${bootstrapSource}`);
    }
    const config = this.configNormalizer.normalize(rawConfig);
    const workflowSources = await this.resolveWorkflowSources(args.consumerRoot, config);
    phaseMs("resolveWorkflowSources");
    const workflows = this.mergeWorkflows(
      config.workflows ?? [],
      await this.loadDiscoveredWorkflows(args.consumerRoot, config, workflowSources),
    );
    phaseMs("loadDiscoveredWorkflows");
    const resolvedConfig: NormalizedCodemationConfig = {
      ...config,
      workflows,
    };
    logLevelPolicyFactory.create().applyCodemationLogConfig(resolvedConfig.log);
    return {
      config: resolvedConfig,
      bootstrapSource,
      workflowSources,
    };
  }

  private async resolveConfigPath(
    consumerRoot: string,
    configPathOverride: string | undefined,
  ): Promise<string | null> {
    if (configPathOverride) {
      const explicitPath = path.isAbsolute(configPathOverride)
        ? configPathOverride
        : path.resolve(consumerRoot, configPathOverride);
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

  private async resolveWorkflowSources(consumerRoot: string, config: CodemationConfig): Promise<ReadonlyArray<string>> {
    if ((config.workflowDiscovery?.directories?.length ?? 0) === 0) {
      return [];
    }
    const discoveredPaths = await this.workflowModulePathFinder.discoverModulePaths({
      consumerRoot,
      workflowDirectories: config.workflowDiscovery?.directories,
      exists: (absolutePath) => this.exists(absolutePath),
    });
    return [...discoveredPaths].sort((left: string, right: string) => left.localeCompare(right));
  }

  private async loadDiscoveredWorkflows(
    consumerRoot: string,
    config: CodemationConfig,
    workflowSources: ReadonlyArray<string>,
  ): Promise<ReadonlyArray<WorkflowDefinition>> {
    const workflowDiscoveryDirectories = config.workflowDiscovery?.directories ?? [];
    const workflowsById = new Map<string, WorkflowDefinition>();
    const loadedWorkflowModules = await Promise.all(
      workflowSources.map(async (workflowSource: string) => ({
        workflowSource,
        segments: this.pathSegmentsComputer.compute({
          consumerRoot,
          workflowDiscoveryDirectories,
          absoluteWorkflowModulePath: workflowSource,
        }),
        moduleExports: await this.importModule(workflowSource),
      })),
    );
    for (const loadedWorkflowModule of loadedWorkflowModules) {
      for (const workflow of this.workflowDefinitionExportsResolver.resolve(loadedWorkflowModule.moduleExports)) {
        const enriched =
          loadedWorkflowModule.segments && loadedWorkflowModule.segments.length > 0
            ? ({ ...workflow, discoveryPathSegments: loadedWorkflowModule.segments } satisfies WorkflowDefinition)
            : workflow;
        workflowsById.set(workflow.id, enriched);
      }
    }
    if (workflowsById.size === 0 && workflowSources.length > 0) {
      throw new Error(this.discoveredWorkflowsEmptyMessageFactory.create(workflowSources));
    }
    return [...workflowsById.values()];
  }

  private mergeWorkflows(
    configuredWorkflows: ReadonlyArray<WorkflowDefinition>,
    discoveredWorkflows: ReadonlyArray<WorkflowDefinition>,
  ): ReadonlyArray<WorkflowDefinition> {
    const workflowsById = new Map<string, WorkflowDefinition>();
    for (const workflow of discoveredWorkflows) {
      workflowsById.set(workflow.id, workflow);
    }
    for (const workflow of configuredWorkflows) {
      workflowsById.set(workflow.id, workflow);
    }
    return [...workflowsById.values()];
  }

  private async importModule(modulePath: string): Promise<Record<string, unknown>> {
    if (this.shouldUseNativeRuntimeImport()) {
      return await this.importModuleWithNativeRuntime(modulePath);
    }
    const tsconfigPath = await this.resolveTsconfigPath(modulePath);
    if (this.shouldResetImporterBeforeImport()) {
      await this.resetImporter(tsconfigPath);
    }
    const importSpecifier = await this.createImportSpecifier(modulePath);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const importedModule = await (
          await this.getOrCreateImporter(tsconfigPath)
        ).import(importSpecifier, import.meta.url);
        return importedModule as Record<string, unknown>;
      } catch (error) {
        if (!this.isStoppedTransformServiceError(error) || attempt === 2) {
          throw error;
        }
        await this.resetImporter(tsconfigPath);
      }
    }
    throw new Error(`Failed to import consumer module after retries: ${modulePath}`);
  }

  private async importModuleWithNativeRuntime(modulePath: string): Promise<Record<string, unknown>> {
    const importedModule = await import(await this.createImportSpecifier(modulePath));
    return importedModule as Record<string, unknown>;
  }

  private async resolveTsconfigPath(modulePath: string): Promise<string | false> {
    const overridePath = process.env.CODEMATION_TSCONFIG_PATH;
    if (overridePath && (await this.exists(overridePath))) {
      return overridePath;
    }
    const discoveredPath = await this.findNearestTsconfig(modulePath);
    return discoveredPath ?? false;
  }

  private async getOrCreateImporter(tsconfigPath: string | false): Promise<NamespacedUnregister> {
    const cacheKey = tsconfigPath || "default";
    const existingImporter = CodemationConsumerConfigLoader.importerRegistrationsByTsconfig.get(cacheKey);
    if (existingImporter) {
      return existingImporter;
    }
    const { register } = await import(/* webpackIgnore: true */ this.resolveTsxImporterModuleSpecifier());
    const nextImporter = register({
      namespace: this.toNamespace(cacheKey),
      tsconfig: tsconfigPath,
    });
    CodemationConsumerConfigLoader.importerRegistrationsByTsconfig.set(cacheKey, nextImporter);
    return nextImporter;
  }

  private async resetImporter(tsconfigPath: string | false): Promise<void> {
    const cacheKey = tsconfigPath || "default";
    const existingImporter = CodemationConsumerConfigLoader.importerRegistrationsByTsconfig.get(cacheKey);
    if (!existingImporter) {
      return;
    }
    CodemationConsumerConfigLoader.importerRegistrationsByTsconfig.delete(cacheKey);
    await existingImporter.unregister().catch(() => null);
  }

  private toNamespace(cacheKey: string): string {
    return `codemation_consumer_${cacheKey.replace(/[^a-zA-Z0-9_-]+/g, "_")}`;
  }

  private resolveTsxImporterModuleSpecifier(): string {
    return ["tsx", "esm", "api"].join("/");
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

  private shouldUseNativeRuntimeImport(): boolean {
    return process.env.CODEMATION_TS_RUNTIME === "ts-node";
  }

  private shouldResetImporterBeforeImport(): boolean {
    return (process.env.CODEMATION_DEV_SERVER_TOKEN?.trim().length ?? 0) > 0;
  }

  private isStoppedTransformServiceError(error: unknown): boolean {
    return error instanceof Error && error.message.includes("The service is no longer running");
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
