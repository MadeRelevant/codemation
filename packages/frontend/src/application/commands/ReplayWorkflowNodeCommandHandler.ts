import type {
  Engine,
  Items,
  NodeId,
  ParentExecutionRef,
  PersistedMutableRunState,
  PersistedRunState,
  WorkflowDefinition,
} from "@codemation/core";
import { inject } from "@codemation/core";
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
    private readonly engine: Engine,
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
    const directItems =
      command.body.items ??
      this.resolvePinnedInput(state, decodedNodeId) ??
      this.resolveCapturedInput(state, decodedNodeId);
    const executableWorkflow = directItems ? workflow : this.sliceUpToNode(workflow, decodedNodeId);
    const startAt = directItems ? decodedNodeId : this.resolveStartNode(executableWorkflow);
    const items = directItems ?? this.resolveRunRequestItems(executableWorkflow, startAt, undefined);
    const mode = command.body.mode ?? state.executionOptions?.mode ?? "manual";
    const mutableStateBase = this.cloneMutableState(state.mutableState) ?? { nodesById: {} };
    const mutableState =
      command.body.items
        ? ({
            nodesById: {
              ...mutableStateBase.nodesById,
              [decodedNodeId]: {
                ...(mutableStateBase.nodesById[decodedNodeId] ?? {}),
                lastDebugInput: command.body.items,
              },
            },
          } satisfies PersistedMutableRunState)
        : mutableStateBase;
    const result = await this.engine.runWorkflow(
      executableWorkflow,
      startAt,
      items,
      undefined as ParentExecutionRef | undefined,
      {
        mode,
        sourceWorkflowId: state.executionOptions?.sourceWorkflowId ?? state.workflowId,
        sourceRunId: state.executionOptions?.sourceRunId ?? state.runId,
        derivedFromRunId: state.runId,
        isMutable: true,
      },
      {
        workflowSnapshot: this.cloneWorkflowSnapshot(state.workflowSnapshot),
        mutableState,
      },
    );
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

  private resolvePinnedInput(state: PersistedRunState, nodeId: NodeId): Items | undefined {
    return state.mutableState?.nodesById?.[nodeId]?.pinnedInput;
  }

  private resolveCapturedInput(state: PersistedRunState, nodeId: NodeId): Items | undefined {
    const inputsByPort = state.nodeSnapshotsByNodeId[nodeId]?.inputsByPort;
    if (!inputsByPort) {
      return undefined;
    }
    if (inputsByPort.in) {
      return inputsByPort.in;
    }
    const entries = Object.values(inputsByPort);
    return entries.length === 1 ? entries[0] : undefined;
  }

  private sliceUpToNode(workflow: WorkflowDefinition, stopAtNodeId: string | undefined): WorkflowDefinition {
    if (!stopAtNodeId) {
      return workflow;
    }
    const includedNodeIds = this.collectUpstreamNodeIds(workflow, stopAtNodeId);
    return {
      ...workflow,
      nodes: workflow.nodes.filter((node) => includedNodeIds.has(node.id)),
      edges: workflow.edges.filter((edge) => includedNodeIds.has(edge.from.nodeId) && includedNodeIds.has(edge.to.nodeId)),
    };
  }

  private collectUpstreamNodeIds(workflow: WorkflowDefinition, stopAtNodeId: string): Set<string> {
    const incomingEdgesByNodeId = new Map<string, WorkflowDefinition["edges"]>();
    for (const edge of workflow.edges) {
      const list = incomingEdgesByNodeId.get(edge.to.nodeId) ?? [];
      incomingEdgesByNodeId.set(edge.to.nodeId, [...list, edge]);
    }
    const pendingNodeIds = [stopAtNodeId];
    const includedNodeIds = new Set<string>();
    while (pendingNodeIds.length > 0) {
      const nodeId = pendingNodeIds.pop();
      if (!nodeId || includedNodeIds.has(nodeId)) {
        continue;
      }
      includedNodeIds.add(nodeId);
      for (const edge of incomingEdgesByNodeId.get(nodeId) ?? []) {
        pendingNodeIds.push(edge.from.nodeId);
      }
    }
    return includedNodeIds;
  }

  private resolveStartNode(workflow: WorkflowDefinition): NodeId {
    return workflow.nodes.find((node) => node.kind === "trigger")?.id ?? workflow.nodes[0]!.id;
  }

  private resolveRunRequestItems(workflow: WorkflowDefinition, startAt: string, items?: Items): Items {
    if (items) {
      return items;
    }
    return this.isWebhookTrigger(workflow, startAt) ? [] : [{ json: {} }];
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

  private cloneWorkflowSnapshot(workflowSnapshot: PersistedRunState["workflowSnapshot"]): PersistedRunState["workflowSnapshot"] {
    if (!workflowSnapshot) {
      return undefined;
    }
    return JSON.parse(JSON.stringify(workflowSnapshot)) as NonNullable<PersistedRunState["workflowSnapshot"]>;
  }
}
