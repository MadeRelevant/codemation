import assert from "node:assert/strict";
import { test } from "vitest";

import type { Items, Node, NodeOutputs, RunnableNodeConfig, TypeToken } from "../../src/index.ts";
import { node, tool } from "../../src/index.ts";
import { PersistedWorkflowTokenRegistry } from "../../src/bootstrap/index.ts";
import { InMemoryLiveWorkflowRepository, PersistedWorkflowSnapshotFactory } from "../../src/testing.ts";
import { MissingRuntimeFallbacks } from "../../src/workflowSnapshots/MissingRuntimeFallbacksFactory";
import { WorkflowSnapshotCodec } from "../../src/workflowSnapshots/WorkflowSnapshotCodec";
import { WorkflowSnapshotResolver } from "../../src/workflowSnapshots/WorkflowSnapshotResolver";
import {
  CallbackNodeConfig,
  CapturingScheduler,
  chain,
  createEngineTestKit,
  items,
  pollRunStoreUntilPendingNode,
} from "../harness/index.ts";

@tool({ packageName: "@codemation/test" })
class NestedTokenDependency {}

class NestedToolConfig {
  readonly type: TypeToken<unknown> = NestedTokenDependency;

  constructor(public readonly name: string) {}
}

class NestedChatModelConfig {
  readonly type: TypeToken<unknown> = NestedTokenDependency;

  constructor(public readonly name: string) {}
}

class SnapshotTokenNodeConfig implements RunnableNodeConfig {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = SnapshotTokenNode;

  constructor(
    public readonly name: string,
    public readonly chatModel: NestedChatModelConfig,
    public readonly tools: ReadonlyArray<NestedToolConfig>,
    public readonly id?: string,
  ) {}
}

@node({ packageName: "@codemation/test" })
class SnapshotTokenNode implements Node<SnapshotTokenNodeConfig> {
  readonly kind = "node" as const;
  readonly outputPorts = ["main"] as const;

  async execute(items: Items): Promise<NodeOutputs> {
    return { main: items };
  }
}

test("engine can offload a node (pending) and resume later", async () => {
  const events: string[] = [];

  const n1 = new CallbackNodeConfig("n1", () => events.push("n1"), { id: "n1" });
  const n2 = new CallbackNodeConfig("n2", () => events.push("n2"), {
    id: "n2",
    execution: { hint: "worker", queue: "q.default" },
  });
  const n3 = new CallbackNodeConfig("n3", () => events.push("n3"), { id: "n3" });

  const wf = chain({ id: "wf.offload", name: "Offload" }).start(n1).then(n2).then(n3).build();

  const kit = createEngineTestKit();
  await kit.start([wf]);

  const r1 = await kit.engine.runWorkflow(wf, "n1", items([{ a: 1 }]), undefined);
  assert.equal(r1.status, "pending");
  await pollRunStoreUntilPendingNode(kit.runStore, r1.runId, "n2");
  assert.equal(events.join(","), "n1");

  const storedPending = await kit.runStore.load(r1.runId);
  assert.ok(storedPending);
  assert.equal(storedPending.status, "pending");
  assert.equal(storedPending.pending?.nodeId, "n2");

  const scheduler = kit.scheduler as CapturingScheduler;
  assert.ok(scheduler.lastRequest);
  assert.equal(scheduler.lastRequest.nodeId, "n2");
  assert.equal(scheduler.lastRequest.workflowId, "wf.offload");
  assert.equal(scheduler.lastRequest.queue, "q.default");

  const r2 = await kit.engine.resumeFromStepResult({
    runId: r1.runId,
    activationId: storedPending.pending!.activationId,
    nodeId: "n2",
    outputs: { main: items([{ ok: true }]) },
  });

  assert.equal(r2.status, "pending");
  const done = await kit.engine.waitForCompletion(r1.runId);
  assert.equal(done.status, "completed");
  assert.equal(events.join(","), "n1,n3"); // n2 was offloaded, so its callback never ran locally
  assert.equal(done.outputs.length, 1);

  const storedDone = await kit.runStore.load(r1.runId);
  assert.ok(storedDone);
  assert.equal(storedDone.status, "completed");
  assert.equal(storedDone.nodeSnapshotsByNodeId.n1?.status, "completed");
  assert.equal(storedDone.nodeSnapshotsByNodeId.n2?.status, "completed");
  assert.equal(storedDone.nodeSnapshotsByNodeId.n3?.status, "completed");
});

test("engine can execute an offloaded node through the queued execution handler", async () => {
  const events: string[] = [];
  const n1 = new CallbackNodeConfig("n1", () => events.push("n1"), { id: "n1" });
  const n2 = new CallbackNodeConfig("n2", () => events.push("n2"), {
    id: "n2",
    execution: { hint: "worker", queue: "q.default" },
  });
  const n3 = new CallbackNodeConfig("n3", () => events.push("n3"), { id: "n3" });
  const wf = chain({ id: "wf.offload.handler", name: "Offload handler" }).start(n1).then(n2).then(n3).build();

  const kit = createEngineTestKit();
  await kit.start([wf]);

  const started = await kit.engine.runWorkflow(wf, "n1", items([{ a: 1 }]), undefined);
  assert.equal(started.status, "pending");
  await pollRunStoreUntilPendingNode(kit.runStore, started.runId, "n2");

  const scheduler = kit.scheduler as CapturingScheduler;
  assert.ok(scheduler.lastRequest);

  await kit.engine.handleNodeExecutionRequest(scheduler.lastRequest);

  const completed = await kit.engine.waitForCompletion(started.runId);
  assert.equal(completed.status, "completed");
  assert.equal(events.join(","), "n1,n2,n3");

  const storedDone = await kit.runStore.load(started.runId);
  assert.ok(storedDone);
  assert.equal(storedDone.nodeSnapshotsByNodeId.n2?.status, "completed");
  assert.equal(storedDone.nodeSnapshotsByNodeId.n3?.status, "completed");
});

test("queued execution handler uses persisted work-item inputs over transport payloads", async () => {
  const seenByWorker: unknown[] = [];
  const n1 = new CallbackNodeConfig("n1", () => {}, { id: "n1" });
  const n2 = new CallbackNodeConfig("n2", ({ items }) => seenByWorker.push(items[0]?.json), {
    id: "n2",
    execution: { hint: "worker", queue: "q.default" },
  });
  const wf = chain({ id: "wf.offload.persisted.input", name: "Offload persisted input" }).start(n1).then(n2).build();

  const kit = createEngineTestKit();
  await kit.start([wf]);

  const started = await kit.engine.runWorkflow(wf, "n1", items([{ a: 1 }]), undefined);
  assert.equal(started.status, "pending");
  await pollRunStoreUntilPendingNode(kit.runStore, started.runId, "n2");

  const scheduler = kit.scheduler as CapturingScheduler;
  assert.ok(scheduler.lastRequest);
  scheduler.lastRequest = {
    ...scheduler.lastRequest,
    input: items([{ a: 999 }]),
  };

  await kit.engine.handleNodeExecutionRequest(scheduler.lastRequest);
  const completed = await kit.engine.waitForCompletion(started.runId);

  assert.equal(completed.status, "completed");
  assert.deepEqual(seenByWorker, [{ a: 1 }]);
});

test("engine persists workflow snapshots and execution mode metadata", async () => {
  const n1 = new CallbackNodeConfig("n1", () => {}, { id: "n1", execution: { hint: "worker" } });
  const n2 = new CallbackNodeConfig("n2", () => {}, { id: "n2" });
  const wf = chain({ id: "wf.snapshot.meta", name: "Snapshot metadata" }).start(n1).then(n2).build();

  const kit = createEngineTestKit();
  await kit.start([wf]);

  const result = await kit.engine.runWorkflow(
    wf,
    "n1",
    items([{ hello: "world" }]),
    undefined,
    {
      mode: "debug",
      sourceWorkflowId: wf.id,
      isMutable: true,
    },
    {
      mutableState: {
        nodesById: {
          n1: {
            pinnedOutputsByPort: { main: items([{ pinned: true }]) },
          },
        },
      },
    },
  );

  assert.equal(result.status, "pending");
  const stored = await kit.runStore.load(result.runId);
  assert.ok(stored);
  assert.equal(stored.executionOptions?.mode, "debug");
  assert.equal(stored.executionOptions?.sourceWorkflowId, wf.id);
  assert.equal(stored.workflowSnapshot?.id, wf.id);
  assert.deepEqual(
    stored.mutableState?.nodesById.n1?.pinnedOutputsByPort?.main?.map((item) => item.json),
    [{ pinned: true }],
  );
  assert.deepEqual(
    stored.workflowSnapshot?.nodes.map((node) => node.id),
    ["n1", "n2"],
  );
  assert.deepEqual(stored.workflowSnapshot?.edges, wf.edges);
});

test("engine resumes from stored workflow snapshots and skips nodes missing from live code", async () => {
  const n1 = new CallbackNodeConfig("n1", () => {}, {
    id: "n1",
    execution: { hint: "worker", queue: "q.default" },
  });
  const n2 = new CallbackNodeConfig("n2", () => {}, { id: "n2" });
  const n3 = new CallbackNodeConfig("n3", () => {}, { id: "n3" });
  const originalWorkflow = chain({ id: "wf.snapshot.resume", name: "Snapshot resume" })
    .start(n1)
    .then(n2)
    .then(n3)
    .build();

  const kit = createEngineTestKit();
  await kit.start([originalWorkflow]);

  const scheduled = await kit.engine.runWorkflow(originalWorkflow, "n1", items([{ step: 1 }]), undefined);
  assert.equal(scheduled.status, "pending");
  const storedPending = await kit.runStore.load(scheduled.runId);
  assert.ok(storedPending?.workflowSnapshot);

  const updatedWorkflow = chain({ id: "wf.snapshot.resume", name: "Snapshot resume updated" })
    .start(n1)
    .then(n3)
    .build();
  await kit.start([updatedWorkflow]);

  const resumed = await kit.engine.resumeFromStepResult({
    runId: scheduled.runId,
    activationId: storedPending!.pending!.activationId,
    nodeId: "n1",
    outputs: { main: items([{ step: 2 }]) },
  });

  assert.equal(resumed.status, "pending");
  const done = await kit.engine.waitForCompletion(scheduled.runId);
  assert.equal(done.status, "completed");
  assert.deepEqual(
    done.outputs.map((item) => item.json),
    [{ step: 2 }],
  );

  const storedDone = await kit.runStore.load(scheduled.runId);
  assert.ok(storedDone);
  assert.equal(storedDone.nodeSnapshotsByNodeId.n2?.status, "skipped");
  assert.deepEqual(
    storedDone.nodeSnapshotsByNodeId.n2?.outputs?.main?.map((item) => item.json),
    [{ step: 2 }],
  );
  assert.equal(storedDone.nodeSnapshotsByNodeId.n3?.status, "completed");
});

test("persisted workflow resolver preserves nested dependency tokens from live configs", () => {
  const workflow = chain({ id: "wf.snapshot.tokens", name: "Snapshot tokens" })
    .start(
      new SnapshotTokenNodeConfig("agent", new NestedChatModelConfig("chat"), [new NestedToolConfig("tool")], "agent"),
    )
    .build();
  const tokenRegistry = new PersistedWorkflowTokenRegistry();
  tokenRegistry.registerFromWorkflows([workflow]);
  const snapshot = new PersistedWorkflowSnapshotFactory(tokenRegistry).create(workflow);
  const registry = new InMemoryLiveWorkflowRepository();
  registry.setWorkflows([workflow]);

  assert.equal(
    (snapshot.nodes[0]?.config as { chatModel?: { type?: unknown } } | undefined)?.chatModel?.type,
    undefined,
  );
  assert.equal(
    (snapshot.nodes[0]?.config as { tools?: ReadonlyArray<{ type?: unknown }> } | undefined)?.tools?.[0]?.type,
    undefined,
  );

  const resolved = new WorkflowSnapshotResolver(
    registry,
    tokenRegistry,
    new WorkflowSnapshotCodec(tokenRegistry),
    new MissingRuntimeFallbacks(),
  ).resolve({
    workflowId: workflow.id,
    workflowSnapshot: snapshot,
  });
  const config = resolved?.nodes[0]?.config as SnapshotTokenNodeConfig | undefined;

  assert.ok(config);
  assert.equal(config.chatModel.type, NestedTokenDependency);
  assert.equal(config.tools[0]?.type, NestedTokenDependency);
});
