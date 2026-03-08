import type {
  Container,
  CredentialService,
  EngineDeps,
  EngineHost,
  ExecutionContextFactory,
  NodeExecutionRequest,
  NodeExecutionScheduler,
  NodeOffloadPolicy,
  RunDataFactory,
  RunStateStore,
  WorkflowDefinition,
  WorkflowGraphFactory,
} from "../../dist/index.js";

import {
  Engine,
  EngineWorkflowRunnerService,
  HintOnlyOffloadPolicy,
  InMemoryRunStateStore,
  createSimpleContainer,
} from "../../dist/index.js";

export class CapturingScheduler implements NodeExecutionScheduler {
  lastRequest: NodeExecutionRequest | undefined;
  requests: NodeExecutionRequest[] = [];

  async enqueue(request: NodeExecutionRequest): Promise<{ receiptId: string }> {
    this.lastRequest = request;
    this.requests.push(request);
    return { receiptId: `receipt_${this.requests.length}` };
  }
}

function makeCounter(prefix: string): () => string {
  let i = 0;
  return () => `${prefix}${++i}`;
}

export type EngineTestKitOptions = Partial<{
  container: Container;
  providers: Map<EngineDeps["container"] extends Container ? any : never, unknown>;
  host: EngineHost & { workflows?: any };
  credentials: CredentialService;
  runStore: RunStateStore;
  scheduler: NodeExecutionScheduler;
  offloadPolicy: NodeOffloadPolicy;
  graphFactory: WorkflowGraphFactory;
  runDataFactory: RunDataFactory;
  executionContextFactory: ExecutionContextFactory;
  webhookBasePath: string;
  makeRunId: () => string;
  makeActivationId: () => string;
  workflowRunner: EngineWorkflowRunnerService;
}>;

export function createEngineTestKit(options: EngineTestKitOptions = {}) {
  const activations: Array<any> = [];
  const workflowsById = new Map<string, WorkflowDefinition>();

  const runStore = options.runStore ?? new InMemoryRunStateStore();
  const scheduler = options.scheduler ?? new CapturingScheduler();
  const offloadPolicy = options.offloadPolicy ?? new HintOnlyOffloadPolicy();

  const makeRunId = options.makeRunId ?? makeCounter("run_");
  const makeActivationId = options.makeActivationId ?? makeCounter("act_");

  const host: EngineHost & { workflows?: any } =
    options.host ??
    ({
      credentials: options.credentials ?? { async get() { return {}; } },
      workflows: undefined,
      registerWebhook() {
        throw new Error("not used");
      },
      onNodeActivation(stats: any) {
        activations.push(stats);
      },
    } satisfies EngineHost as any);

  const container = options.container ?? createSimpleContainer();

  const engine = new Engine({
    container,
    host,
    makeRunId: makeRunId as any,
    makeActivationId: makeActivationId as any,
    webhookBasePath: options.webhookBasePath,
    runStore,
    scheduler,
    offloadPolicy,
    graphFactory: options.graphFactory,
    runDataFactory: options.runDataFactory,
    executionContextFactory: options.executionContextFactory,
  } as any);

  const workflowRunner = options.workflowRunner ?? new EngineWorkflowRunnerService(engine, workflowsById as any);
  host.workflows = workflowRunner;

  async function start(workflows: WorkflowDefinition[]): Promise<void> {
    for (const wf of workflows) workflowsById.set(wf.id, wf);
    await engine.start(workflows);
  }

  return {
    engine,
    host,
    runStore,
    scheduler: scheduler as CapturingScheduler | NodeExecutionScheduler,
    offloadPolicy,
    activations,
    workflowsById,
    workflowRunner,
    start,
    makeRunId,
    makeActivationId,
  };
}

