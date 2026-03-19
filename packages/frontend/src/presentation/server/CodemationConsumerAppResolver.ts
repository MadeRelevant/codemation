import type { WorkflowDefinition } from "@codemation/core";
import type { CodemationConfig } from "../config/CodemationConfig";

export type CodemationConsumerApp = Readonly<{
  config: CodemationConfig;
  workflowSources: ReadonlyArray<string>;
}>;

export class CodemationConsumerAppResolver {
  resolve(
    args: Readonly<{
      configModule: Readonly<Record<string, unknown>>;
      workflowModules: ReadonlyArray<Readonly<Record<string, unknown>>>;
      workflowSourcePaths: ReadonlyArray<string>;
    }>,
  ): CodemationConsumerApp {
    const config = this.resolveConfig(args.configModule);
    if (!config) {
      throw new Error("Consumer app module does not export a Codemation config object.");
    }
    if (config.workflows !== undefined) {
      return {
        config,
        workflowSources: [],
      };
    }
    return {
      config: {
        ...config,
        workflows: this.resolveWorkflows(args.workflowModules, args.workflowSourcePaths),
      },
      workflowSources: args.workflowSourcePaths,
    };
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
      "runtime" in value ||
      "workflows" in value ||
      "workflowDiscovery" in value ||
      "bindings" in value ||
      "plugins" in value ||
      "bootHook" in value ||
      "slots" in value
    );
  }

  private resolveWorkflows(
    workflowModules: ReadonlyArray<Readonly<Record<string, unknown>>>,
    workflowSourcePaths: ReadonlyArray<string>,
  ): ReadonlyArray<WorkflowDefinition> {
    const workflowsById = new Map<string, WorkflowDefinition>();
    workflowModules.forEach((workflowModule: Readonly<Record<string, unknown>>, index: number) => {
      const workflowSourcePath = workflowSourcePaths[index] ?? `workflow-module-${index}`;
      const workflows = this.resolveWorkflowModuleExports(workflowModule, workflowSourcePath);
      workflows.forEach((workflow: WorkflowDefinition) => {
        workflowsById.set(workflow.id, workflow);
      });
    });
    return [...workflowsById.values()];
  }

  private resolveWorkflowModuleExports(
    moduleExports: Readonly<Record<string, unknown>>,
    workflowSourcePath: string,
  ): ReadonlyArray<WorkflowDefinition> {
    const workflows = Object.values(moduleExports).filter((value: unknown): value is WorkflowDefinition =>
      this.isWorkflowDefinition(value),
    );
    if (workflows.length === 0) {
      throw new Error(`Workflow module does not export a workflow definition: ${workflowSourcePath}`);
    }
    return workflows;
  }

  private isWorkflowDefinition(value: unknown): value is WorkflowDefinition {
    if (!value || typeof value !== "object") {
      return false;
    }
    return "edges" in value && "id" in value && "name" in value && "nodes" in value;
  }
}
