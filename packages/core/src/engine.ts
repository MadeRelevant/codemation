import {
  type EngineDeps,
  type EngineHost,
  type ExecutionContext,
  type Items,
  type MutableRunData,
  type NodeActivationId,
  type NodeActivationStats,
  type NodeId,
  type Node,
  type NodeOutputs,
  type OutputPortKey,
  type PendingNodeExecution,
  type ParentExecutionRef,
  type RunQueueEntry,
  type RunId,
  type RunResult,
  type TriggerNode,
  type WorkflowDefinition,
  type WorkflowGraph,
  type WorkflowId,
} from "./types";
import type { Container } from "./di";
import { DefaultExecutionContextFactory } from "./engine/defaultExecutionContextFactory";
import { DefaultWorkflowGraphFactory } from "./engine/defaultWorkflowGraphFactory";
import { HintOnlyOffloadPolicy } from "./engine/hintOnlyOffloadPolicy";
import { InMemoryRunDataFactory } from "./engine/inMemoryRunDataFactory";
import { InMemoryRunStateStore } from "./engine/inMemoryRunStateStore";
import { LocalOnlyScheduler } from "./engine/localOnlyScheduler";

export { DefaultExecutionContextFactory } from "./engine/defaultExecutionContextFactory";
export { DefaultWorkflowGraphFactory } from "./engine/defaultWorkflowGraphFactory";
export { HintOnlyOffloadPolicy } from "./engine/hintOnlyOffloadPolicy";
export { InMemoryRunDataFactory } from "./engine/inMemoryRunDataFactory";
export { InMemoryRunStateStore } from "./engine/inMemoryRunStateStore";
export { LocalOnlyScheduler } from "./engine/localOnlyScheduler";

export class Engine {
  private readonly container: Container;
  private readonly host: EngineHost;
  private readonly makeRunId: () => RunId;
  private readonly makeActivationId: () => NodeActivationId;
  private readonly webhookBasePath: string;
  private readonly runStore: NonNullable<EngineDeps["runStore"]>;
  private readonly scheduler: NonNullable<EngineDeps["scheduler"]>;
  private readonly offloadPolicy: NonNullable<EngineDeps["offloadPolicy"]>;
  private readonly graphFactory: NonNullable<EngineDeps["graphFactory"]>;
  private readonly runDataFactory: NonNullable<EngineDeps["runDataFactory"]>;
  private readonly executionContextFactory: NonNullable<EngineDeps["executionContextFactory"]>;
  private readonly workflowsById = new Map<WorkflowId, WorkflowDefinition>();

  constructor(deps: EngineDeps) {
    this.container = deps.container;
    this.host = deps.host;
    this.makeRunId = deps.makeRunId;
    this.makeActivationId = deps.makeActivationId;
    this.webhookBasePath = deps.webhookBasePath ?? "/webhooks";
    this.runStore = deps.runStore ?? new InMemoryRunStateStore();
    this.scheduler = deps.scheduler ?? new LocalOnlyScheduler();
    this.offloadPolicy = deps.offloadPolicy ?? new HintOnlyOffloadPolicy();
    this.graphFactory = deps.graphFactory ?? new DefaultWorkflowGraphFactory();
    this.runDataFactory = deps.runDataFactory ?? new InMemoryRunDataFactory();
    this.executionContextFactory = deps.executionContextFactory ?? new DefaultExecutionContextFactory();
  }

  async start(workflows: WorkflowDefinition[]): Promise<void> {
    for (const wf of workflows) this.workflowsById.set(wf.id, wf);
    for (const wf of workflows) {
      for (const def of wf.nodes) {
        if (def.kind !== "trigger") continue;
        const node = this.container.resolve(def.token as any) as TriggerNode;
        const data = this.runDataFactory.create();
        await node.setup({
          ...this.executionContextFactory.create({
            runId: this.makeRunId(),
            workflowId: wf.id,
            parent: undefined,
            services: { credentials: this.host.credentials, workflows: this.host.workflows },
            data,
          }),
          trigger: { workflowId: wf.id, nodeId: def.id },
          config: def.config,
          registerWebhook: (spec) =>
            this.host.registerWebhook({
              workflowId: wf.id,
              nodeId: def.id,
              endpointKey: spec.endpointKey,
              method: spec.method,
              handler: spec.handler,
              basePath: this.webhookBasePath,
            }),
          emit: async (items) => {
            await this.runWorkflow(wf, def.id, items, undefined);
          },
        });
      }
    }
  }

  async runWorkflow(wf: WorkflowDefinition, startAt: NodeId, items: Items, parent?: ParentExecutionRef): Promise<RunResult> {
    const runId = this.makeRunId();
    const startedAt = new Date().toISOString();
    await this.runStore.createRun({ runId, workflowId: wf.id, startedAt, parent });

    const data = this.runDataFactory.create();
    const base = this.executionContextFactory.create({
      runId,
      workflowId: wf.id,
      parent,
      services: { credentials: this.host.credentials, workflows: this.host.workflows },
      data,
    });

    const graph = this.graphFactory.create(wf);
    const defsById = new Map<NodeId, WorkflowDefinition["nodes"][number]>();
    for (const n of wf.nodes) defsById.set(n.id, n);

    // Cache node instances per nodeId for this run (no per-item construction).
    const nodeInstances = new Map<NodeId, Node | TriggerNode>();
    for (const def of wf.nodes) nodeInstances.set(def.id, this.container.resolve(def.token as any));

    const startDef = defsById.get(startAt);
    if (!startDef) throw new Error(`Unknown start nodeId: ${startAt}`);

    let batchSeq = 0;
    const makeBatchId = () => `batch_${++batchSeq}`;
    const rootBatchId = makeBatchId();

    const queue: RunQueueEntry[] = [];

    if (startDef.kind === "trigger") {
      data.setOutputs(startAt, { main: items });
      this.host.onNodeActivation({
        activationId: this.makeActivationId(),
        nodeId: startAt,
        itemsIn: 0,
        itemsOutByPort: { main: items.length },
      });
      for (const next of graph.next(startAt, "main")) {
        queue.push({ nodeId: next, input: items, batchId: rootBatchId, from: { nodeId: startAt, output: "main" } });
      }
    } else {
      queue.push({ nodeId: startAt, input: items, batchId: rootBatchId });
    }

    return await this.runQueue({
      wf,
      runId,
      startedAt,
      parent,
      graph,
      defsById,
      nodeInstances,
      base,
      data,
      queue,
    });
  }

  async resumeFromNodeResult(args: { runId: RunId; activationId: NodeActivationId; nodeId: NodeId; outputs: NodeOutputs }): Promise<RunResult> {
    const state = await this.runStore.load(args.runId);
    if (!state) throw new Error(`Unknown runId: ${args.runId}`);
    if (state.status !== "pending" || !state.pending) throw new Error(`Run ${args.runId} is not pending`);
    if (state.pending.activationId !== args.activationId) throw new Error(`activationId mismatch for run ${args.runId}`);
    if (state.pending.nodeId !== args.nodeId) throw new Error(`nodeId mismatch for run ${args.runId}`);

    const wf = this.workflowsById.get(state.workflowId);
    if (!wf) throw new Error(`Unknown workflowId: ${state.workflowId}`);

    const graph = this.graphFactory.create(wf);
    const defsById = new Map<NodeId, WorkflowDefinition["nodes"][number]>();
    for (const n of wf.nodes) defsById.set(n.id, n);

    const nodeInstances = new Map<NodeId, Node | TriggerNode>();
    for (const def of wf.nodes) nodeInstances.set(def.id, this.container.resolve(def.token as any));

    const data = this.runDataFactory.create(state.outputsByNode);
    const base = this.executionContextFactory.create({
      runId: state.runId,
      workflowId: state.workflowId,
      parent: state.parent,
      services: { credentials: this.host.credentials, workflows: this.host.workflows },
      data,
    });

    // Apply the worker result.
    data.setOutputs(args.nodeId, args.outputs);

    const itemsOutByPort: Record<OutputPortKey, number> = {};
    for (const [port, produced] of Object.entries(args.outputs)) itemsOutByPort[port] = produced?.length ?? 0;
    this.host.onNodeActivation({
      activationId: args.activationId,
      nodeId: args.nodeId,
      itemsIn: state.pending.itemsIn,
      itemsOutByPort,
    } satisfies NodeActivationStats);

    const resumeBatchId = state.pending.batchId ?? "batch_1";
    const queue: RunQueueEntry[] = state.queue.map((q) => ({ ...q, batchId: q.batchId ?? resumeBatchId }));

    // Schedule downstream edges from the resumed node result.
    const outgoingByNode = new Map<NodeId, Array<{ output: OutputPortKey; to: NodeId }>>();
    const incomingByNode = new Map<NodeId, Array<{ nodeId: NodeId; output: OutputPortKey }>>();
    for (const e of wf.edges) {
      const out = outgoingByNode.get(e.from.nodeId) ?? [];
      out.push({ output: e.from.output, to: e.to.nodeId });
      outgoingByNode.set(e.from.nodeId, out);

      const inc = incomingByNode.get(e.to.nodeId) ?? [];
      inc.push({ nodeId: e.from.nodeId, output: e.from.output });
      incomingByNode.set(e.to.nodeId, inc);
    }

    const incomingUniqueByNode = new Map<NodeId, Array<{ nodeId: NodeId; output: OutputPortKey }>>();
    for (const [toNodeId, list] of incomingByNode.entries()) {
      const seen = new Set<NodeId>();
      const uniq: Array<{ nodeId: NodeId; output: OutputPortKey }> = [];
      for (const entry of list) {
        if (seen.has(entry.nodeId)) continue;
        seen.add(entry.nodeId);
        uniq.push(entry);
      }
      incomingUniqueByNode.set(toNodeId, uniq);
    }

    const joinJobsByKey = new Map<string, RunQueueEntry>();
    for (const q of queue) {
      if (!q.join) continue;
      const key = `${q.batchId ?? resumeBatchId}:${q.nodeId}`;
      joinJobsByKey.set(key, q);
    }

    const schedule = (toNodeId: NodeId, fromNodeId: NodeId, fromOutput: OutputPortKey, outItems: Items): void => {
      const expected = incomingUniqueByNode.get(toNodeId) ?? [];
      if (expected.length <= 1) {
        if (outItems.length === 0) return;
        queue.push({ nodeId: toNodeId, input: outItems, batchId: resumeBatchId, from: { nodeId: fromNodeId, output: fromOutput } });
        return;
      }

      const key = `${resumeBatchId}:${toNodeId}`;
      let joinJob = joinJobsByKey.get(key);
      if (!joinJob) {
        joinJob = {
          nodeId: toNodeId,
          input: [],
          batchId: resumeBatchId,
          join: { expectedFrom: expected, received: {} as Record<NodeId, Items> },
        };
        joinJobsByKey.set(key, joinJob);
        queue.push(joinJob);
      }
      (joinJob.join as any).received[fromNodeId] = outItems;
    };

    for (const edge of outgoingByNode.get(args.nodeId) ?? []) {
      const outItems = (args.outputs as any)[edge.output] ?? [];
      schedule(edge.to, args.nodeId, edge.output, outItems);
    }

    return await this.runQueue({
      wf,
      runId: state.runId,
      startedAt: state.startedAt,
      parent: state.parent,
      graph,
      defsById,
      nodeInstances,
      base,
      data,
      queue,
      pendingCleared: true,
    });
  }

  async resumeFromStepResult(args: { runId: RunId; activationId: NodeActivationId; nodeId: NodeId; outputs: NodeOutputs }): Promise<RunResult> {
    return await this.resumeFromNodeResult(args);
  }

  private async runQueue(args: {
    wf: WorkflowDefinition;
    runId: RunId;
    startedAt: string;
    parent?: ParentExecutionRef;
    graph: WorkflowGraph;
    defsById: Map<NodeId, WorkflowDefinition["nodes"][number]>;
    nodeInstances: Map<NodeId, Node | TriggerNode>;
    base: ExecutionContext;
    data: MutableRunData;
    queue: RunQueueEntry[];
    pendingCleared?: boolean;
  }): Promise<RunResult> {
    const { wf, runId, startedAt, parent, defsById, nodeInstances, base, data, queue } = args;

    const outgoingByNode = new Map<NodeId, Array<{ output: OutputPortKey; to: NodeId }>>();
    const incomingByNode = new Map<NodeId, Array<{ nodeId: NodeId; output: OutputPortKey }>>();
    for (const e of wf.edges) {
      const out = outgoingByNode.get(e.from.nodeId) ?? [];
      out.push({ output: e.from.output, to: e.to.nodeId });
      outgoingByNode.set(e.from.nodeId, out);

      const inc = incomingByNode.get(e.to.nodeId) ?? [];
      inc.push({ nodeId: e.from.nodeId, output: e.from.output });
      incomingByNode.set(e.to.nodeId, inc);
    }

    const incomingUniqueByNode = new Map<NodeId, Array<{ nodeId: NodeId; output: OutputPortKey }>>();
    for (const [toNodeId, list] of incomingByNode.entries()) {
      const seen = new Set<NodeId>();
      const uniq: Array<{ nodeId: NodeId; output: OutputPortKey }> = [];
      for (const entry of list) {
        if (seen.has(entry.nodeId)) continue;
        seen.add(entry.nodeId);
        uniq.push(entry);
      }
      incomingUniqueByNode.set(toNodeId, uniq);
    }

    const joinJobsByKey = new Map<string, RunQueueEntry>();
    for (const q of queue) {
      if (!q.join) continue;
      const key = `${q.batchId ?? "batch_1"}:${q.nodeId}`;
      joinJobsByKey.set(key, q);
    }

    try {
      while (queue.length > 0) {
        const job = queue.shift()!;
        const batchId = job.batchId ?? "batch_1";

        let jobInput: Items = job.input;
        if (job.join) {
          const expected = job.join.expectedFrom;
          const received = job.join.received as Record<NodeId, Items>;

          let done = true;
          for (const e of expected) {
            if (!(e.nodeId in received)) {
              done = false;
              break;
            }
          }

          if (!done) {
            if (queue.length === 0) throw new Error(`Join for node ${job.nodeId} could not be satisfied (batchId=${batchId})`);
            queue.push(job);
            continue;
          }

          let maxLen = 0;
          for (const e of expected) maxLen = Math.max(maxLen, (received[e.nodeId] ?? []).length);

          const merged: Array<{ json: Record<string, unknown> }> = [];
          for (let i = 0; i < maxLen; i++) {
            const json: Record<string, unknown> = {};
            for (const e of expected) {
              const item = (received[e.nodeId] ?? [])[i];
              json[e.nodeId] = item?.json;
            }
            merged.push({ json });
          }

          jobInput = merged as unknown as Items;
          joinJobsByKey.delete(`${batchId}:${job.nodeId}`);
        }

        const def = defsById.get(job.nodeId);
        if (!def || def.kind !== "node") continue;

        const node = nodeInstances.get(def.id) as Node | undefined;
        if (!node) continue;

        const activationId = this.makeActivationId();
        const ctx: any = {
          ...base,
          data,
          nodeId: def.id,
          activationId,
          config: def.config,
        };

        const decision = this.offloadPolicy.decide({ workflowId: wf.id, nodeId: def.id, config: def.config });
        if (decision.mode === "worker") {
          const receipt = await this.scheduler.enqueue({
            runId,
            activationId,
            workflowId: wf.id,
            nodeId: def.id,
            input: jobInput,
            parent,
            queue: decision.queue,
          });

          const pending: PendingNodeExecution = {
            runId,
            activationId,
            workflowId: wf.id,
            nodeId: def.id,
            itemsIn: jobInput.length,
            receiptId: receipt.receiptId,
            queue: decision.queue,
            batchId,
            enqueuedAt: new Date().toISOString(),
          };

          await this.runStore.save({
            runId,
            workflowId: wf.id,
            startedAt,
            parent,
            status: "pending",
            pending,
            queue: queue.map((q) => ({ ...q })),
            outputsByNode: data.dump(),
          });

          return { runId, workflowId: wf.id, startedAt, status: "pending", pending };
        }

        const nodeOutputs: NodeOutputs = await node.execute(jobInput, ctx);
        data.setOutputs(def.id, nodeOutputs);

        const itemsOutByPort: Record<OutputPortKey, number> = {};
        for (const [port, produced] of Object.entries(nodeOutputs)) itemsOutByPort[port] = produced?.length ?? 0;

        this.host.onNodeActivation({
          activationId,
          nodeId: def.id,
          itemsIn: jobInput.length,
          itemsOutByPort,
        } satisfies NodeActivationStats);

        const schedule = (toNodeId: NodeId, fromNodeId: NodeId, fromOutput: OutputPortKey, outItems: Items): void => {
          const expected = incomingUniqueByNode.get(toNodeId) ?? [];
          if (expected.length <= 1) {
            if (outItems.length === 0) return;
            queue.push({ nodeId: toNodeId, input: outItems, batchId, from: { nodeId: fromNodeId, output: fromOutput } });
            return;
          }

          const key = `${batchId}:${toNodeId}`;
          let joinJob = joinJobsByKey.get(key);
          if (!joinJob) {
            joinJob = {
              nodeId: toNodeId,
              input: [],
              batchId,
              join: { expectedFrom: expected, received: {} as Record<NodeId, Items> },
            };
            joinJobsByKey.set(key, joinJob);
            queue.push(joinJob);
          }
          (joinJob.join as any).received[fromNodeId] = outItems;
        };

        for (const edge of outgoingByNode.get(def.id) ?? []) {
          const outItems = (nodeOutputs as any)[edge.output] ?? [];
          schedule(edge.to, def.id, edge.output, outItems);
        }
      }

      const lastNodeId = wf.nodes.at(-1)?.id ?? (() => { throw new Error(`Workflow ${wf.id} has no nodes`); })();
      const outputs = data.getOutputItems(lastNodeId, "main");

      await this.runStore.save({
        runId,
        workflowId: wf.id,
        startedAt,
        parent,
        status: "completed",
        pending: undefined,
        queue: [],
        outputsByNode: data.dump(),
      });

      return { runId, workflowId: wf.id, startedAt, status: "completed", outputs };
    } catch (e: any) {
      const message = e instanceof Error ? e.message : String(e);
      await this.runStore.save({
        runId,
        workflowId: wf.id,
        startedAt,
        parent,
        status: "failed",
        pending: undefined,
        queue: queue.map((q) => ({ ...q })),
        outputsByNode: data.dump(),
      });
      return { runId, workflowId: wf.id, startedAt, status: "failed", error: { message } };
    }
  }
}

export class EngineWorkflowRunnerService {
  constructor(
    private readonly engine: Engine,
    private readonly workflowsById: Map<WorkflowId, WorkflowDefinition>,
  ) {}

  async runById(args: { workflowId: WorkflowId; startAt?: NodeId; items: Items; parent?: ParentExecutionRef }): Promise<RunResult> {
    const { workflowId, startAt, items, parent } = args;
    const wf = this.workflowsById.get(workflowId);
    if (!wf) throw new Error(`Unknown workflowId: ${workflowId}`);

    const startNodeId = startAt ?? this.findDefaultStartNodeId(wf);
    return await this.engine.runWorkflow(wf, startNodeId, items, parent);
  }

  private findDefaultStartNodeId(wf: WorkflowDefinition): NodeId {
    const firstTrigger = wf.nodes.find((n) => n.kind === "trigger")?.id;
    if (firstTrigger) return firstTrigger;

    const incoming = new Map<NodeId, number>();
    for (const n of wf.nodes) incoming.set(n.id, 0);
    for (const e of wf.edges) incoming.set(e.to.nodeId, (incoming.get(e.to.nodeId) ?? 0) + 1);

    const start = wf.nodes.find((n) => (incoming.get(n.id) ?? 0) === 0)?.id;
    return start ?? wf.nodes[0]?.id ?? (() => { throw new Error(`Workflow ${wf.id} has no nodes`); })();
  }
}

