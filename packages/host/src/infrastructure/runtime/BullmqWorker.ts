import type {
  BinaryStorage,
  CredentialSessionService,
  Items,
  Node,
  NodeActivationContinuation,
  NodeConfigBase,
  NodeExecutionContext,
  NodeOutputs,
  NodeResolver,
  WorkflowExecutionRepository,
  WorkflowDefinition,
  WorkflowId,
} from "@codemation/core";
import {
  DefaultAsyncSleeper,
  DefaultExecutionContextFactory,
  EngineExecutionLimitsPolicy,
  InMemoryRunDataFactory,
  InProcessRetryRunner,
  UnavailableBinaryStorage,
} from "@codemation/core/bootstrap";
import type { Job } from "bullmq";
import { Worker } from "bullmq";
import type { RedisConnectionConfig } from "./RedisConnectionOptionsFactory";
import { RedisConnectionOptionsFactory } from "./RedisConnectionOptionsFactory";

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
  private readonly connection: Readonly<Record<string, unknown>>;
  private readonly workers: Worker[] = [];
  private readonly runDataFactory = new InMemoryRunDataFactory();
  private readonly retryRunner: InProcessRetryRunner;

  constructor(
    connection: RedisConnectionConfig,
    queues: ReadonlyArray<string>,
    private readonly workflowsById: ReadonlyMap<WorkflowId, WorkflowDefinition>,
    private readonly nodeResolver: NodeResolver,
    private readonly credentialSessions: CredentialSessionService,
    private readonly workflowExecutionRepository: WorkflowExecutionRepository,
    private readonly continuation: NodeActivationContinuation,
    private readonly queuePrefix: string = "codemation",
    private readonly workflows: unknown = undefined,
    private readonly now: () => Date = () => new Date(),
    private readonly binaryStorage: BinaryStorage = new UnavailableBinaryStorage(),
    retryRunner: InProcessRetryRunner = new InProcessRetryRunner(new DefaultAsyncSleeper()),
    private readonly executionLimitsPolicy: EngineExecutionLimitsPolicy = new EngineExecutionLimitsPolicy(),
  ) {
    this.connection = RedisConnectionOptionsFactory.fromConfig(connection);
    this.retryRunner = retryRunner;
    for (const queue of queues) {
      const queueName = `${this.queuePrefix}.${queue}`;
      this.workers.push(
        new Worker(queueName, async (job: Job) => await this.processJob(queueName, job), {
          connection: this.connection as never,
        }),
      );
    }
  }

  async waitUntilReady(): Promise<void> {
    await Promise.all(this.workers.map((worker) => worker.waitUntilReady()));
  }

  async stop(): Promise<void> {
    await Promise.all(this.workers.map((worker) => worker.close()));
  }

  private async processJob(queueName: string, job: Job): Promise<unknown> {
    const data = job.data as NodeExecutionJobData;
    if (!data || data.kind !== "nodeExecution") {
      throw new Error(`Unexpected job payload for queue ${queueName}`);
    }
    const { request } = data;
    const state = await this.workflowExecutionRepository.load(request.runId as never);
    if (!state) {
      throw new Error(`Unknown runId: ${request.runId}`);
    }
    if (state.workflowId !== request.workflowId) {
      throw new Error(`workflowId mismatch for run ${request.runId}: ${state.workflowId} vs ${request.workflowId}`);
    }
    const workflow = this.workflowsById.get(request.workflowId);
    if (!workflow) {
      throw new Error(`Unknown workflowId: ${request.workflowId}`);
    }
    const definition = workflow.nodes.find((node) => node.id === request.nodeId);
    if (!definition) {
      throw new Error(`Unknown nodeId: ${request.nodeId}`);
    }
    if (definition.kind !== "node") {
      throw new Error(`Node ${request.nodeId} is not runnable`);
    }
    const node = this.nodeResolver.resolve(definition.type) as Node<NodeConfigBase>;
    const outputsByNode = (state.outputsByNode ?? {}) as Record<string, unknown>;
    const dataStore = this.runDataFactory.create(outputsByNode as never);
    const executionOptions = state.executionOptions as
      | { subworkflowDepth?: number; maxNodeActivations?: number; maxSubworkflowDepth?: number }
      | undefined;
    const defaults = this.executionLimitsPolicy.createRootExecutionOptions();
    const baseContext = new DefaultExecutionContextFactory(this.binaryStorage, this.now).create({
      runId: request.runId,
      workflowId: request.workflowId,
      parent: (request.parent ?? state.parent) as never,
      subworkflowDepth: executionOptions?.subworkflowDepth ?? 0,
      engineMaxNodeActivations: executionOptions?.maxNodeActivations ?? defaults.maxNodeActivations!,
      engineMaxSubworkflowDepth: executionOptions?.maxSubworkflowDepth ?? defaults.maxSubworkflowDepth!,
      data: dataStore,
      getCredential: async <TSession = unknown>(slotKey: string): Promise<TSession> => {
        return await this.credentialSessions.getSession<TSession>({
          workflowId: request.workflowId,
          nodeId: request.nodeId as never,
          slotKey,
        });
      },
    });
    const context: NodeExecutionContext<NodeConfigBase> = {
      ...baseContext,
      nodeId: request.nodeId,
      activationId: request.activationId,
      config: definition.config as NodeConfigBase,
      now: this.now,
      binary: baseContext.binary.forNode({ nodeId: request.nodeId, activationId: request.activationId as never }),
      getCredential: async <TSession = unknown>(slotKey: string): Promise<TSession> => {
        return await this.credentialSessions.getSession<TSession>({
          workflowId: request.workflowId,
          nodeId: request.nodeId as never,
          slotKey,
        });
      },
    };
    try {
      await this.continuation.markNodeRunning({
        runId: request.runId as never,
        activationId: request.activationId as never,
        nodeId: request.nodeId as never,
        inputsByPort: { in: request.input },
      });
      const retryPolicy = (definition.config as NodeConfigBase).retryPolicy;
      const outputs = (await this.retryRunner.run(retryPolicy, async () =>
        node.execute(request.input, context as never),
      )) as NodeOutputs;
      return await this.continuation.resumeFromNodeResult({
        runId: request.runId as never,
        activationId: request.activationId as never,
        nodeId: request.nodeId as never,
        outputs,
      });
    } catch (error) {
      const exception = error instanceof Error ? error : new Error(String(error));
      return await this.continuation.resumeFromNodeError({
        runId: request.runId as never,
        activationId: request.activationId as never,
        nodeId: request.nodeId as never,
        error: exception,
      });
    }
  }
}
