import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";

import type { Items, Node, NodeActivationObserver, NodeConfigBase, NodeExecutionContext, NodeOutputs, TypeToken, WebhookRegistrar, WorkflowDefinition, WorkflowId } from "@codemation/core";
import {
  container as tsyringeContainer,
  ConfigDrivenOffloadPolicy,
  ContainerNodeResolver,
  ContainerWorkflowRunnerResolver,
  CoreTokens,
  DefaultDrivingScheduler,
  DefaultExecutionContextFactory,
  Engine,
  EngineWorkflowRunnerService,
  InMemoryCredentialService,
  InMemoryRunDataFactory,
  InMemoryRunEventBus,
  InMemoryRunStateStore,
  InMemoryWorkflowRegistry,
  InlineDrivingScheduler,
} from "@codemation/core";
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

class UppercaseSubject implements NodeConfigBase {
  readonly kind = "node" as const;
  readonly token: TypeToken<unknown> = UppercaseSubjectNode;
  readonly execution = { hint: "worker" as const, queue: "default" as const };
  constructor(public readonly name: string, public readonly id: string) {}
}

class UppercaseSubjectNode implements Node<UppercaseSubject> {
  kind = "node" as const;
  outputPorts = ["main"] as const;

  async execute(items: Items, _ctx: NodeExecutionContext<UppercaseSubject>): Promise<NodeOutputs> {
    return {
      main: items.map((it) => {
        const json = (it.json && typeof it.json === "object" ? (it.json as Record<string, unknown>) : {}) as Record<string, unknown>;
        const subject = String(json.subject ?? "");
        return { ...it, json: { ...json, subject: subject.toUpperCase() } };
      }),
    };
  }
}

class TestWebhookRegistrar implements WebhookRegistrar {
  registerWebhook(): never {
    throw new Error("not used");
  }
}

class NoopNodeActivationObserver implements NodeActivationObserver {
  onNodeActivation(): void {}
}

test("e2e: node offloads to Redis (BullMQ) and completes", async (t) => {
  const queuePrefix = "codemation";
  const startedRedisContainer = process.env.REDIS_URL ? undefined : await maybeStartRedisContainer(t);
  const redisUrl = process.env.REDIS_URL ?? startedRedisContainer?.redisUrl;
  if (!redisUrl) return;

  const u = new URL(redisUrl);
  const hostName = u.hostname;
  const port = u.port ? Number(u.port) : 6379;
  if (!(await TcpHealthCheck.canConnect(hostName, port, 2000))) {
    t.skip(`Redis not reachable at ${hostName}:${port}`);
    return;
  }

  const wf: WorkflowDefinition = {
    id: "wf.e2e.offload" as WorkflowId,
    name: "E2E offload (in-process)",
    nodes: [
      {
        id: "uppercase" as any,
        kind: "node",
        token: UppercaseSubjectNode,
        name: "Uppercase",
        config: new UppercaseSubject("Uppercase", "uppercase"),
      },
    ],
    edges: [],
  };

  const workflowsById = new Map([[wf.id, wf] as const]);
  const container = tsyringeContainer.createChildContainer();
  container.register(UppercaseSubjectNode, { useClass: UppercaseSubjectNode });
  const credentials = new InMemoryCredentialService();
  const runStore = new InMemoryRunStateStore();
  const scheduler = new BullmqScheduler({ url: redisUrl }, queuePrefix);
  const workflowRegistry = new InMemoryWorkflowRegistry();
  workflowRegistry.setWorkflows([wf]);
  const nodeResolver = new ContainerNodeResolver(container);
  const workflowRunnerResolver = new ContainerWorkflowRunnerResolver(container);
  const activationScheduler = new DefaultDrivingScheduler(new ConfigDrivenOffloadPolicy("worker"), scheduler, new InlineDrivingScheduler());
  const eventBus = new InMemoryRunEventBus();
  container.registerInstance(CoreTokens.ServiceContainer, container);
  container.registerInstance(CoreTokens.CredentialService, credentials);
  container.registerInstance(CoreTokens.WorkflowRegistry, workflowRegistry);
  container.registerInstance(CoreTokens.NodeResolver, nodeResolver);
  container.registerInstance(CoreTokens.WorkflowRunnerResolver, workflowRunnerResolver);
  container.registerInstance(CoreTokens.RunIdFactory, IdFactory);
  container.registerInstance(CoreTokens.ActivationIdFactory, IdFactory);
  container.registerInstance(CoreTokens.WebhookBasePath, "/webhooks");
  container.registerInstance(CoreTokens.RunStateStore, runStore);
  container.registerInstance(CoreTokens.NodeActivationScheduler, activationScheduler);
  container.registerInstance(CoreTokens.RunDataFactory, new InMemoryRunDataFactory());
  container.registerInstance(CoreTokens.ExecutionContextFactory, new DefaultExecutionContextFactory());
  container.registerInstance(CoreTokens.RunEventBus, eventBus);
  container.registerInstance(CoreTokens.WebhookRegistrar, new TestWebhookRegistrar());
  container.registerInstance(CoreTokens.NodeActivationObserver, new NoopNodeActivationObserver());
  const engine = new Engine({
    credentials,
    workflowRunnerResolver,
    workflowRegistry,
    nodeResolver,
    webhookRegistrar: new TestWebhookRegistrar(),
    nodeActivationObserver: new NoopNodeActivationObserver(),
    runIdFactory: IdFactory,
    activationIdFactory: IdFactory,
    webhookBasePath: "/webhooks",
    runStore,
    activationScheduler,
    runDataFactory: new InMemoryRunDataFactory(),
    executionContextFactory: new DefaultExecutionContextFactory(),
    eventBus,
  });
  const workflowRunner = new EngineWorkflowRunnerService(engine, workflowRegistry);
  container.registerInstance(CoreTokens.WorkflowRunnerService, workflowRunner);
  await engine.start([wf]);

  const worker = scheduler.createWorker({
    queues: ["default"],
    workflowsById,
    nodeResolver,
    credentials,
    runStore,
    continuation: engine,
    workflows: workflowRunner,
  });
  t.after(async () => {
    await worker.stop();
    await scheduler.close();
    await startedRedisContainer?.stop();
  });

  const started = await engine.runWorkflow(wf, "uppercase" as any, [{ json: { subject: "hello" } }], undefined);
  assert.equal(started.status, "pending");

  const done = await engine.waitForCompletion(started.runId);
  assert.equal(done.status, "completed");
  assert.equal(done.outputs[0]?.json?.subject, "HELLO");
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

