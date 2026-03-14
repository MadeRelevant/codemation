import type {
  Items,
  NodeId,
  ParentExecutionRef,
  PersistedMutableRunState,
  PersistedRunState,
  WorkflowDefinition,
} from "@codemation/core";
import { Engine, inject } from "@codemation/core";
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
    const executableWorkflow = this.sliceUpToNode(workflow, body.stopAt);
    const startAt = body.startAt ?? executableWorkflow.nodes.find((node) => node.kind === "trigger")?.id ?? executableWorkflow.nodes[0]!.id;
    const items = this.resolveRunRequestItems(executableWorkflow, startAt, body.items);
    const result = await this.engine.runWorkflow(
      executableWorkflow,
      startAt as NodeId,
      items,
      undefined as ParentExecutionRef | undefined,
      body.mode
        ? {
            mode: body.mode,
            sourceWorkflowId: body.workflowId,
            sourceRunId: body.sourceRunId,
            derivedFromRunId: body.sourceRunId,
            isMutable: true,
          }
        : undefined,
      {
        workflowSnapshot: sourceState?.workflowSnapshot,
        mutableState: this.cloneMutableState(sourceState?.mutableState),
      },
    );
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
}
