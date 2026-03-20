import type {
Items,
PersistedMutableRunState,
PersistedRunState,
RunCurrentState,
WorkflowDefinition,
} from "@codemation/core";
import { Engine,ItemsInputNormalizer,RunIntentService,inject } from "@codemation/core";
import { ApplicationTokens } from "../../applicationTokens";
import type { WorkflowRunRepository } from "../../domain/runs/WorkflowRunRepository";
import { HandlesCommand } from "../../infrastructure/di/HandlesCommand";
import { ApplicationRequestError } from "../ApplicationRequestError";
import { CommandHandler } from "../bus/CommandHandler";
import type { RunCommandResult } from "../contracts/RunContracts";
import { ReplayWorkflowNodeCommand } from "./ReplayWorkflowNodeCommand";

@HandlesCommand.for(ReplayWorkflowNodeCommand)
export class ReplayWorkflowNodeCommandHandler extends CommandHandler<ReplayWorkflowNodeCommand, RunCommandResult> {
  constructor(
    @inject(Engine)
    private readonly engine: Engine,
    @inject(ItemsInputNormalizer)
    private readonly itemsInputNormalizer: ItemsInputNormalizer,
    @inject(RunIntentService)
    private readonly runIntentService: RunIntentService,
    @inject(ApplicationTokens.WorkflowRunRepository)
    private readonly workflowRunRepository: WorkflowRunRepository,
  ) {
    super();
  }

  async execute(command: ReplayWorkflowNodeCommand): Promise<RunCommandResult> {
    const state = await this.workflowRunRepository.load(command.runId);
    if (!state) {
      throw new ApplicationRequestError(404, "Unknown runId");
    }
    this.ensureMutable(state);
    const workflow = this.resolveWorkflow(state);
    if (!workflow) {
      throw new ApplicationRequestError(404, "Unknown workflow for run");
    }
    const decodedNodeId = decodeURIComponent(command.nodeId);
    const mode = command.body.mode ?? state.executionOptions?.mode ?? "manual";
    const requestedItems = await this.resolveRequestedItems({
      workflow,
      nodeId: decodedNodeId,
      items: command.body.items,
      synthesizeTriggerItems: command.body.synthesizeTriggerItems,
    });
    const mutableStateBase = this.cloneMutableState(state.mutableState) ?? { nodesById: {} };
    const mutableState =
      requestedItems
        ? ({
            nodesById: {
              ...mutableStateBase.nodesById,
              [decodedNodeId]: {
                ...(mutableStateBase.nodesById[decodedNodeId] ?? {}),
                lastDebugInput: requestedItems,
              },
            },
          } satisfies PersistedMutableRunState)
        : mutableStateBase;
    const executionOptions = {
      mode,
      sourceWorkflowId: state.executionOptions?.sourceWorkflowId ?? state.workflowId,
      sourceRunId: state.executionOptions?.sourceRunId ?? state.runId,
      derivedFromRunId: state.runId,
      isMutable: true,
    } as const;
    const result = await this.runIntentService.rerunFromNode({
      workflow,
      nodeId: decodedNodeId,
      currentState: this.cloneRunCurrentState(state, mutableState),
      items: requestedItems,
      executionOptions,
      workflowSnapshot: this.cloneWorkflowSnapshot(state.workflowSnapshot),
      mutableState,
    });
    const nextState = await this.workflowRunRepository.load(result.runId);
    return {
      runId: result.runId,
      workflowId: result.workflowId,
      startedAt: result.startedAt,
      status: result.status,
      state: nextState ?? null,
    };
  }

  private ensureMutable(state: PersistedRunState): void {
    if (!state.executionOptions?.isMutable) {
      throw new ApplicationRequestError(403, `Run ${state.runId} is immutable`);
    }
  }

  private resolveWorkflow(state: PersistedRunState): WorkflowDefinition | undefined {
    return this.engine.resolveWorkflowSnapshot({
      workflowId: state.workflowId,
      workflowSnapshot: state.workflowSnapshot,
    });
  }

  private cloneMutableState(mutableState: PersistedRunState["mutableState"]): PersistedMutableRunState | undefined {
    if (!mutableState) {
      return undefined;
    }
    return JSON.parse(JSON.stringify(mutableState)) as PersistedMutableRunState;
  }

  private cloneWorkflowSnapshot(workflowSnapshot: PersistedRunState["workflowSnapshot"]): PersistedRunState["workflowSnapshot"] {
    if (!workflowSnapshot) {
      return undefined;
    }
    return JSON.parse(JSON.stringify(workflowSnapshot)) as NonNullable<PersistedRunState["workflowSnapshot"]>;
  }

  private cloneRunCurrentState(
    state: PersistedRunState,
    mutableState: PersistedMutableRunState | undefined,
  ): RunCurrentState {
    return {
      outputsByNode: JSON.parse(JSON.stringify(state.outputsByNode)) as RunCurrentState["outputsByNode"],
      nodeSnapshotsByNodeId: JSON.parse(JSON.stringify(state.nodeSnapshotsByNodeId)) as RunCurrentState["nodeSnapshotsByNodeId"],
      mutableState,
    };
  }

  private async resolveRequestedItems(args: Readonly<{
    workflow: WorkflowDefinition;
    nodeId: string;
    items: Items | undefined | null;
    synthesizeTriggerItems: boolean | undefined;
  }>): Promise<Items | undefined> {
    const normalizedItems = args.items == null ? undefined : this.itemsInputNormalizer.normalize(args.items);
    if (!this.shouldSynthesizeTriggerItems(args.workflow, args.nodeId, args.synthesizeTriggerItems, normalizedItems)) {
      return normalizedItems;
    }
    return await this.engine.createTriggerTestItems({
      workflow: args.workflow,
      nodeId: args.nodeId,
    });
  }

  private shouldSynthesizeTriggerItems(
    workflow: WorkflowDefinition,
    nodeId: string,
    synthesizeTriggerItems: boolean | undefined,
    normalizedItems: Items | undefined,
  ): boolean {
    if (synthesizeTriggerItems) {
      return true;
    }
    if (normalizedItems && normalizedItems.length > 0) {
      return false;
    }
    return workflow.nodes.find((node) => node.id === nodeId)?.kind === "trigger";
  }
}
