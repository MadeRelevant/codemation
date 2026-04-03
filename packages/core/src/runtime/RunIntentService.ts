import type {
  CurrentStateExecutionRequest,
  HttpMethod,
  Items,
  NodeId,
  RunCurrentState,
  RunExecutionOptions,
  RunResult,
  RunStopCondition,
  WebhookInvocationMatch,
  WebhookRunResult,
  WebhookTriggerResolution,
  WorkflowDefinition,
  WorkflowRepository,
} from "../types";

import { Engine } from "../orchestration/Engine";

export type StartWorkflowIntent = {
  workflow: WorkflowDefinition;
  startAt?: string;
  items: Items;
  synthesizeTriggerItems?: boolean;
  parent?: CurrentStateExecutionRequest["parent"];
  executionOptions?: RunExecutionOptions;
  workflowSnapshot?: CurrentStateExecutionRequest["workflowSnapshot"];
  mutableState?: CurrentStateExecutionRequest["mutableState"];
  currentState?: RunCurrentState;
  stopCondition?: RunStopCondition;
  reset?: CurrentStateExecutionRequest["reset"];
};

export type RerunFromNodeIntent = {
  workflow: WorkflowDefinition;
  nodeId: NodeId;
  currentState: RunCurrentState;
  items?: Items;
  synthesizeTriggerItems?: boolean;
  parent?: CurrentStateExecutionRequest["parent"];
  executionOptions?: RunExecutionOptions;
  workflowSnapshot?: CurrentStateExecutionRequest["workflowSnapshot"];
  mutableState?: CurrentStateExecutionRequest["mutableState"];
};

export type MatchedWebhookRunIntent = {
  endpointPath: string;
  method: HttpMethod;
  requestItem: Items[number];
};

export type WebhookMatchRunIntent = {
  match: WebhookInvocationMatch;
  requestItem: Items[number];
};

export class RunIntentService {
  constructor(
    private readonly engine: Engine,
    private readonly workflowRepository: WorkflowRepository,
  ) {}

  async startWorkflow(args: StartWorkflowIntent): Promise<RunResult> {
    const items = await this.resolveStartWorkflowItems(args);
    if (args.startAt && !args.currentState && !args.stopCondition && !args.reset) {
      return await this.engine.runWorkflow(args.workflow, args.startAt, items, args.parent, args.executionOptions, {
        workflowSnapshot: args.workflowSnapshot,
        mutableState: args.mutableState,
      });
    }
    return await this.engine.runWorkflowFromState({
      workflow: args.workflow,
      items,
      parent: args.parent,
      executionOptions: args.executionOptions,
      workflowSnapshot: args.workflowSnapshot,
      mutableState: args.mutableState,
      currentState: args.currentState,
      stopCondition: args.stopCondition ?? { kind: "workflowCompleted" },
      reset: args.reset,
    });
  }

  async rerunFromNode(args: RerunFromNodeIntent): Promise<RunResult> {
    const items = await this.resolveRerunItems(args);
    if (items) {
      return await this.engine.runWorkflow(args.workflow, args.nodeId, items, args.parent, args.executionOptions, {
        workflowSnapshot: args.workflowSnapshot,
        mutableState: args.mutableState,
      });
    }
    return await this.engine.runWorkflowFromState({
      workflow: args.workflow,
      parent: args.parent,
      executionOptions: args.executionOptions,
      workflowSnapshot: args.workflowSnapshot,
      mutableState: args.mutableState,
      currentState: args.currentState,
      stopCondition: { kind: "workflowCompleted" },
      reset: { clearFromNodeId: args.nodeId },
    });
  }

  private async resolveStartWorkflowItems(args: StartWorkflowIntent): Promise<Items> {
    if (this.hasNonEmptyItems(args.items)) {
      return args.items;
    }
    const triggerNodeId = this.resolveStartWorkflowTriggerNodeId(args);
    if (!triggerNodeId) {
      return args.items;
    }
    return (await this.engine.createTriggerTestItems({ workflow: args.workflow, nodeId: triggerNodeId })) ?? args.items;
  }

  private async resolveRerunItems(args: RerunFromNodeIntent): Promise<Items | undefined> {
    if (this.hasNonEmptyItems(args.items)) {
      return args.items;
    }
    const triggerNodeId = this.resolveRerunTriggerNodeId(args);
    if (!triggerNodeId) {
      return args.items;
    }
    return (await this.engine.createTriggerTestItems({ workflow: args.workflow, nodeId: triggerNodeId })) ?? args.items;
  }

  private resolveStartWorkflowTriggerNodeId(args: StartWorkflowIntent): NodeId | undefined {
    if (args.stopCondition?.kind === "nodeCompleted" && this.isTriggerNode(args.workflow, args.stopCondition.nodeId)) {
      return args.stopCondition.nodeId;
    }
    if (!args.synthesizeTriggerItems) {
      return undefined;
    }
    if (args.startAt && this.isTriggerNode(args.workflow, args.startAt)) {
      return args.startAt;
    }
    return this.firstTriggerNodeId(args.workflow);
  }

  private resolveRerunTriggerNodeId(args: RerunFromNodeIntent): NodeId | undefined {
    if (this.isTriggerNode(args.workflow, args.nodeId)) {
      return args.nodeId;
    }
    if (!args.synthesizeTriggerItems) {
      return undefined;
    }
    return this.firstTriggerNodeId(args.workflow);
  }

  private firstTriggerNodeId(workflow: WorkflowDefinition): NodeId | undefined {
    return workflow.nodes.find((node) => node.kind === "trigger")?.id;
  }

  private isTriggerNode(workflow: WorkflowDefinition, nodeId: string): boolean {
    return workflow.nodes.find((node) => node.id === nodeId)?.kind === "trigger";
  }

  private hasNonEmptyItems(items: Items | undefined): boolean {
    return (items?.length ?? 0) > 0;
  }

  resolveWebhookTrigger(args: { endpointPath: string; method: HttpMethod }): WebhookTriggerResolution {
    return this.engine.resolveWebhookTrigger(args);
  }

  async runMatchedWebhook(args: MatchedWebhookRunIntent): Promise<WebhookRunResult> {
    const resolution = this.resolveWebhookTrigger(args);
    if (resolution.status === "notFound") {
      throw new Error("Unknown webhook endpoint");
    }
    if (resolution.status === "methodNotAllowed") {
      throw new Error("Method not allowed");
    }
    return await this.runWebhookMatch({
      match: resolution.match,
      requestItem: args.requestItem,
    });
  }

  async runWebhookMatch(args: WebhookMatchRunIntent): Promise<WebhookRunResult> {
    const workflow = this.workflowRepository.get(args.match.workflowId);
    if (!workflow) {
      throw new Error(`Unknown workflowId: ${args.match.workflowId}`);
    }
    const scheduled = await this.engine.runWorkflow(
      workflow,
      args.match.nodeId,
      [args.requestItem],
      undefined,
      this.createWebhookExecutionOptions(),
    );
    if (scheduled.status === "failed") {
      throw new Error(scheduled.error.message);
    }
    if (scheduled.status === "completed") {
      return {
        runId: scheduled.runId,
        workflowId: scheduled.workflowId,
        startedAt: scheduled.startedAt,
        runStatus: "completed",
        response: scheduled.outputs,
      };
    }
    return await Promise.race([
      this.engine.waitForWebhookResponse(scheduled.runId),
      this.engine.waitForCompletion(scheduled.runId).then((completed) => {
        if (completed.status === "failed") {
          throw new Error(completed.error.message);
        }
        return {
          runId: completed.runId,
          workflowId: completed.workflowId,
          startedAt: completed.startedAt,
          runStatus: "completed" as const,
          response: completed.outputs,
        } satisfies WebhookRunResult;
      }),
    ]);
  }

  /**
   * Webhook-triggered runs always force inline execution first.
   * This is the highest-precedence scheduler override: it wins over node hints and container defaults.
   */
  private createWebhookExecutionOptions(): RunExecutionOptions {
    return {
      localOnly: true,
      webhook: true,
    };
  }
}
