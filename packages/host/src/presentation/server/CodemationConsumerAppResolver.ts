import type { WorkflowDefinition } from "@codemation/core";
import type { CodemationConfig } from "../config/CodemationConfig";
import { CodemationConfigNormalizer } from "../config/CodemationConfigNormalizer";
import { CodemationConsumerConfigExportsResolver } from "./CodemationConsumerConfigExportsResolver";
import { DiscoveredWorkflowsEmptyMessageFactory } from "./DiscoveredWorkflowsEmptyMessageFactory";
import { WorkflowDefinitionExportsResolver } from "./WorkflowDefinitionExportsResolver";

export type CodemationConsumerApp = Readonly<{
  config: CodemationConfig;
  workflowSources: ReadonlyArray<string>;
}>;

export class CodemationConsumerAppResolver {
  private readonly configExportsResolver = new CodemationConsumerConfigExportsResolver();
  private readonly configNormalizer = new CodemationConfigNormalizer();
  private readonly workflowDefinitionExportsResolver = new WorkflowDefinitionExportsResolver();
  private readonly discoveredWorkflowsEmptyMessageFactory = new DiscoveredWorkflowsEmptyMessageFactory();

  resolve(
    args: Readonly<{
      configModule: Readonly<Record<string, unknown>>;
      workflowModules: ReadonlyArray<Readonly<Record<string, unknown>>>;
      workflowSourcePaths: ReadonlyArray<string>;
      workflowDiscoveryPathSegmentsList?: ReadonlyArray<readonly string[]>;
    }>,
  ): CodemationConsumerApp {
    const rawConfig = this.configExportsResolver.resolveConfig(args.configModule);
    if (!rawConfig) {
      throw new Error("Consumer app module does not export a Codemation config object.");
    }
    const config = this.configNormalizer.normalize(rawConfig);
    const discoveredWorkflows = this.resolveDiscoveredWorkflows(
      args.workflowModules,
      args.workflowSourcePaths,
      args.workflowDiscoveryPathSegmentsList,
    );
    return {
      config: {
        ...config,
        workflows: this.mergeWorkflows(config.workflows ?? [], discoveredWorkflows),
      },
      workflowSources: args.workflowSourcePaths,
    };
  }

  private resolveDiscoveredWorkflows(
    workflowModules: ReadonlyArray<Readonly<Record<string, unknown>>>,
    workflowSourcePaths: ReadonlyArray<string>,
    workflowDiscoveryPathSegmentsList: ReadonlyArray<readonly string[]> | undefined,
  ): ReadonlyArray<WorkflowDefinition> {
    const workflowsById = new Map<string, WorkflowDefinition>();
    workflowModules.forEach((workflowModule: Readonly<Record<string, unknown>>, index: number) => {
      const pathSegments = workflowDiscoveryPathSegmentsList?.[index];
      const workflows = this.workflowDefinitionExportsResolver.resolve(workflowModule);
      workflows.forEach((workflow: WorkflowDefinition) => {
        const enriched =
          pathSegments && pathSegments.length > 0
            ? ({ ...workflow, discoveryPathSegments: pathSegments } satisfies WorkflowDefinition)
            : workflow;
        workflowsById.set(workflow.id, enriched);
      });
    });
    if (workflowsById.size === 0 && workflowSourcePaths.length > 0) {
      throw new Error(this.discoveredWorkflowsEmptyMessageFactory.create(workflowSourcePaths));
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
}
