import { HandlesCommand } from "../../infrastructure/di/HandlesCommand";
import type { WorkflowRunRepository } from "../../domain/runs/WorkflowRunRepository";
import { ApplicationTokens } from "../../applicationTokens";
import { CommandHandler } from "../bus/CommandHandler";
import { Engine, inject, type NodeId, type PersistedRunState, type WorkflowDefinition } from "@codemation/core";
import { ApplicationRequestError } from "../ApplicationRequestError";
import { SetPinnedNodeInputCommand } from "./SetPinnedNodeInputCommand";

@HandlesCommand.for(SetPinnedNodeInputCommand)
export class SetPinnedNodeInputCommandHandler extends CommandHandler<SetPinnedNodeInputCommand, PersistedRunState> {
  constructor(
    @inject(Engine)
    private readonly engine: Engine,
    @inject(ApplicationTokens.WorkflowRunRepository)
    private readonly workflowRunRepository: WorkflowRunRepository,
  ) {
    super();
  }

  async execute(command: SetPinnedNodeInputCommand): Promise<PersistedRunState> {
    const state = await this.workflowRunRepository.load(command.runId);
    if (!state) {
      throw new ApplicationRequestError(404, "Unknown runId");
    }
    if (!state.executionOptions?.isMutable) {
      throw new ApplicationRequestError(403, `Run ${state.runId} is immutable`);
    }
    const workflow = this.engine.resolveWorkflowSnapshot({
      workflowId: state.workflowId,
      workflowSnapshot: state.workflowSnapshot,
    });
    if (!workflow) {
      throw new ApplicationRequestError(404, "Unknown workflow for run");
    }
    const decodedNodeId = decodeURIComponent(command.nodeId);
    const nextNodesById = {
      ...(state.mutableState?.nodesById ?? {}),
      [decodedNodeId]: {
        ...(state.mutableState?.nodesById?.[decodedNodeId] ?? {}),
        pinnedInput: command.body.items,
      },
    };
    const prunedState = this.pruneFromNode(state, workflow, decodedNodeId);
    await this.workflowRunRepository.save({
      ...prunedState,
      mutableState: {
        nodesById: nextNodesById,
      },
    });
    const updated = await this.workflowRunRepository.load(state.runId);
    if (!updated) {
      throw new ApplicationRequestError(404, "Unknown runId");
    }
    return updated;
  }

  private pruneFromNode(state: PersistedRunState, workflow: WorkflowDefinition, startNodeId: NodeId): PersistedRunState {
    const affectedNodeIds = this.collectDescendantNodeIds(workflow, startNodeId);
    const outputsByNode = Object.fromEntries(Object.entries(state.outputsByNode).filter(([nodeId]) => !affectedNodeIds.has(nodeId)));
    const nodeSnapshotsByNodeId = Object.fromEntries(
      Object.entries(state.nodeSnapshotsByNodeId).filter(([nodeId]) => !affectedNodeIds.has(nodeId)),
    );
    return {
      ...state,
      status: "completed",
      pending: undefined,
      queue: [],
      outputsByNode,
      nodeSnapshotsByNodeId,
    };
  }

  private collectDescendantNodeIds(workflow: WorkflowDefinition, startNodeId: NodeId): Set<NodeId> {
    const outgoingEdgesByNodeId = new Map<NodeId, WorkflowDefinition["edges"]>();
    for (const edge of workflow.edges) {
      const list = outgoingEdgesByNodeId.get(edge.from.nodeId) ?? [];
      outgoingEdgesByNodeId.set(edge.from.nodeId, [...list, edge]);
    }
    const pendingNodeIds = [startNodeId];
    const descendants = new Set<NodeId>();
    while (pendingNodeIds.length > 0) {
      const nodeId = pendingNodeIds.pop();
      if (!nodeId || descendants.has(nodeId)) {
        continue;
      }
      descendants.add(nodeId);
      for (const edge of outgoingEdgesByNodeId.get(nodeId) ?? []) {
        pendingNodeIds.push(edge.to.nodeId);
      }
    }
    return descendants;
  }
}
