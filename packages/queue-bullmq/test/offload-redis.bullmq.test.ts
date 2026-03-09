import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";

import type { EngineHost, Items, Node, NodeConfigBase, NodeExecutionContext, NodeOutputs, TypeToken, WorkflowDefinition, WorkflowId } from "@codemation/core";
import { ConfigDrivenOffloadPolicy, Engine, InMemoryCredentialService, InMemoryRunStateStore, SimpleContainerFactory } from "@codemation/core";
import { GenericContainer } from "testcontainers";

import { BullmqScheduler } from "../src/bullmqScheduler";

class IdFactory {
  static makeRunId(): string {
    return `run_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
  static makeActivationId(): string {
    return `act_${Date.now()}_${Math.random().toString(16).slice(2)}`;
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

class TestHost implements EngineHost {
  workflows: any;
  constructor(public readonly credentials: InMemoryCredentialService) {}

  registerWebhook(): any {
    throw new Error("not used");
  }

  onNodeActivation(): void {}
}

test("e2e: node offloads to Redis (BullMQ) and completes", async (t) => {
  const queuePrefix = "codemation";
  const redisUrl = process.env.REDIS_URL ?? (await maybeStartRedisContainer(t));
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
  const container = SimpleContainerFactory.create();
  const credentials = new InMemoryCredentialService();
  const runStore = new InMemoryRunStateStore();

  const scheduler = new BullmqScheduler({ url: redisUrl }, queuePrefix);
  const host = new TestHost(credentials);
  const engine = new Engine(container, host as any, IdFactory.makeRunId as any, IdFactory.makeActivationId as any, "/webhooks", runStore, undefined, scheduler, new ConfigDrivenOffloadPolicy("worker"));
  host.workflows = undefined;
  engine.loadWorkflows([wf]);

  const worker = scheduler.createWorker({
    queues: ["default"],
    workflowsById,
    container,
    credentials,
    runStore,
    continuation: engine,
  });
  t.after(async () => {
    await worker.stop();
    await scheduler.close();
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

async function maybeStartRedisContainer(t: TestContext): Promise<string | undefined> {
  try {
    const container = await new GenericContainer("redis:7-alpine").withExposedPorts(6379).start();
    t.after(async () => {
      await container.stop();
    });
    const host = container.getHost();
    const port = container.getMappedPort(6379);
    return `redis://${host}:${port}`;
  } catch (err) {
    t.skip(`Docker not available for Redis container: ${String(err)}`);
    return undefined;
  }
}

