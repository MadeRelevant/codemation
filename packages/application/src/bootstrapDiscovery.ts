import type { Container, CredentialService, WorkflowDefinition } from "@codemation/core";
import { SimpleContainerFactory } from "@codemation/core";
import { access, readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { CodemationApplication, CodemationApplicationRuntimeConfig } from "./codemationApplication";

export interface CodemationBootstrapContext {
  readonly application: CodemationApplication;
  readonly container: Container;
  readonly consumerRoot: string;
  readonly repoRoot: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly discoveredWorkflows: ReadonlyArray<WorkflowDefinition>;
  readonly workflowSources: ReadonlyArray<string>;
}

export interface CodemationBootstrapResult {
  readonly credentials?: CredentialService;
  readonly runtime?: CodemationApplicationRuntimeConfig;
  readonly workflows?: ReadonlyArray<WorkflowDefinition>;
  readonly workflowMode?: "augment" | "replace";
}

export interface CodemationConfig extends CodemationBootstrapResult {}

export class CodemationConfigFactory {
  static define<TConfig extends CodemationConfig>(config: TConfig): TConfig {
    return config;
  }
}

export type CodemationBootstrap =
  | ((context: CodemationBootstrapContext) => void | CodemationBootstrapResult | Promise<void | CodemationBootstrapResult>)
  | Readonly<{ bootstrap: (context: CodemationBootstrapContext) => void | CodemationBootstrapResult | Promise<void | CodemationBootstrapResult> }>;

export interface CodemationBootstrapDiscoveryArgs {
  readonly application: CodemationApplication;
  readonly consumerRoot: string;
  readonly repoRoot: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly bootstrapPathOverride?: string;
  readonly workflowsDirectoryOverride?: string;
}

export interface CodemationDiscoveredApplicationSetup {
  readonly application: CodemationApplication;
  readonly bootstrapSource: string | null;
  readonly workflowSources: ReadonlyArray<string>;
}

class CodemationFileExistenceChecker {
  async exists(filePath: string): Promise<boolean> {
    try {
      await access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}

class CodemationBootstrapFileResolver {
  private readonly fileExistenceChecker = new CodemationFileExistenceChecker();

  async resolve(args: Readonly<{ consumerRoot: string; env?: Readonly<Record<string, string | undefined>>; bootstrapPathOverride?: string }>): Promise<string | null> {
    const explicitPath = args.bootstrapPathOverride ?? args.env?.CODEMATION_BOOTSTRAP_FILE;
    if (explicitPath) return await this.resolveExplicitPath(args.consumerRoot, explicitPath);

    for (const candidate of this.getConventionCandidates(args.consumerRoot)) {
      // eslint-disable-next-line no-await-in-loop
      if (await this.fileExistenceChecker.exists(candidate)) return candidate;
    }
    return null;
  }

  private async resolveExplicitPath(consumerRoot: string, explicitPath: string): Promise<string> {
    const resolvedPath = path.isAbsolute(explicitPath) ? explicitPath : path.resolve(consumerRoot, explicitPath);
    if (await this.fileExistenceChecker.exists(resolvedPath)) return resolvedPath;
    throw new Error(`Bootstrap file not found: ${resolvedPath}`);
  }

  private getConventionCandidates(consumerRoot: string): ReadonlyArray<string> {
    return [
      path.resolve(consumerRoot, "codemation.config.ts"),
      path.resolve(consumerRoot, "codemation.config.js"),
      path.resolve(consumerRoot, "src", "codemation.config.ts"),
      path.resolve(consumerRoot, "src", "codemation.config.js"),
    ];
  }
}

class CodemationWorkflowDirectoryResolver {
  private readonly fileExistenceChecker = new CodemationFileExistenceChecker();

  async resolve(args: Readonly<{ consumerRoot: string; env?: Readonly<Record<string, string | undefined>>; workflowsDirectoryOverride?: string }>): Promise<string | null> {
    const explicitDirectory = args.workflowsDirectoryOverride ?? args.env?.CODEMATION_WORKFLOWS_DIR;
    if (explicitDirectory) return await this.resolveExplicitDirectory(args.consumerRoot, explicitDirectory);

    for (const candidate of this.getConventionCandidates(args.consumerRoot)) {
      // eslint-disable-next-line no-await-in-loop
      if (await this.fileExistenceChecker.exists(candidate)) return candidate;
    }
    return null;
  }

  private async resolveExplicitDirectory(consumerRoot: string, explicitDirectory: string): Promise<string> {
    const resolvedDirectory = path.isAbsolute(explicitDirectory) ? explicitDirectory : path.resolve(consumerRoot, explicitDirectory);
    if (await this.fileExistenceChecker.exists(resolvedDirectory)) return resolvedDirectory;
    throw new Error(`Workflow directory not found: ${resolvedDirectory}`);
  }

  private getConventionCandidates(consumerRoot: string): ReadonlyArray<string> {
    return [
      path.resolve(consumerRoot, "src", "workflows"),
      path.resolve(consumerRoot, "workflows"),
    ];
  }
}

class CodemationWorkflowFileCollector {
  async collect(workflowsDirectory: string): Promise<ReadonlyArray<string>> {
    const files = await this.collectRecursive(workflowsDirectory);
    const supportedFiles = files.filter((filePath) => this.isSupportedWorkflowFile(filePath));
    const nonIndexFiles = supportedFiles.filter((filePath) => !this.isIndexFile(filePath));
    return nonIndexFiles.length > 0 ? nonIndexFiles : supportedFiles;
  }

  private async collectRecursive(targetDirectory: string): Promise<ReadonlyArray<string>> {
    const entries = await readdir(targetDirectory, { withFileTypes: true });
    const collected: string[] = [];

    for (const entry of entries) {
      const entryPath = path.resolve(targetDirectory, entry.name);
      if (entry.isDirectory()) {
        // eslint-disable-next-line no-await-in-loop
        const nestedFiles = await this.collectRecursive(entryPath);
        collected.push(...nestedFiles);
        continue;
      }
      collected.push(entryPath);
    }

    return collected;
  }

  private isSupportedWorkflowFile(filePath: string): boolean {
    if (filePath.endsWith(".d.ts")) return false;
    return [".ts", ".tsx", ".js", ".mjs", ".mts"].some((extension) => filePath.endsWith(extension));
  }

  private isIndexFile(filePath: string): boolean {
    const parsed = path.parse(filePath);
    return parsed.name === "index";
  }
}

class CodemationModuleImporter {
  async importModule(modulePath: string): Promise<Record<string, unknown>> {
    const importedModule = await import(pathToFileURL(modulePath).href);
    return importedModule as Record<string, unknown>;
  }
}

class CodemationWorkflowExportCollector {
  collect(moduleExports: Readonly<Record<string, unknown>>): ReadonlyArray<WorkflowDefinition> {
    const workflows: WorkflowDefinition[] = [];

    for (const exportedValue of Object.values(moduleExports)) {
      workflows.push(...this.collectFromValue(exportedValue));
    }

    return this.dedupe(workflows);
  }

  private collectFromValue(value: unknown): ReadonlyArray<WorkflowDefinition> {
    if (this.isWorkflowDefinition(value)) return [value];
    if (Array.isArray(value)) return value.filter((entry): entry is WorkflowDefinition => this.isWorkflowDefinition(entry));
    return [];
  }

  private isWorkflowDefinition(value: unknown): value is WorkflowDefinition {
    if (!value || typeof value !== "object") return false;
    const candidate = value as Partial<WorkflowDefinition>;
    return typeof candidate.id === "string" && typeof candidate.name === "string" && Array.isArray(candidate.nodes) && Array.isArray(candidate.edges);
  }

  private dedupe(workflows: ReadonlyArray<WorkflowDefinition>): ReadonlyArray<WorkflowDefinition> {
    const uniqueById = new Map<string, WorkflowDefinition>();
    for (const workflow of workflows) uniqueById.set(workflow.id, workflow);
    return [...uniqueById.values()];
  }
}

class CodemationBootstrapFunctionResolver {
  resolve(moduleExports: Readonly<Record<string, unknown>>): ((context: CodemationBootstrapContext) => void | CodemationBootstrapResult | Promise<void | CodemationBootstrapResult>) | null {
    const defaultExport = moduleExports.default;
    if (typeof defaultExport === "function") return defaultExport as (context: CodemationBootstrapContext) => void | CodemationBootstrapResult | Promise<void | CodemationBootstrapResult>;
    if (defaultExport && typeof defaultExport === "object" && typeof (defaultExport as { bootstrap?: unknown }).bootstrap === "function") {
      return (defaultExport as { bootstrap: (context: CodemationBootstrapContext) => void | CodemationBootstrapResult | Promise<void | CodemationBootstrapResult> }).bootstrap;
    }

    const namedBootstrap = moduleExports.bootstrap;
    if (typeof namedBootstrap === "function") {
      return namedBootstrap as (context: CodemationBootstrapContext) => void | CodemationBootstrapResult | Promise<void | CodemationBootstrapResult>;
    }

    return null;
  }
}

class CodemationConfigObjectResolver {
  resolve(moduleExports: Readonly<Record<string, unknown>>): CodemationConfig | null {
    const defaultExport = moduleExports.default;
    if (this.isConfigObject(defaultExport)) return defaultExport;

    const namedConfig = moduleExports.config;
    if (this.isConfigObject(namedConfig)) return namedConfig;

    return null;
  }

  private isConfigObject(value: unknown): value is CodemationConfig {
    if (!value || typeof value !== "object") return false;
    if ("bootstrap" in value && typeof (value as { bootstrap?: unknown }).bootstrap === "function") return false;
    return "credentials" in value || "runtime" in value || "workflows" in value || "workflowMode" in value;
  }
}

class CodemationConfigValidator {
  validate(config: CodemationConfig, env: Readonly<Record<string, string | undefined>>): void {
    this.validatePort("frontendPort", config.runtime?.frontendPort);
    this.validatePort("serverPort", config.runtime?.serverPort);

    if (config.runtime?.realtimeMode === "redis" && !(config.runtime.redisUrl ?? env.REDIS_URL)) {
      throw new Error("Redis realtime mode requires runtime.redisUrl or REDIS_URL");
    }
  }

  private validatePort(field: "frontendPort" | "serverPort", value: number | undefined): void {
    if (value === undefined) return;
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error(`Invalid runtime.${field}: expected a positive integer`);
    }
  }
}

export class CodemationBootstrapDiscovery {
  private readonly bootstrapFileResolver = new CodemationBootstrapFileResolver();
  private readonly workflowDirectoryResolver = new CodemationWorkflowDirectoryResolver();
  private readonly workflowFileCollector = new CodemationWorkflowFileCollector();
  private readonly moduleImporter = new CodemationModuleImporter();
  private readonly workflowExportCollector = new CodemationWorkflowExportCollector();
  private readonly bootstrapFunctionResolver = new CodemationBootstrapFunctionResolver();
  private readonly configObjectResolver = new CodemationConfigObjectResolver();
  private readonly configValidator = new CodemationConfigValidator();

  async discover(args: CodemationBootstrapDiscoveryArgs): Promise<CodemationDiscoveredApplicationSetup> {
    const container = SimpleContainerFactory.create();
    const effectiveEnv = { ...process.env, ...(args.env ?? {}) };

    args.application.useContainer(container);

    const workflowDiscovery = await this.discoverWorkflows({
      consumerRoot: args.consumerRoot,
      env: effectiveEnv,
      workflowsDirectoryOverride: args.workflowsDirectoryOverride,
    });
    args.application.useWorkflows([...workflowDiscovery.workflows]);

    const bootstrapSource = await this.bootstrapFileResolver.resolve({
      consumerRoot: args.consumerRoot,
      env: effectiveEnv,
      bootstrapPathOverride: args.bootstrapPathOverride,
    });
    if (bootstrapSource) {
      const bootstrapModule = await this.moduleImporter.importModule(bootstrapSource);
      const config = this.configObjectResolver.resolve(bootstrapModule);
      const bootstrap = this.bootstrapFunctionResolver.resolve(bootstrapModule);
      if (config && bootstrap) {
        throw new Error(`Bootstrap file cannot export both a config object and a bootstrap function: ${bootstrapSource}`);
      }

      if (config) {
        this.applyResult({
          application: args.application,
          result: config,
          discoveredWorkflows: workflowDiscovery.workflows,
          env: effectiveEnv,
        });
      } else {
        if (!bootstrap) throw new Error(`Bootstrap file does not export a config object or bootstrap function: ${bootstrapSource}`);

        const result =
          (await bootstrap({
            application: args.application,
            container,
            consumerRoot: args.consumerRoot,
            repoRoot: args.repoRoot,
            env: effectiveEnv,
            discoveredWorkflows: workflowDiscovery.workflows,
            workflowSources: workflowDiscovery.sources,
          })) ?? undefined;

        if (result) {
          this.applyResult({
            application: args.application,
            result,
            discoveredWorkflows: workflowDiscovery.workflows,
            env: effectiveEnv,
          });
        }
      }
    }

    return {
      application: args.application,
      bootstrapSource,
      workflowSources: workflowDiscovery.sources,
    };
  }

  private async discoverWorkflows(args: Readonly<{ consumerRoot: string; env: Readonly<Record<string, string | undefined>>; workflowsDirectoryOverride?: string }>): Promise<
    Readonly<{ workflows: ReadonlyArray<WorkflowDefinition>; sources: ReadonlyArray<string> }>
  > {
    const workflowsDirectory = await this.workflowDirectoryResolver.resolve(args);
    if (!workflowsDirectory) return { workflows: [], sources: [] };

    const workflowFiles = await this.workflowFileCollector.collect(workflowsDirectory);
    const workflows: WorkflowDefinition[] = [];

    for (const workflowFile of workflowFiles) {
      // eslint-disable-next-line no-await-in-loop
      const moduleExports = await this.moduleImporter.importModule(workflowFile);
      workflows.push(...this.workflowExportCollector.collect(moduleExports));
    }

    return {
      workflows,
      sources: workflowFiles,
    };
  }

  private applyResult(args: Readonly<{
    application: CodemationApplication;
    result: CodemationBootstrapResult;
    discoveredWorkflows: ReadonlyArray<WorkflowDefinition>;
    env: Readonly<Record<string, string | undefined>>;
  }>): void {
    this.configValidator.validate(args.result, args.env);
    if (args.result.credentials) args.application.useCredentials(args.result.credentials);
    if (args.result.runtime) args.application.useRuntimeConfig(args.result.runtime);
    if (args.result.workflows) {
      args.application.useWorkflows(
        args.result.workflowMode === "replace" ? [...args.result.workflows] : [...args.discoveredWorkflows, ...args.result.workflows],
      );
    }
  }
}
