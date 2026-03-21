import { type WorkflowDefinition } from "@codemation/core";
import { createWorkflowBuilder,ManualTrigger,MapData } from "@codemation/core-nodes";
import type { WorkflowDto } from "@codemation/next-host/src/features/workflows/realtime/realtime";
import { WorkflowDefinitionMapper } from "../../../src/application/mapping/WorkflowDefinitionMapper";
import type { CodemationConfig } from "../../../src/presentation/config/CodemationConfig";
import { IntegrationTestAuth } from "../../http/testkit/IntegrationTestAuth";

export interface WorkflowDetailRuntimeFixture {
  readonly workflow: WorkflowDto;
  readonly definition: WorkflowDefinition;
  readonly config: CodemationConfig;
  readonly workflowId: string;
  readonly nodeIds: ReadonlyArray<string>;
}

export class WorkflowDetailRuntimeFixtureFactory {
  static createLinearWorkflow(args: Readonly<{ workflowId?: string; workflowName?: string; nodeIds: ReadonlyArray<string> }>): WorkflowDetailRuntimeFixture {
    const workflowId = args.workflowId ?? "wf.frontend.runtime";
    const workflowName = args.workflowName ?? "Workflow detail runtime fixture";
    if (args.nodeIds.length < 2) {
      throw new Error("WorkflowDetailRuntimeFixtureFactory.createLinearWorkflow() requires at least a trigger node and one downstream node.");
    }
    const definition = this.createWorkflowDefinition(workflowId, workflowName, args.nodeIds);
    return {
      workflow: new WorkflowDefinitionMapper().mapSync(definition) as WorkflowDto,
      definition,
      config: this.createConfig(definition),
      workflowId,
      nodeIds: [...args.nodeIds],
    };
  }

  private static createWorkflowDefinition(workflowId: string, workflowName: string, nodeIds: ReadonlyArray<string>): WorkflowDefinition {
    let builder = createWorkflowBuilder({
      id: workflowId,
      name: workflowName,
    }).trigger(new ManualTrigger(nodeIds[0] ?? "Trigger", [{ json: {} }], nodeIds[0] ?? "Trigger"));
    for (const [index, nodeId] of nodeIds.slice(1).entries()) {
      builder = builder.then(new MapData(nodeId, (item) => this.createNodeOutput(item.json, nodeId, index + 1), nodeId));
    }
    return builder.build();
  }

  private static createConfig(definition: WorkflowDefinition): CodemationConfig {
    return {
      workflows: [definition],
      runtime: {
        eventBus: {
          kind: "memory",
        },
        scheduler: {
          kind: "local",
        },
      },
      auth: IntegrationTestAuth.developmentBypass,
    };
  }

  private static createNodeOutput(value: unknown, nodeId: string, step: number): Readonly<Record<string, unknown>> {
    const recordValue = this.asRecord(value);
    const previousPath = this.asPath(recordValue.path);
    return {
      ...recordValue,
      currentNode: nodeId,
      path: [...previousPath, nodeId],
      step,
    };
  }

  private static asRecord(value: unknown): Readonly<Record<string, unknown>> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }
    return value as Readonly<Record<string, unknown>>;
  }

  private static asPath(value: unknown): ReadonlyArray<string> {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.filter((entry): entry is string => typeof entry === "string");
  }
}
