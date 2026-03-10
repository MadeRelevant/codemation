import type {
  Container,
  CredentialService,
  EngineDeps,
  EngineHost,
  ExecutionContextFactory,
  NodeExecutionRequest,
  NodeExecutionScheduler,
  NodeOffloadPolicy,
  RunEventBus,
  RunDataFactory,
  RunResult,
  RunStateStore,
  WorkflowDefinition,
  WorkflowGraphFactory,
} from "../../dist/index.js";

import {
  DefaultExecutionContextFactory,
  Engine,
  EngineWorkflowRunnerService,
  HintOnlyOffloadPolicy,
  InMemoryCredentialService,
  InMemoryRunDataFactory,
  InMemoryRunStateStore,
  SimpleContainerFactory,
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

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
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
  eventBus: RunEventBus;
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
      credentials: options.credentials ?? new InMemoryCredentialService(),
      workflows: undefined,
      registerWebhook() {
        throw new Error("not used");
      },
      onNodeActivation(stats: any) {
        activations.push(stats);
      },
    } satisfies EngineHost as any);

  const container = options.container ?? SimpleContainerFactory.create();

  const runDataFactory = options.runDataFactory ?? new InMemoryRunDataFactory();
  const executionContextFactory = options.executionContextFactory ?? new DefaultExecutionContextFactory();

  const engine = new Engine(
    container,
    host as any,
    makeRunId as any,
    makeActivationId as any,
    options.webhookBasePath ?? "/webhooks",
    runStore,
    undefined,
    scheduler,
    offloadPolicy,
    runDataFactory,
    executionContextFactory,
    options.eventBus,
  );

  const workflowRunner = options.workflowRunner ?? new EngineWorkflowRunnerService(engine, workflowsById as any);
  host.workflows = workflowRunner;

  async function start(workflows: WorkflowDefinition[]): Promise<void> {
    for (const wf of workflows) workflowsById.set(wf.id, wf);
    await engine.start(workflows);
  }

  async function waitForActivations(count: number, timeoutMs = 1000): Promise<void> {
    const startAtNs = process.hrtime.bigint();
    while (activations.length < count) {
      const elapsedMs = Number(process.hrtime.bigint() - startAtNs) / 1_000_000;
      if (elapsedMs > timeoutMs) throw new Error(`Timed out waiting for activations: expected ${count}, got ${activations.length}`);
      await sleep(0);
    }
  }

  async function runToCompletion(args: { wf: WorkflowDefinition; startAt: string; items: any; parent?: any }): Promise<RunResult> {
    const r0 = await engine.runWorkflow(args.wf, args.startAt as any, args.items, args.parent);
    if (r0.status !== "pending") return r0;
    return await engine.waitForCompletion(r0.runId);
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
    waitForActivations,
    runToCompletion,
    makeRunId,
    makeActivationId,
  };
}

