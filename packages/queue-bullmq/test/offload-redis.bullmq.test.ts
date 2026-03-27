import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import net from "node:net";
import { type TestContext, onTestFinished, test } from "vitest";

import type {
  Items,
  Node,
  NodeExecutionContext,
  NodeOutputs,
  PersistedTriggerSetupState,
  RunnableNodeConfig,
  TriggerSetupStateStore,
  TypeToken,
  WorkflowId,
} from "@codemation/core";
import {
  AllWorkflowsActiveWorkflowActivationPolicy,
  ConfigDrivenOffloadPolicy,
  ContainerNodeResolver,
  ContainerWorkflowRunnerResolver,
  CoreTokens,
  DefaultDrivingScheduler,
  DefaultExecutionContextFactory,
  EngineFactory,
  EngineWorkflowRunnerService,
  InMemoryRunDataFactory,
  InMemoryRunEventBus,
  InMemoryRunStateStore,
  WorkflowCatalogWebhookTriggerMatcher,
  InlineDrivingScheduler,
  NodeInstanceFactory,
  PersistedWorkflowTokenRegistry,
  UnavailableCredentialSessionService,
  WorkflowBuilder,
  container as tsyringeContainer,
} from "@codemation/core";
import { InMemoryWorkflowRegistry } from "@codemation/core/testing";
import { GenericContainer } from "testcontainers";

import { BullmqScheduler } from "../src/bullmqScheduler";

class IdFactory {
  private static runSequence = 0;
  private static activationSequence = 0;

  static makeRunId(): string {
    this.runSequence += 1;
    return `run_${this.runSequence}`;
  }
  static makeActivationId(): string {
    this.activationSequence += 1;
    return `act_${this.activationSequence}`;
  }
}

class UppercaseSubject<
  TItemJson extends Record<string, unknown> = Record<string, unknown>,
> implements RunnableNodeConfig<TItemJson, TItemJson> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = UppercaseSubjectNode;
  readonly execution = { hint: "worker" as const, queue: "default" as const };
  constructor(
    public readonly name: string,
    public readonly id: string,
  ) {}
}

class UppercaseSubjectNode implements Node<UppercaseSubject<Record<string, unknown>>> {
  kind = "node" as const;
  outputPorts = ["main"] as const;

  async execute(
    items: Items,
    _ctx: NodeExecutionContext<UppercaseSubject<Record<string, unknown>>>,
  ): Promise<NodeOutputs> {
    return {
      main: items.map((it) => {
        const json = (it.json && typeof it.json === "object" ? (it.json as Record<string, unknown>) : {}) as Record<
          string,
          unknown
        >;
        const subject = String(json.subject ?? "");
        return { ...it, json: { ...json, subject: subject.toUpperCase() } };
      }),
    };
  }
}

class InMemoryTriggerSetupStateStore implements TriggerSetupStateStore {
  private readonly statesByKey = new Map<string, PersistedTriggerSetupState>();

  async load(trigger: { workflowId: string; nodeId: string }): Promise<PersistedTriggerSetupState | undefined> {
    return this.statesByKey.get(`${trigger.workflowId}:${trigger.nodeId}`);
  }

  async save(state: PersistedTriggerSetupState): Promise<void> {
    this.statesByKey.set(`${state.trigger.workflowId}:${state.trigger.nodeId}`, state);
  }

  async delete(trigger: { workflowId: string; nodeId: string }): Promise<void> {
    this.statesByKey.delete(`${trigger.workflowId}:${trigger.nodeId}`);
  }
}

test("e2e: node offloads to Redis (BullMQ) and completes", async (t) => {
  if (process.env.CI === "true" && !process.env.REDIS_URL) {
    throw new Error(
      "CI must set REDIS_URL (use the GitHub Actions redis service); do not rely on Testcontainers here.",
    );
  }

  const queuePrefix = `codemation_${randomBytes(8).toString("hex")}`;
  const startedRedisContainer = process.env.REDIS_URL ? undefined : await maybeStartRedisContainer(t);
  const redisUrl = process.env.REDIS_URL ?? startedRedisContainer?.redisUrl;
  if (!redisUrl) return;

  const u = new URL(redisUrl);
  const hostName = u.hostname;
  const port = u.port ? Number(u.port) : 6379;
  const connectTimeoutMs = process.env.CI === "true" ? 15_000 : 2000;
  if (!(await TcpHealthCheck.canConnect(hostName, port, connectTimeoutMs))) {
    t.skip(`Redis not reachable at ${hostName}:${port}`);
    return;
  }

  const wf = new WorkflowBuilder({
    id: "wf.e2e.offload" as WorkflowId,
    name: "E2E offload (in-process)",
  })
    .start(new UppercaseSubject("Uppercase", "uppercase"))
    .build();

  const workflowsById = new Map([[wf.id, wf] as const]);
  const container = tsyringeContainer.createChildContainer();
  container.register(UppercaseSubjectNode, { useClass: UppercaseSubjectNode });
  container.register(EngineFactory, { useClass: EngineFactory });
  const credentialSessions = new UnavailableCredentialSessionService();
  const runStore = new InMemoryRunStateStore();
  const scheduler = new BullmqScheduler({ url: redisUrl }, queuePrefix);
  const workflowCatalog = new InMemoryWorkflowRegistry();
  const triggerSetupStateStore = new InMemoryTriggerSetupStateStore();
  workflowCatalog.setWorkflows([wf]);
  const nodeResolver = new ContainerNodeResolver(container);
  const workflowRunnerResolver = new ContainerWorkflowRunnerResolver(container);
  const activationScheduler = new DefaultDrivingScheduler(
    new ConfigDrivenOffloadPolicy("worker"),
    scheduler,
    new InlineDrivingScheduler(nodeResolver),
  );
  const eventBus = new InMemoryRunEventBus();
  const tokenRegistry = new PersistedWorkflowTokenRegistry();
  const workflowActivationPolicy = new AllWorkflowsActiveWorkflowActivationPolicy();
  const webhookTriggerMatcher = new WorkflowCatalogWebhookTriggerMatcher(workflowCatalog, workflowActivationPolicy);
  const workflowNodeInstanceFactory = new NodeInstanceFactory(nodeResolver);
  container.registerInstance(CoreTokens.ServiceContainer, container);
  container.registerInstance(CoreTokens.CredentialSessionService, credentialSessions);
  container.registerInstance(CoreTokens.WorkflowCatalog, workflowCatalog);
  container.registerInstance(CoreTokens.WorkflowRegistry, workflowCatalog);
  container.registerInstance(CoreTokens.WorkflowRepository, workflowCatalog);
  container.registerInstance(CoreTokens.NodeResolver, nodeResolver);
  container.registerInstance(CoreTokens.WorkflowRunnerResolver, workflowRunnerResolver);
  container.registerInstance(CoreTokens.RunIdFactory, IdFactory);
  container.registerInstance(CoreTokens.ActivationIdFactory, IdFactory);
  container.registerInstance(CoreTokens.WebhookBasePath, "/webhooks");
  container.registerInstance(CoreTokens.RunStateStore, runStore);
  container.registerInstance(CoreTokens.TriggerSetupStateStore, triggerSetupStateStore);
  container.registerInstance(CoreTokens.NodeActivationScheduler, activationScheduler);
  container.registerInstance(CoreTokens.RunDataFactory, new InMemoryRunDataFactory());
  container.registerInstance(CoreTokens.ExecutionContextFactory, new DefaultExecutionContextFactory());
  container.registerInstance(CoreTokens.RunEventBus, eventBus);
  container.registerInstance(CoreTokens.PersistedWorkflowTokenRegistry, tokenRegistry);
  const engine = container.resolve(EngineFactory).create({
    credentialSessions,
    workflowRunnerResolver,
    workflowCatalog,
    workflowRepository: workflowCatalog,
    workflowActivationPolicy,
    nodeResolver,
    webhookTriggerMatcher,
    runIdFactory: IdFactory,
    activationIdFactory: IdFactory,
    runStore,
    triggerSetupStateStore,
    activationScheduler,
    runDataFactory: new InMemoryRunDataFactory(),
    executionContextFactory: new DefaultExecutionContextFactory(),
    eventBus,
    tokenRegistry,
    workflowNodeInstanceFactory,
  });
  const workflowRunner = new EngineWorkflowRunnerService(engine, workflowCatalog);
  container.registerInstance(CoreTokens.WorkflowRunnerService, workflowRunner);
  await engine.start([wf]);

  const worker = scheduler.createWorker({
    queues: ["default"],
    workflowsById,
    nodeResolver,
    credentialSessions,
    runStore,
    continuation: engine,
    workflows: workflowRunner,
  });
  await worker.waitUntilReady();

  onTestFinished(async () => {
    await worker.stop();
    await scheduler.close();
    await startedRedisContainer?.stop();
  });

  const started = await engine.runWorkflow(wf, "uppercase" as any, [{ json: { subject: "hello" } }], undefined);
  assert.equal(started.status, "pending");

  const done = await engine.waitForCompletion(started.runId);
  assert.equal(done.status, "completed");
  assert.equal((done.outputs[0]?.json as any)?.subject, "HELLO");
});

class TcpHealthCheck {
  static async canConnect(host: string, port: number, timeoutMs: number): Promise<boolean> {
    return await new Promise((resolve) => {
      const sock = net.connect({ host, port });
      const done = (ok: boolean) => {
        sock.removeAllListeners();
        sock.destroy();
        resolve(ok);
      };
      sock.once("connect", () => done(true));
      sock.once("error", () => done(false));
      sock.setTimeout(timeoutMs, () => done(false));
    });
  }
}

type StartedRedisContainer = Readonly<{
  redisUrl: string;
  stop: () => Promise<void>;
}>;

async function maybeStartRedisContainer(t: TestContext): Promise<StartedRedisContainer | undefined> {
  try {
    const container = await new GenericContainer("redis:7-alpine").withExposedPorts(6379).start();
    const host = container.getHost();
    const port = container.getMappedPort(6379);
    return {
      redisUrl: `redis://${host}:${port}`,
      stop: async () => {
        await container.stop();
      },
    };
  } catch (err) {
    t.skip(`Docker not available for Redis container: ${String(err)}`);
    return undefined;
  }
}
