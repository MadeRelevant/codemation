import type {
  Items,
  NodeId,
  ParentExecutionRef,
  PersistedMutableRunState,
  PersistedRunState,
  WorkflowDefinition,
  WorkflowRegistry,
} from "@codemation/core";
import { injectable } from "@codemation/core";
import { PersistedWorkflowResolver } from "@codemation/core";
import type { CodemationBootstrapResult } from "../bootstrapDiscovery";
import type { FrontendRuntimeProvider, PreparedExecutionRuntimeProvider } from "./frontendRouteTokens";

type RunRequestBody = Readonly<{
  workflowId?: string;
  items?: Items;
  startAt?: string;
  stopAt?: string;
  mode?: "manual" | "debug";
  sourceRunId?: string;
}>;

type PatchWorkflowSnapshotBody = Readonly<{
  workflowSnapshot?: PersistedRunState["workflowSnapshot"];
}>;

type PatchNodePinBody = Readonly<{
  items?: Items;
}>;

type RunNodeBody = Readonly<{
  items?: Items;
  mode?: "manual" | "debug";
}>;

type PostRunRouteResponse = Readonly<{
  runId: string;
  workflowId: string;
  startedAt?: string;
  status: string;
  state: PersistedRunState | null;
}>;

type PersistedRunStateStoreView = Readonly<{
  load: (runId: string) => Promise<PersistedRunState | undefined>;
}>;

type MutableFrontendExecutionContext = Readonly<{
  runtime: Awaited<ReturnType<FrontendRuntimeProvider["getRuntime"]>>;
  state: PersistedRunState;
  workflow: WorkflowDefinition;
  nodeId?: NodeId;
}>;

class RunRequestItemsResolver {
  static resolve(workflow: WorkflowDefinition, startAt: string, items?: Items): Items {
    if (items) {
      return items;
    }
    return this.isWebhookTrigger(workflow, startAt) ? [] : [{ json: {} }];
  }

  private static isWebhookTrigger(workflow: WorkflowDefinition, startAt: string): boolean {
    const startNode = workflow.nodes.find((node) => node.id === startAt);
    if (!startNode || startNode.kind !== "trigger") {
      return false;
    }
    const type = startNode.config?.type as Readonly<{ name?: unknown }> | undefined;
    return type?.name === "WebhookTriggerNode";
  }
}

class WorkflowSliceBuilder {
  static sliceUpToNode(workflow: WorkflowDefinition, stopAtNodeId: string | undefined): WorkflowDefinition {
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

  private static collectUpstreamNodeIds(workflow: WorkflowDefinition, stopAtNodeId: string): Set<string> {
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
}

class WorkflowExecutionRequestResolver {
  static async resolve(args: {
    body: RunRequestBody;
    workflowRegistry: WorkflowRegistry;
    runStore: PersistedRunStateStoreView;
  }): Promise<WorkflowDefinition | undefined> {
    if (args.body.sourceRunId) {
      const sourceState = await args.runStore.load(args.body.sourceRunId);
      if (!sourceState) {
        return undefined;
      }
      return new PersistedWorkflowResolver(args.workflowRegistry).resolve({
        workflowId: sourceState.workflowId,
        workflowSnapshot: sourceState.workflowSnapshot,
      });
    }
    if (!args.body.workflowId) {
      return undefined;
    }
    return args.workflowRegistry.get(args.body.workflowId);
  }
}

class MutableExecutionGuards {
  static ensureMutable(state: PersistedRunState): void {
    if (!state.executionOptions?.isMutable) {
      throw new Error(`Run ${state.runId} is immutable`);
    }
  }
}

class MutableExecutionCloner {
  static cloneMutableState(mutableState: PersistedRunState["mutableState"]): PersistedMutableRunState | undefined {
    if (!mutableState) {
      return undefined;
    }
    return JSON.parse(JSON.stringify(mutableState)) as PersistedMutableRunState;
  }

  static cloneWorkflowSnapshot(workflowSnapshot: PersistedRunState["workflowSnapshot"]): PersistedRunState["workflowSnapshot"] {
    if (!workflowSnapshot) {
      return undefined;
    }
    return JSON.parse(JSON.stringify(workflowSnapshot)) as NonNullable<PersistedRunState["workflowSnapshot"]>;
  }
}

class WorkflowNodeTargeting {
  static resolveStartNode(workflow: WorkflowDefinition): NodeId {
    return workflow.nodes.find((node) => node.kind === "trigger")?.id ?? workflow.nodes[0]!.id;
  }

  static collectDescendantNodeIds(workflow: WorkflowDefinition, startNodeId: NodeId): Set<NodeId> {
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

class MutableExecutionStatePruner {
  static pruneFromNode(state: PersistedRunState, workflow: WorkflowDefinition, startNodeId: NodeId): PersistedRunState {
    const affectedNodeIds = WorkflowNodeTargeting.collectDescendantNodeIds(workflow, startNodeId);
    const outputsByNode = Object.fromEntries(Object.entries(state.outputsByNode).filter(([nodeId]) => !affectedNodeIds.has(nodeId)));
    const nodeSnapshotsByNodeId = Object.fromEntries(Object.entries(state.nodeSnapshotsByNodeId).filter(([nodeId]) => !affectedNodeIds.has(nodeId)));
    return {
      ...state,
      status: "completed",
      pending: undefined,
      queue: [],
      outputsByNode,
      nodeSnapshotsByNodeId,
    };
  }
}

class MutableExecutionResolver {
  static resolveWorkflow(args: { state: PersistedRunState; workflowRegistry: WorkflowRegistry }): WorkflowDefinition | undefined {
    return new PersistedWorkflowResolver(args.workflowRegistry).resolve({
      workflowId: args.state.workflowId,
      workflowSnapshot: args.state.workflowSnapshot,
    });
  }

  static resolvePinnedInput(state: PersistedRunState, nodeId: NodeId): Items | undefined {
    return state.mutableState?.nodesById?.[nodeId]?.pinnedInput;
  }

  static resolveCapturedInput(state: PersistedRunState, nodeId: NodeId): Items | undefined {
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
}

@injectable()
export class RunRouteHandler {
  constructor(
    private readonly frontendRuntimeProvider: FrontendRuntimeProvider,
    private readonly preparedExecutionRuntimeProvider: PreparedExecutionRuntimeProvider,
  ) {}

  async getRun(runId: string, args?: Readonly<{ configOverride?: CodemationBootstrapResult }>): Promise<Response> {
    const runtime = await this.preparedExecutionRuntimeProvider.getPreparedExecutionRuntime(args);
    const state = await runtime.runStore.load(decodeURIComponent(runId));
    if (!state) {
      return Response.json({ error: "Unknown runId" }, { status: 404 });
    }
    return Response.json(state);
  }

  async postRun(req: Request, args?: Readonly<{ configOverride?: CodemationBootstrapResult }>): Promise<Response> {
    const body = (await req.json()) as RunRequestBody;
    if (!body.workflowId) {
      return Response.json({ error: "Missing workflowId" }, { status: 400 });
    }

    const runtime = await this.frontendRuntimeProvider.getRuntime(args);
    const sourceState = body.sourceRunId ? await runtime.getRunStore().load(body.sourceRunId) : undefined;
    const workflow = await WorkflowExecutionRequestResolver.resolve({
      body,
      workflowRegistry: runtime.getWorkflowRegistry(),
      runStore: runtime.getRunStore(),
    });
    if (!workflow) {
      return Response.json({ error: "Unknown workflowId" }, { status: 404 });
    }

    const executableWorkflow = WorkflowSliceBuilder.sliceUpToNode(workflow, body.stopAt);
    const startAt = body.startAt ?? executableWorkflow.nodes.find((node) => node.kind === "trigger")?.id ?? executableWorkflow.nodes[0]!.id;
    const items = RunRequestItemsResolver.resolve(executableWorkflow, startAt, body.items);
    const result = await runtime.getEngine().runWorkflow(
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
        mutableState: MutableExecutionCloner.cloneMutableState(sourceState?.mutableState),
      },
    );
    const state = (await runtime.getRunStore().load(result.runId)) ?? null;
    const response: PostRunRouteResponse = {
      runId: result.runId,
      workflowId: result.workflowId,
      startedAt: result.startedAt,
      status: result.status,
      state,
    };
    console.info(
      `[codemation-routes.server] postRun workflow=${workflow.id} runId=${result.runId} status=${result.status} persistedStatus=${state?.status ?? "missing"}`,
    );
    return Response.json(response);
  }

  async patchRunWorkflowSnapshot(
    req: Request,
    runId: string,
    args?: Readonly<{ configOverride?: CodemationBootstrapResult }>,
  ): Promise<Response> {
    const body = (await req.json()) as PatchWorkflowSnapshotBody;
    if (!body.workflowSnapshot) {
      return Response.json({ error: "Missing workflowSnapshot" }, { status: 400 });
    }
    const runtime = await this.preparedExecutionRuntimeProvider.getPreparedExecutionRuntime(args);
    const state = await runtime.runStore.load(decodeURIComponent(runId));
    if (!state) {
      return Response.json({ error: "Unknown runId" }, { status: 404 });
    }
    try {
      MutableExecutionGuards.ensureMutable(state);
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 403 });
    }

    await runtime.runStore.save({
      ...state,
      status: "completed",
      pending: undefined,
      queue: [],
      outputsByNode: {},
      nodeSnapshotsByNodeId: {},
      workflowSnapshot: body.workflowSnapshot,
    });
    const updated = await runtime.runStore.load(state.runId);
    return Response.json(updated);
  }

  async patchRunNodePin(
    req: Request,
    runId: string,
    nodeId: string,
    args?: Readonly<{ configOverride?: CodemationBootstrapResult }>,
  ): Promise<Response> {
    const body = (await req.json()) as PatchNodePinBody;
    const context = await this.loadMutableFrontendExecutionContext(runId, args, nodeId);
    if (context instanceof Response) {
      return context;
    }
    const { runtime, state, workflow, nodeId: decodedNodeId } = context;
    const nextNodesById = {
      ...(state.mutableState?.nodesById ?? {}),
      [decodedNodeId!]: {
        ...(state.mutableState?.nodesById?.[decodedNodeId!] ?? {}),
        pinnedInput: body.items,
      },
    };
    const prunedState = MutableExecutionStatePruner.pruneFromNode(state, workflow, decodedNodeId!);
    await runtime.getRunStore().save({
      ...prunedState,
      mutableState: {
        nodesById: nextNodesById,
      },
    });
    const updated = await runtime.getRunStore().load(state.runId);
    return Response.json(updated);
  }

  async postRunNode(
    req: Request,
    runId: string,
    nodeId: string,
    args?: Readonly<{ configOverride?: CodemationBootstrapResult }>,
  ): Promise<Response> {
    const body = (await req.json()) as RunNodeBody;
    const context = await this.loadMutableFrontendExecutionContext(runId, args, nodeId);
    if (context instanceof Response) {
      return context;
    }
    const { runtime, state, workflow, nodeId: decodedNodeId } = context;
    const directItems =
      body.items ??
      MutableExecutionResolver.resolvePinnedInput(state, decodedNodeId!) ??
      MutableExecutionResolver.resolveCapturedInput(state, decodedNodeId!);
    const executableWorkflow = directItems ? workflow : WorkflowSliceBuilder.sliceUpToNode(workflow, decodedNodeId!);
    const startAt = directItems ? decodedNodeId! : WorkflowNodeTargeting.resolveStartNode(executableWorkflow);
    const items = directItems ?? RunRequestItemsResolver.resolve(executableWorkflow, startAt, undefined);
    const mode = body.mode ?? state.executionOptions?.mode ?? "manual";
    const mutableStateBase = MutableExecutionCloner.cloneMutableState(state.mutableState) ?? { nodesById: {} };
    const mutableState =
      body.items
        ? ({
            nodesById: {
              ...mutableStateBase.nodesById,
            [decodedNodeId!]: {
              ...(mutableStateBase.nodesById[decodedNodeId!] ?? {}),
                lastDebugInput: body.items,
              },
            },
          } satisfies PersistedMutableRunState)
        : mutableStateBase;
    const result = await runtime.getEngine().runWorkflow(
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
        workflowSnapshot: MutableExecutionCloner.cloneWorkflowSnapshot(state.workflowSnapshot),
        mutableState,
      },
    );
    const nextState = await runtime.getRunStore().load(result.runId);
    return Response.json({
      runId: result.runId,
      workflowId: result.workflowId,
      startedAt: result.startedAt,
      status: result.status,
      state: nextState ?? null,
    } satisfies PostRunRouteResponse);
  }

  private async loadMutableFrontendExecutionContext(
    runId: string,
    args?: Readonly<{ configOverride?: CodemationBootstrapResult }>,
    nodeId?: string,
  ): Promise<MutableFrontendExecutionContext | Response> {
    const runtime = await this.frontendRuntimeProvider.getRuntime(args);
    const state = await runtime.getRunStore().load(decodeURIComponent(runId));
    if (!state) {
      return Response.json({ error: "Unknown runId" }, { status: 404 });
    }
    try {
      MutableExecutionGuards.ensureMutable(state);
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 403 });
    }
    const workflow = MutableExecutionResolver.resolveWorkflow({ state, workflowRegistry: runtime.getWorkflowRegistry() });
    if (!workflow) {
      return Response.json({ error: "Unknown workflow for run" }, { status: 404 });
    }
    return {
      runtime,
      state,
      workflow,
      nodeId: nodeId ? decodeURIComponent(nodeId) : undefined,
    };
  }
}
