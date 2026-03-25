import type {
  CurrentStateExecutionRequest,
  HttpMethod,
  Items,
  RunCurrentState,
  RunExecutionOptions,
  RunResult,
  RunStopCondition,
  WebhookInvocationMatch,
  WebhookRunResult,
  WebhookTriggerResolution,
  WorkflowDefinition,
  WorkflowRepository,
} from "../../../types";

import { Engine } from "../../api/Engine";

export class RunIntentService {
  constructor(
    private readonly engine: Engine,
    private readonly workflowRepository: WorkflowRepository,
  ) {}

  async startWorkflow(args: {
    workflow: WorkflowDefinition;
    startAt?: string;
    items: Items;
    parent?: CurrentStateExecutionRequest["parent"];
    executionOptions?: RunExecutionOptions;
    workflowSnapshot?: CurrentStateExecutionRequest["workflowSnapshot"];
    mutableState?: CurrentStateExecutionRequest["mutableState"];
    currentState?: RunCurrentState;
    stopCondition?: RunStopCondition;
    reset?: CurrentStateExecutionRequest["reset"];
  }): Promise<RunResult> {
    if (args.startAt && !args.currentState && !args.stopCondition && !args.reset) {
      return await this.engine.runWorkflow(
        args.workflow,
        args.startAt,
        args.items,
        args.parent,
        args.executionOptions,
        {
          workflowSnapshot: args.workflowSnapshot,
          mutableState: args.mutableState,
        },
      );
    }
    return await this.engine.runWorkflowFromState({
      workflow: args.workflow,
      items: args.items,
      parent: args.parent,
      executionOptions: args.executionOptions,
      workflowSnapshot: args.workflowSnapshot,
      mutableState: args.mutableState,
      currentState: args.currentState,
      stopCondition: args.stopCondition ?? { kind: "workflowCompleted" },
      reset: args.reset,
    });
  }

  async rerunFromNode(args: {
    workflow: WorkflowDefinition;
    nodeId: string;
    currentState: RunCurrentState;
    items?: Items;
    parent?: CurrentStateExecutionRequest["parent"];
    executionOptions?: RunExecutionOptions;
    workflowSnapshot?: CurrentStateExecutionRequest["workflowSnapshot"];
    mutableState?: CurrentStateExecutionRequest["mutableState"];
  }): Promise<RunResult> {
    if (args.items) {
      return await this.engine.runWorkflow(args.workflow, args.nodeId, args.items, args.parent, args.executionOptions, {
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

  resolveWebhookTrigger(args: { endpointPath: string; method: HttpMethod }): WebhookTriggerResolution {
    return this.engine.resolveWebhookTrigger(args);
  }

  async runMatchedWebhook(args: {
    endpointPath: string;
    method: HttpMethod;
    requestItem: Items[number];
  }): Promise<WebhookRunResult> {
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

  async runWebhookMatch(args: {
    match: WebhookInvocationMatch;
    requestItem: Items[number];
  }): Promise<WebhookRunResult> {
    const workflow = this.workflowRepository.get(args.match.workflowId);
    if (!workflow) {
      throw new Error(`Unknown workflowId: ${args.match.workflowId}`);
    }
    const scheduled = await this.engine.runWorkflow(workflow, args.match.nodeId, [args.requestItem], undefined, {
      localOnly: true,
      webhook: true,
    });
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
}
