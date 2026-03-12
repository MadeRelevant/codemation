import { container as tsyringeContainer } from "@codemation/core";
import type { WorkflowDefinition } from "@codemation/core";
import { CodemationBootstrapFileResolver } from "./codemationBootstrapFileResolver";
import { CodemationBootHookRunner } from "./codemationBootHookRunner";
import type { CodemationBootstrapDiscoveryArgs, CodemationBootstrapResult, CodemationDiscoveredApplicationSetup } from "./codemationBootstrapTypes";
import { CodemationConfigObjectResolver } from "./codemationConfigObjectResolver";
import { CodemationConfigValidator } from "./codemationConfigValidator";
import { CodemationModuleImporter } from "./codemationModuleImporter";

export class CodemationBootstrapDiscovery {
  private readonly bootstrapFileResolver = new CodemationBootstrapFileResolver();
  private readonly moduleImporter = new CodemationModuleImporter();
  private readonly configObjectResolver = new CodemationConfigObjectResolver();
  private readonly configValidator = new CodemationConfigValidator();
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
    const config = await this.resolveConfig(args.configOverride, bootstrapSource);
    const workflows = this.resolveConfiguredWorkflows(config);
    const workflowSources = this.resolveWorkflowSources(bootstrapSource, args.configOverride, workflows);
    this.applyResult({
      application: args.application,
      result: config,
      env: effectiveEnv,
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
        discoveredWorkflows: workflows,
        workflowSources,
      },
    });
    return {
      application: args.application,
      bootstrapSource,
      workflowSources,
    };
  }

  private async loadConfig(bootstrapSource: string): Promise<CodemationBootstrapResult | null> {
    const bootstrapModule = await this.moduleImporter.importModule(bootstrapSource);
    return this.configObjectResolver.resolve(bootstrapModule);
  }

  private async resolveConfig(
    configOverride: CodemationBootstrapResult | undefined,
    bootstrapSource: string | null,
  ): Promise<CodemationBootstrapResult> {
    if (configOverride) {
      return configOverride;
    }
    if (!bootstrapSource) {
      throw new Error('Codemation config not found. Expected "codemation.config.ts" in the consumer project root or "src/".');
    }
    const resolvedConfig = await this.loadConfig(bootstrapSource);
    if (!resolvedConfig) {
      throw new Error(`Bootstrap file does not export a Codemation config object: ${bootstrapSource}`);
    }
    return resolvedConfig;
  }

  private applyResult(args: Readonly<{
    application: CodemationBootstrapDiscoveryArgs["application"];
    result: CodemationBootstrapResult;
    env: Readonly<Record<string, string | undefined>>;
  }>): void {
    this.configValidator.validate(args.result, args.env);
    if (args.result.credentials) args.application.useCredentials(args.result.credentials);
    if (args.result.runtime) args.application.useRuntimeConfig(args.result.runtime);
    if (args.result.workflows) {
      args.application.useWorkflows([...args.result.workflows]);
    }
  }

  private resolveConfiguredWorkflows(config: CodemationBootstrapResult): ReadonlyArray<WorkflowDefinition> {
    return [...(config.workflows ?? [])];
  }

  private resolveWorkflowSources(
    bootstrapSource: string | null,
    configOverride: CodemationBootstrapResult | undefined,
    workflows: ReadonlyArray<WorkflowDefinition>,
  ): ReadonlyArray<string> {
    if (bootstrapSource) {
      return [bootstrapSource];
    }
    if (configOverride && workflows.length > 0) {
      return ["<config-override>"];
    }
    return [];
  }
}
