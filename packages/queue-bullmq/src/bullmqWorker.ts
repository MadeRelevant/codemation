import type {
  BinaryStorage,
  CredentialSessionService,
  Items,
  Node,
  NodeActivationContinuation,
  NodeExecutionContext,
  NodeResolver,
  NodeOutputs,
  RunStateStore,
  WorkflowDefinition,
  WorkflowId,
} from "@codemation/core";
import { DefaultExecutionContextFactory, InMemoryRunDataFactory, UnavailableBinaryStorage } from "@codemation/core";
import type { Job } from "bullmq";
import { Worker } from "bullmq";

import type { RedisConnectionConfig } from "./redisConnection";
import { RedisConnectionOptionsFactory } from "./redisConnection";

type NodeExecutionJobData = Readonly<{
  kind: "nodeExecution";
  request: Readonly<{
    runId: string;
    activationId: string;
    workflowId: WorkflowId;
    nodeId: string;
    input: Items;
    parent?: unknown;
  }>;
}>;

export class BullmqWorker {
  private readonly queuePrefix: string;
  private readonly connection: Readonly<Record<string, unknown>>;
  private readonly now: () => Date;

  private readonly workflowsById: ReadonlyMap<WorkflowId, WorkflowDefinition>;
  private readonly nodeResolver: NodeResolver;
  private readonly credentialSessions: CredentialSessionService;
  private readonly runStore: RunStateStore;
  private readonly continuation: NodeActivationContinuation;
  private readonly workflows: unknown;
  private readonly binaryStorage: BinaryStorage;

  private readonly runDataFactory = new InMemoryRunDataFactory();
  private readonly workers: Worker[] = [];

  constructor(
    connection: RedisConnectionConfig,
    queues: ReadonlyArray<string>,
    workflowsById: ReadonlyMap<WorkflowId, WorkflowDefinition>,
    nodeResolver: NodeResolver,
    credentialSessions: CredentialSessionService,
    runStore: RunStateStore,
    continuation: NodeActivationContinuation,
    queuePrefix: string = "codemation",
    workflows: unknown = undefined,
    now: () => Date = () => new Date(),
    binaryStorage: BinaryStorage = new UnavailableBinaryStorage(),
  ) {
    this.connection = RedisConnectionOptionsFactory.fromConfig(connection);
    this.queuePrefix = queuePrefix;
    this.workflowsById = workflowsById;
    this.nodeResolver = nodeResolver;
    this.credentialSessions = credentialSessions;
    this.runStore = runStore;
    this.continuation = continuation;
    this.workflows = workflows;
    this.now = now;
    this.binaryStorage = binaryStorage;

    for (const q of queues) {
      const queueName = `${this.queuePrefix}.${q}`;
      this.workers.push(
        new Worker(queueName, async (job) => await this.processJob(queueName, job as Job), {
          connection: this.connection as any,
        }),
      );
    }
  }

  async stop(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.close()));
  }

  private async processJob(queueName: string, job: Job): Promise<unknown> {
    const data = job.data as NodeExecutionJobData;
    if (!data || data.kind !== "nodeExecution") throw new Error(`Unexpected job payload for queue ${queueName}`);

    const { request } = data;
    const state = await this.runStore.load(request.runId as any);
    if (!state) throw new Error(`Unknown runId: ${request.runId}`);
    if (state.workflowId !== request.workflowId) throw new Error(`workflowId mismatch for run ${request.runId}: ${state.workflowId} vs ${request.workflowId}`);

    const wf = this.workflowsById.get(request.workflowId);
    if (!wf) throw new Error(`Unknown workflowId: ${request.workflowId}`);
    const def = wf.nodes.find((n) => n.id === request.nodeId);
    if (!def) throw new Error(`Unknown nodeId: ${request.nodeId}`);
    if (def.kind !== "node") throw new Error(`Node ${request.nodeId} is not runnable`);

    const node = this.nodeResolver.resolve(def.type) as Node<any>;
    const outputsByNode = (state.outputsByNode ?? {}) as Record<string, any>;
    const dataStore = this.runDataFactory.create(outputsByNode as any);

    const base = new DefaultExecutionContextFactory(this.binaryStorage, this.now).create({
      runId: request.runId,
      workflowId: request.workflowId,
      parent: (request.parent ?? state.parent) as any,
      data: dataStore,
      getCredential: async <TSession = unknown>(slotKey: string): Promise<TSession> => {
        return await this.credentialSessions.getSession<TSession>({
          workflowId: request.workflowId,
          nodeId: request.nodeId as any,
          slotKey,
        });
      },
    });

    const ctx: NodeExecutionContext<any> = {
      ...base,
      nodeId: request.nodeId,
      activationId: request.activationId,
      config: def.config as any,
      now: this.now,
      binary: base.binary.forNode({ nodeId: request.nodeId, activationId: request.activationId as any }),
      getCredential: async <TSession = unknown>(slotKey: string): Promise<TSession> => {
        return await this.credentialSessions.getSession<TSession>({
          workflowId: request.workflowId,
          nodeId: request.nodeId as any,
          slotKey,
        });
      },
    };

    try {
      await this.continuation.markNodeRunning({
        runId: request.runId as any,
        activationId: request.activationId as any,
        nodeId: request.nodeId as any,
        inputsByPort: { in: request.input },
      });
      const outputs = (await node.execute(request.input, ctx as any)) as NodeOutputs;
      return await this.continuation.resumeFromNodeResult({
        runId: request.runId as any,
        activationId: request.activationId as any,
        nodeId: request.nodeId as any,
        outputs,
      });
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      return await this.continuation.resumeFromNodeError({
        runId: request.runId as any,
        activationId: request.activationId as any,
        nodeId: request.nodeId as any,
        error: e,
      });
    }
  }
}

