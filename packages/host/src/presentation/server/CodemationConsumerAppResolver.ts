import type { WorkflowDefinition } from "@codemation/core";
import type { CodemationConfig } from "../config/CodemationConfig";
import { CodemationConsumerConfigExportsResolver } from "./CodemationConsumerConfigExportsResolver";

export type CodemationConsumerApp = Readonly<{
  config: CodemationConfig;
  workflowSources: ReadonlyArray<string>;
}>;

export class CodemationConsumerAppResolver {
  private readonly configExportsResolver = new CodemationConsumerConfigExportsResolver();

  resolve(
    args: Readonly<{
      configModule: Readonly<Record<string, unknown>>;
      workflowModules: ReadonlyArray<Readonly<Record<string, unknown>>>;
      workflowSourcePaths: ReadonlyArray<string>;
      workflowDiscoveryPathSegmentsList?: ReadonlyArray<readonly string[]>;
    }>,
  ): CodemationConsumerApp {
    const config = this.configExportsResolver.resolveConfig(args.configModule);
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
        workflows: this.resolveWorkflows(args.workflowModules, args.workflowSourcePaths, args.workflowDiscoveryPathSegmentsList),
      },
      workflowSources: args.workflowSourcePaths,
    };
  }

  private resolveWorkflows(
    workflowModules: ReadonlyArray<Readonly<Record<string, unknown>>>,
    workflowSourcePaths: ReadonlyArray<string>,
    workflowDiscoveryPathSegmentsList: ReadonlyArray<readonly string[]> | undefined,
  ): ReadonlyArray<WorkflowDefinition> {
    const workflowsById = new Map<string, WorkflowDefinition>();
    workflowModules.forEach((workflowModule: Readonly<Record<string, unknown>>, index: number) => {
      const workflowSourcePath = workflowSourcePaths[index] ?? `workflow-module-${index}`;
      const pathSegments = workflowDiscoveryPathSegmentsList?.[index];
      const workflows = this.resolveWorkflowModuleExports(workflowModule, workflowSourcePath);
      workflows.forEach((workflow: WorkflowDefinition) => {
        const enriched =
          pathSegments && pathSegments.length > 0
            ? ({ ...workflow, discoveryPathSegments: pathSegments } satisfies WorkflowDefinition)
            : workflow;
        workflowsById.set(workflow.id, enriched);
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
