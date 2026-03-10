import { container as tsyringeContainer } from "@codemation/core";
import type { WorkflowDefinition } from "@codemation/core";
import { CodemationBootstrapFileResolver } from "./codemationBootstrapFileResolver";
import { CodemationBootHookRunner } from "./codemationBootHookRunner";
import type { CodemationBootstrapDiscoveryArgs, CodemationBootstrapResult, CodemationDiscoveredApplicationSetup } from "./codemationBootstrapTypes";
import { CodemationConfigObjectResolver } from "./codemationConfigObjectResolver";
import { CodemationConfigValidator } from "./codemationConfigValidator";
import { CodemationConsumerModuleLoader } from "./codemationConsumerModuleLoader";
import { CodemationModuleImporter } from "./codemationModuleImporter";
import { CodemationWorkflowDirectoryResolver } from "./codemationWorkflowDirectoryResolver";
import { CodemationWorkflowExportCollector } from "./codemationWorkflowExportCollector";
import { CodemationWorkflowFileCollector } from "./codemationWorkflowFileCollector";

export class CodemationBootstrapDiscovery {
  private readonly bootstrapFileResolver = new CodemationBootstrapFileResolver();
  private readonly workflowDirectoryResolver = new CodemationWorkflowDirectoryResolver();
  private readonly workflowFileCollector = new CodemationWorkflowFileCollector();
  private readonly moduleImporter = new CodemationModuleImporter();
  private readonly workflowExportCollector = new CodemationWorkflowExportCollector();
  private readonly configObjectResolver = new CodemationConfigObjectResolver();
  private readonly configValidator = new CodemationConfigValidator();
  private readonly consumerModuleLoader = new CodemationConsumerModuleLoader();
  private readonly bootHookRunner = new CodemationBootHookRunner();

  async discover(args: CodemationBootstrapDiscoveryArgs): Promise<CodemationDiscoveredApplicationSetup> {
    const container = tsyringeContainer.createChildContainer();
    const effectiveEnv = { ...process.env, ...(args.env ?? {}) };
    args.application.useContainer(container);
    const bootstrapSource = await this.bootstrapFileResolver.resolve({
      consumerRoot: args.consumerRoot,
      env: effectiveEnv,
      bootstrapPathOverride: args.bootstrapPathOverride,
    });
    const config = bootstrapSource ? await this.loadConfig(bootstrapSource) : null;
    const workflowDiscovery = await this.discoverWorkflows({
      consumerRoot: args.consumerRoot,
      env: effectiveEnv,
      workflowsDirectoryOverride: args.workflowsDirectoryOverride,
      config,
    });
    args.application.useWorkflows([...workflowDiscovery.workflows]);
    if (bootstrapSource) {
      if (!config) throw new Error(`Bootstrap file does not export a Codemation config object: ${bootstrapSource}`);
      this.applyResult({
        application: args.application,
        result: config,
        discoveredWorkflows: workflowDiscovery.workflows,
        env: effectiveEnv,
      });
      await this.consumerModuleLoader.load({
        container,
        consumerRoot: args.consumerRoot,
        workflowSources: workflowDiscovery.sources,
        bootstrapSource,
        consumerModuleRoots: config.discovery?.consumerModuleRoots,
      });
      await this.bootHookRunner.run({
        bootHookToken: config.bootHook,
        container,
        context: {
          application: args.application,
          container,
          consumerRoot: args.consumerRoot,
          repoRoot: args.repoRoot,
          env: effectiveEnv,
          discoveredWorkflows: workflowDiscovery.workflows,
          workflowSources: workflowDiscovery.sources,
        },
      });
    } else {
      await this.consumerModuleLoader.load({
        container,
        consumerRoot: args.consumerRoot,
        workflowSources: workflowDiscovery.sources,
        bootstrapSource,
      });
    }
    return {
      application: args.application,
      bootstrapSource,
      workflowSources: workflowDiscovery.sources,
    };
  }

  private async loadConfig(bootstrapSource: string): Promise<CodemationBootstrapResult | null> {
    const bootstrapModule = await this.moduleImporter.importModule(bootstrapSource);
    return this.configObjectResolver.resolve(bootstrapModule);
  }

  private async discoverWorkflows(args: Readonly<{
    consumerRoot: string;
    env: Readonly<Record<string, string | undefined>>;
    workflowsDirectoryOverride?: string;
    config: CodemationBootstrapResult | null;
  }>): Promise<
    Readonly<{ workflows: ReadonlyArray<WorkflowDefinition>; sources: ReadonlyArray<string> }>
  > {
    if (args.config?.discovery?.workflowSource === "config-only") {
      return { workflows: [], sources: [] };
    }
    const workflowsDirectory = await this.workflowDirectoryResolver.resolve(args);
    if (!workflowsDirectory) return { workflows: [], sources: [] };
    const workflowFiles = await this.workflowFileCollector.collect(workflowsDirectory);
    const workflows: WorkflowDefinition[] = [];
    for (const workflowFile of workflowFiles) {
      const moduleExports = await this.moduleImporter.importModule(workflowFile);
      workflows.push(...this.workflowExportCollector.collect(moduleExports));
    }
    return {
      workflows,
      sources: workflowFiles,
    };
  }

  private applyResult(args: Readonly<{
    application: CodemationBootstrapDiscoveryArgs["application"];
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
