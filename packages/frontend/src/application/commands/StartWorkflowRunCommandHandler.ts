import type {
  Items,
  NodeId,
  PersistedMutableRunState,
  PersistedRunState,
  RunCurrentState,
  RunStopCondition,
  WorkflowDefinition,
} from "@codemation/core";
import { Engine, RunIntentService, inject } from "@codemation/core";
import { ApplicationTokens } from "../../applicationTokens";
import type { WorkflowRunRepository } from "../../domain/runs/WorkflowRunRepository";
import type { WorkflowDefinitionRepository } from "../../domain/workflows/WorkflowDefinitionRepository";
import { HandlesCommand } from "../../infrastructure/di/HandlesCommand";
import { ApplicationRequestError } from "../ApplicationRequestError";
import { CommandHandler } from "../bus/CommandHandler";
import type { CreateRunRequest, RunCommandResult } from "../contracts/RunContracts";
import { StartWorkflowRunCommand } from "./StartWorkflowRunCommand";

@HandlesCommand.for(StartWorkflowRunCommand)
export class StartWorkflowRunCommandHandler extends CommandHandler<StartWorkflowRunCommand, RunCommandResult> {
  constructor(
    @inject(Engine)
    private readonly engine: Engine,
    @inject(RunIntentService)
    private readonly runIntentService: RunIntentService,
    @inject(ApplicationTokens.WorkflowDefinitionRepository)
    private readonly workflowDefinitionRepository: WorkflowDefinitionRepository,
    @inject(ApplicationTokens.WorkflowRunRepository)
    private readonly workflowRunRepository: WorkflowRunRepository,
  ) {
    super();
  }

  async execute(command: StartWorkflowRunCommand): Promise<RunCommandResult> {
    const body = command.body;
    if (!body.workflowId) {
      throw new ApplicationRequestError(400, "Missing workflowId");
    }  
    const sourceState = body.sourceRunId ? await this.workflowRunRepository.load(body.sourceRunId) : undefined;
    const workflow = await this.resolveWorkflow(body);
    if (!workflow) {
      throw new ApplicationRequestError(404, "Unknown workflowId");
    }
    const executionOptions =
      body.mode
        ? {
            mode: body.mode,
            sourceWorkflowId: body.workflowId,
            sourceRunId: body.sourceRunId,
            derivedFromRunId: body.sourceRunId,
            isMutable: true,
          }
        : undefined;
    const legacyStartNodeId = body.startAt as NodeId | undefined;
    const items = this.resolveRunRequestItems(workflow, legacyStartNodeId, body.items);
    const result = await this.runIntentService.startWorkflow({
      workflow,
      startAt: legacyStartNodeId && !body.sourceRunId && !body.stopAt ? legacyStartNodeId : undefined,
      items,
      executionOptions,
      workflowSnapshot: sourceState?.workflowSnapshot,
      mutableState: this.cloneMutableState(sourceState?.mutableState),
      currentState: this.cloneRunCurrentState(sourceState),
      stopCondition: legacyStartNodeId && !body.sourceRunId && !body.stopAt ? undefined : this.createStopCondition(body.stopAt),
    });
    const state = (await this.workflowRunRepository.load(result.runId)) ?? null;
    console.info(
      `[codemation-routes.server] postRun workflow=${workflow.id} runId=${result.runId} status=${result.status} persistedStatus=${state?.status ?? "missing"}`,
    );
    return {
      runId: result.runId,
      workflowId: result.workflowId,
      startedAt: result.startedAt,
      status: result.status,
      state,
    };
  }

  private async resolveWorkflow(body: CreateRunRequest): Promise<WorkflowDefinition | undefined> {
    if (body.sourceRunId) {
      const sourceState = await this.workflowRunRepository.load(body.sourceRunId);
      if (!sourceState) {
        return undefined;
      }
      return this.engine.resolveWorkflowSnapshot({
        workflowId: sourceState.workflowId,
        workflowSnapshot: sourceState.workflowSnapshot,
      });
    }
    if (!body.workflowId) {
      return undefined;
    }
    return await this.workflowDefinitionRepository.getDefinition(body.workflowId);
  }

  private resolveRunRequestItems(workflow: WorkflowDefinition, startAt: string | undefined, items?: Items): Items {
    if (items) {
      return items;
    }
    return startAt && this.isWebhookTrigger(workflow, startAt) ? [] : [{ json: {} }];
  }

  private isWebhookTrigger(workflow: WorkflowDefinition, startAt: string): boolean {
    const startNode = workflow.nodes.find((node) => node.id === startAt);
    if (!startNode || startNode.kind !== "trigger") {
      return false;
    }
    const type = startNode.config?.type as Readonly<{ name?: unknown }> | undefined;
    return type?.name === "WebhookTriggerNode";
  }

  private cloneMutableState(mutableState: PersistedRunState["mutableState"]): PersistedMutableRunState | undefined {
    if (!mutableState) {
      return undefined;
    }
    return JSON.parse(JSON.stringify(mutableState)) as PersistedMutableRunState;
  }

  private cloneRunCurrentState(state: PersistedRunState | undefined): RunCurrentState | undefined {
    if (!state) {
      return undefined;
    }
    return {
      outputsByNode: JSON.parse(JSON.stringify(state.outputsByNode)) as RunCurrentState["outputsByNode"],
      nodeSnapshotsByNodeId: JSON.parse(JSON.stringify(state.nodeSnapshotsByNodeId)) as RunCurrentState["nodeSnapshotsByNodeId"],
      mutableState: this.cloneMutableState(state.mutableState),
    };
  }

  private createStopCondition(stopAtNodeId: string | undefined): RunStopCondition {
    if (!stopAtNodeId) {
      return { kind: "workflowCompleted" };
    }
    return {
      kind: "nodeCompleted",
      nodeId: stopAtNodeId as NodeId,
    };
  }
}
