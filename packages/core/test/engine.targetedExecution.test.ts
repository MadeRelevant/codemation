import test from "node:test";
import assert from "node:assert/strict";

import {
  AgentAttachmentNodeIdFactory,
  type Items,
  type NodeExecutionContext,
  type NodeOutputs,
  type PersistedRunState,
  type RunStateStore,
  type TriggerNode,
  type TriggerNodeConfig,
  type TriggerSetupContext,
  type TypeToken,
  type WorkflowDefinition,
  InMemoryRunStateStore,
} from "../src/index.ts";
import { CallbackNode, CallbackNodeConfig, chain, createEngineTestKit, items } from "./harness/index.ts";

class TargetedExecutionStateFactory {
  static fromRunState(state: PersistedRunState): {
    outputsByNode: PersistedRunState["outputsByNode"];
    nodeSnapshotsByNodeId: PersistedRunState["nodeSnapshotsByNodeId"];
    mutableState: PersistedRunState["mutableState"];
  } {
    return {
      outputsByNode: JSON.parse(JSON.stringify(state.outputsByNode)) as PersistedRunState["outputsByNode"],
      nodeSnapshotsByNodeId: JSON.parse(JSON.stringify(state.nodeSnapshotsByNodeId)) as PersistedRunState["nodeSnapshotsByNodeId"],
      mutableState: JSON.parse(JSON.stringify(state.mutableState ?? { nodesById: {} })) as PersistedRunState["mutableState"],
    };
  }
}

class TargetedManualTriggerConfig<TOutputJson = unknown> implements TriggerNodeConfig<TOutputJson> {
  readonly kind = "trigger" as const;
  readonly type: TypeToken<unknown> = TargetedManualTriggerNode;

  constructor(
    public readonly name: string,
    public readonly id?: string,
  ) {}
}

class TargetedManualTriggerNode implements TriggerNode<TargetedManualTriggerConfig<any>> {
  readonly kind = "trigger" as const;
  readonly outputPorts = ["main"] as const;

  async setup(_ctx: TriggerSetupContext<TargetedManualTriggerConfig<any>>): Promise<void> {}

  async execute(items: Items, _ctx: NodeExecutionContext<TargetedManualTriggerConfig<any>>): Promise<NodeOutputs> {
    return { main: items };
  }
}

class DelayedPendingSaveRunStateStore implements RunStateStore {
  constructor(
    private readonly inner: RunStateStore,
    private readonly delayMs: number,
  ) {}

  async createRun(args: {
    runId: string;
    workflowId: string;
    startedAt: string;
    parent?: PersistedRunState["parent"];
    executionOptions?: PersistedRunState["executionOptions"];
    control?: PersistedRunState["control"];
    workflowSnapshot?: PersistedRunState["workflowSnapshot"];
    mutableState?: PersistedRunState["mutableState"];
  }): Promise<void> {
    await this.inner.createRun(args);
  }

  async load(runId: string): Promise<PersistedRunState | undefined> {
    return await this.inner.load(runId);
  }

  async save(state: PersistedRunState): Promise<void> {
    if (state.status === "pending" && state.pending) {
      await this.delay();
    }
    await this.inner.save(state);
  }

  private async delay(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, this.delayMs));
  }
}

test("current-state execution stops when the requested node completes", async () => {
  const events: string[] = [];
  const A = new CallbackNodeConfig("A", () => events.push("A"), { id: "A" });
  const B = new CallbackNodeConfig("B", () => events.push("B"), { id: "B" });
  const C = new CallbackNodeConfig("C", () => events.push("C"), { id: "C" });
  const D = new CallbackNodeConfig("D", () => events.push("D"), { id: "D" });
  const wf = chain({ id: "wf.stop.node", name: "Stop at node" }).start(A).then(B).then(C).then(D).build();

  const kit = createEngineTestKit();
  await kit.start([wf]);

  const scheduled = await kit.engine.runWorkflowFromState({
    workflow: wf,
    items: items([{ id: 1 }]),
    stopCondition: { kind: "nodeCompleted", nodeId: "C" },
  });
  const done = scheduled.status === "pending" ? await kit.engine.waitForCompletion(scheduled.runId) : scheduled;

  assert.equal(done.status, "completed");
  assert.equal(events.join(","), "A,B,C");
  const stored = await kit.runStore.load(done.runId);
  assert.equal(stored?.control?.stopCondition?.kind, "nodeCompleted");
  assert.equal(stored?.nodeSnapshotsByNodeId.D, undefined);
});

test("current-state execution still drains inline activations when pending state persistence is slow", async () => {
  const events: string[] = [];
  const A = new CallbackNodeConfig("A", () => events.push("A"), { id: "A" });
  const B = new CallbackNodeConfig("B", () => events.push("B"), { id: "B" });
  const wf = chain({ id: "wf.pending.persistence.race", name: "Pending persistence race" }).start(A).then(B).build();

  const kit = createEngineTestKit({
    runStore: new DelayedPendingSaveRunStateStore(new InMemoryRunStateStore(), 20),
  });
  await kit.start([wf]);

  const scheduled = await kit.engine.runWorkflowFromState({
    workflow: wf,
    items: items([{ id: 1 }]),
    stopCondition: { kind: "workflowCompleted" },
  });
  const done = scheduled.status === "pending" ? await kit.engine.waitForCompletion(scheduled.runId) : scheduled;

  assert.equal(done.status, "completed");
  assert.equal(events.join(","), "A,B");
  const stored = await kit.runStore.load(done.runId);
  assert.equal(stored?.status, "completed");
  assert.equal(stored?.pending, undefined);
});

test("current-state execution clears from a node and reruns only unresolved descendants", async () => {
  const events: string[] = [];
  const A = new CallbackNodeConfig("A", () => events.push("A"), { id: "A" });
  const B = new CallbackNodeConfig("B", () => events.push("B"), { id: "B" });
  const C = new CallbackNodeConfig("C", () => events.push("C"), { id: "C" });
  const D = new CallbackNodeConfig("D", () => events.push("D"), { id: "D" });
  const wf = chain({ id: "wf.clear.from", name: "Clear from node" }).start(A).then(B).then(C).then(D).build();

  const kit = createEngineTestKit();
  await kit.start([wf]);

  const firstRun = await kit.runToCompletion({ wf, startAt: "A", items: items([{ id: 1 }]) });
  assert.equal(firstRun.status, "completed");
  const firstState = await kit.runStore.load(firstRun.runId);
  assert.ok(firstState);

  events.length = 0;
  const scheduled = await kit.engine.runWorkflowFromState({
    workflow: wf,
    currentState: TargetedExecutionStateFactory.fromRunState(firstState),
    reset: { clearFromNodeId: "C" },
    stopCondition: { kind: "workflowCompleted" },
  });
  const done = scheduled.status === "pending" ? await kit.engine.waitForCompletion(scheduled.runId) : scheduled;

  assert.equal(done.status, "completed");
  assert.equal(events.join(","), "C,D");
});

test("pinned outputs survive clear-from-node and complete immediately without execution", async () => {
  const events: string[] = [];
  const A = new CallbackNodeConfig("A", () => events.push("A"), { id: "A" });
  const B = new CallbackNodeConfig("B", () => events.push("B"), { id: "B" });
  const C = new CallbackNodeConfig("C", () => events.push("C"), { id: "C" });
  const D = new CallbackNodeConfig("D", () => events.push("D"), { id: "D" });
  const wf = chain({ id: "wf.pinned.skip", name: "Pinned skip" }).start(A).then(B).then(C).then(D).build();

  const kit = createEngineTestKit();
  await kit.start([wf]);

  const firstRun = await kit.runToCompletion({ wf, startAt: "A", items: items([{ id: 1 }]) });
  assert.equal(firstRun.status, "completed");
  const firstState = await kit.runStore.load(firstRun.runId);
  assert.ok(firstState);
  const pinnedOutputsByPort = firstState.outputsByNode.C;
  assert.ok(pinnedOutputsByPort);

  const currentState = TargetedExecutionStateFactory.fromRunState(firstState);
  currentState.mutableState = {
    nodesById: {
      C: {
        pinnedOutputsByPort:
          pinnedOutputsByPort as NonNullable<
            NonNullable<NonNullable<PersistedRunState["mutableState"]>["nodesById"][string]["pinnedOutputsByPort"]>
          >,
      },
    },
  };

  events.length = 0;
  const scheduled = await kit.engine.runWorkflowFromState({
    workflow: wf,
    currentState,
    reset: { clearFromNodeId: "C" },
    stopCondition: { kind: "workflowCompleted" },
  });
  const done = scheduled.status === "pending" ? await kit.engine.waitForCompletion(scheduled.runId) : scheduled;

  assert.equal(done.status, "completed");
  assert.equal(events.join(","), "D");
  const stored = await kit.runStore.load(done.runId);
  assert.equal(stored?.nodeSnapshotsByNodeId.C?.status, "completed");
  assert.equal(stored?.nodeSnapshotsByNodeId.C?.usedPinnedOutput, true);
});

test("running to C with only B pinned completes A and C while completing B from pinned output", async () => {
  const events: string[] = [];
  const A = new CallbackNodeConfig("A", () => events.push("A"), { id: "A" });
  const B = new CallbackNodeConfig("B", () => events.push("B"), { id: "B" });
  const C = new CallbackNodeConfig("C", () => events.push("C"), { id: "C" });
  const wf = chain({ id: "wf.pinned.run-to-c", name: "Pinned run to C" }).start(A).then(B).then(C).build();

  const kit = createEngineTestKit();
  await kit.start([wf]);

  const pinnedItems = items([{ pinned: true }]);
  const scheduled = await kit.engine.runWorkflowFromState({
    workflow: wf,
    currentState: {
      outputsByNode: {},
      nodeSnapshotsByNodeId: {},
      mutableState: {
        nodesById: {
          B: {
            pinnedOutputsByPort: {
              main: pinnedItems,
            },
          },
        },
      },
    },
    reset: { clearFromNodeId: "C" },
    stopCondition: { kind: "nodeCompleted", nodeId: "C" },
  });
  const done = scheduled.status === "pending" ? await kit.engine.waitForCompletion(scheduled.runId) : scheduled;

  assert.equal(done.status, "completed");
  assert.equal(events.join(","), "A,C");

  const stored = await kit.runStore.load(done.runId);
  assert.equal(stored?.nodeSnapshotsByNodeId.A?.status, "completed");
  assert.equal(stored?.nodeSnapshotsByNodeId.B?.status, "completed");
  assert.equal(stored?.nodeSnapshotsByNodeId.B?.usedPinnedOutput, true);
  assert.equal(stored?.nodeSnapshotsByNodeId.C?.status, "completed");
  assert.deepEqual(stored?.outputsByNode.B?.main?.map((item) => item.json), [{ pinned: true }]);
});

test("stopping at a trigger does not materialize downstream pinned snapshots in the execution state", async () => {
  const workflow: WorkflowDefinition = {
    id: "wf.stop.at.trigger",
    name: "Stop at trigger",
    nodes: [
      {
        id: "A",
        kind: "trigger",
        type: TargetedManualTriggerNode,
        name: "A",
        config: new TargetedManualTriggerConfig("A", "A"),
      },
      { id: "B", kind: "node", type: CallbackNode, name: "B", config: new CallbackNodeConfig("B", () => {}, { id: "B" }) },
      { id: "C", kind: "node", type: CallbackNode, name: "C", config: new CallbackNodeConfig("C", () => {}, { id: "C" }) },
      { id: "D", kind: "node", type: CallbackNode, name: "D", config: new CallbackNodeConfig("D", () => {}, { id: "D" }) },
    ],
    edges: [
      { from: { nodeId: "A", output: "main" }, to: { nodeId: "B", input: "in" } },
      { from: { nodeId: "B", output: "main" }, to: { nodeId: "C", input: "in" } },
      { from: { nodeId: "C", output: "main" }, to: { nodeId: "D", input: "in" } },
    ],
  };

  const kit = createEngineTestKit();
  await kit.start([workflow]);

  const scheduled = await kit.engine.runWorkflowFromState({
    workflow,
    items: items([{ id: 1 }]),
    currentState: {
      outputsByNode: {
        B: { main: items([{ pinned: "B" }]) },
        D: { main: items([{ pinned: "D" }]) },
      },
      nodeSnapshotsByNodeId: {},
      mutableState: {
        nodesById: {
          B: {
            pinnedOutputsByPort: {
              main: items([{ pinned: "B" }]),
            },
          },
          D: {
            pinnedOutputsByPort: {
              main: items([{ pinned: "D" }]),
            },
          },
        },
      },
    },
    reset: { clearFromNodeId: "A" },
    stopCondition: { kind: "nodeCompleted", nodeId: "A" },
  });
  const done = scheduled.status === "pending" ? await kit.engine.waitForCompletion(scheduled.runId) : scheduled;

  assert.equal(done.status, "completed");

  const stored = await kit.runStore.load(done.runId);
  assert.equal(stored?.nodeSnapshotsByNodeId.A?.status, "completed");
  assert.equal(stored?.nodeSnapshotsByNodeId.B, undefined);
  assert.equal(stored?.nodeSnapshotsByNodeId.C, undefined);
  assert.equal(stored?.nodeSnapshotsByNodeId.D, undefined);
  assert.deepEqual(stored?.outputsByNode.B?.main?.map((item) => item.json), [{ pinned: "B" }]);
  assert.deepEqual(stored?.outputsByNode.D?.main?.map((item) => item.json), [{ pinned: "D" }]);
});

test("running to a downstream node rematerializes required pinned nodes into execution snapshots", async () => {
  const workflow: WorkflowDefinition = {
    id: "wf.rematerialize.pinned",
    name: "Rematerialize pinned",
    nodes: [
      {
        id: "A",
        kind: "trigger",
        type: TargetedManualTriggerNode,
        name: "A",
        config: new TargetedManualTriggerConfig("A", "A"),
      },
      { id: "B", kind: "node", type: CallbackNode, name: "B", config: new CallbackNodeConfig("B", () => {}, { id: "B" }) },
      { id: "C", kind: "node", type: CallbackNode, name: "C", config: new CallbackNodeConfig("C", () => {}, { id: "C" }) },
    ],
    edges: [
      { from: { nodeId: "A", output: "main" }, to: { nodeId: "B", input: "in" } },
      { from: { nodeId: "B", output: "main" }, to: { nodeId: "C", input: "in" } },
    ],
  };

  const kit = createEngineTestKit();
  await kit.start([workflow]);

  const runToTrigger = await kit.engine.runWorkflowFromState({
    workflow,
    items: items([{ id: 1 }]),
    currentState: {
      outputsByNode: {
        B: { main: items([{ pinned: "B" }]) },
      },
      nodeSnapshotsByNodeId: {},
      mutableState: {
        nodesById: {
          B: {
            pinnedOutputsByPort: {
              main: items([{ pinned: "B" }]),
            },
          },
        },
      },
    },
    reset: { clearFromNodeId: "A" },
    stopCondition: { kind: "nodeCompleted", nodeId: "A" },
  });
  const triggerState = (runToTrigger.status === "pending" ? await kit.engine.waitForCompletion(runToTrigger.runId) : runToTrigger);
  const persistedTriggerState = await kit.runStore.load(triggerState.runId);
  assert.ok(persistedTriggerState);
  assert.equal(persistedTriggerState.nodeSnapshotsByNodeId.B, undefined);

  const runToC = await kit.engine.runWorkflowFromState({
    workflow,
    items: items([{ id: 1 }]),
    currentState: TargetedExecutionStateFactory.fromRunState(persistedTriggerState),
    reset: { clearFromNodeId: "C" },
    stopCondition: { kind: "nodeCompleted", nodeId: "C" },
  });
  const completedRunToC = runToC.status === "pending" ? await kit.engine.waitForCompletion(runToC.runId) : runToC;

  assert.equal(completedRunToC.status, "completed");
  const stored = await kit.runStore.load(completedRunToC.runId);
  assert.equal(stored?.nodeSnapshotsByNodeId.A?.status, "completed");
  assert.equal(stored?.nodeSnapshotsByNodeId.B?.status, "completed");
  assert.equal(stored?.nodeSnapshotsByNodeId.B?.usedPinnedOutput, true);
  assert.equal(stored?.nodeSnapshotsByNodeId.C?.status, "completed");
});

test("current-state execution can clear from a node and stop after that node, leaving downstream nodes reset", async () => {
  const events: string[] = [];
  const A = new CallbackNodeConfig("A", () => events.push("A"), { id: "A" });
  const B = new CallbackNodeConfig("B", () => events.push("B"), { id: "B" });
  const C = new CallbackNodeConfig("C", () => events.push("C"), { id: "C" });
  const D = new CallbackNodeConfig("D", () => events.push("D"), { id: "D" });
  const wf = chain({ id: "wf.clear.and.stop", name: "Clear and stop" }).start(A).then(B).then(C).then(D).build();

  const kit = createEngineTestKit();
  await kit.start([wf]);

  const firstRun = await kit.runToCompletion({ wf, startAt: "A", items: items([{ id: 1 }]) });
  assert.equal(firstRun.status, "completed");
  const firstState = await kit.runStore.load(firstRun.runId);
  assert.ok(firstState);

  events.length = 0;
  const scheduled = await kit.engine.runWorkflowFromState({
    workflow: wf,
    currentState: TargetedExecutionStateFactory.fromRunState(firstState),
    reset: { clearFromNodeId: "C" },
    stopCondition: { kind: "nodeCompleted", nodeId: "C" },
  });
  const done = scheduled.status === "pending" ? await kit.engine.waitForCompletion(scheduled.runId) : scheduled;

  assert.equal(done.status, "completed");
  assert.equal(events.join(","), "C");
  const stored = await kit.runStore.load(done.runId);
  assert.equal(stored?.nodeSnapshotsByNodeId.A?.status, "completed");
  assert.equal(stored?.nodeSnapshotsByNodeId.B?.status, "completed");
  assert.equal(stored?.nodeSnapshotsByNodeId.C?.status, "completed");
  assert.equal(stored?.nodeSnapshotsByNodeId.D, undefined);
});

test("current-state execution stops at B and leaves only A and B completed", async () => {
  const events: string[] = [];
  const A = new CallbackNodeConfig("A", () => events.push("A"), { id: "A" });
  const B = new CallbackNodeConfig("B", () => events.push("B"), { id: "B" });
  const C = new CallbackNodeConfig("C", () => events.push("C"), { id: "C" });
  const D = new CallbackNodeConfig("D", () => events.push("D"), { id: "D" });
  const wf = chain({ id: "wf.stop.at.b", name: "Stop at B" }).start(A).then(B).then(C).then(D).build();

  const kit = createEngineTestKit();
  await kit.start([wf]);

  const firstRun = await kit.runToCompletion({ wf, startAt: "A", items: items([{ id: 1 }]) });
  assert.equal(firstRun.status, "completed");
  const firstState = await kit.runStore.load(firstRun.runId);
  assert.ok(firstState);

  events.length = 0;
  const scheduled = await kit.engine.runWorkflowFromState({
    workflow: wf,
    currentState: TargetedExecutionStateFactory.fromRunState(firstState),
    reset: { clearFromNodeId: "B" },
    stopCondition: { kind: "nodeCompleted", nodeId: "B" },
  });
  const done = scheduled.status === "pending" ? await kit.engine.waitForCompletion(scheduled.runId) : scheduled;

  assert.equal(done.status, "completed");
  assert.equal(events.join(","), "B");
  const stored = await kit.runStore.load(done.runId);
  assert.equal(stored?.nodeSnapshotsByNodeId.A?.status, "completed");
  assert.equal(stored?.nodeSnapshotsByNodeId.B?.status, "completed");
  assert.equal(stored?.nodeSnapshotsByNodeId.C, undefined);
  assert.equal(stored?.nodeSnapshotsByNodeId.D, undefined);
});

test("current-state execution clears runtime attachment snapshots for reset descendants", async () => {
  const events: string[] = [];
  const A = new CallbackNodeConfig("A", () => events.push("A"), { id: "A" });
  const B = new CallbackNodeConfig("B", () => events.push("B"), { id: "B" });
  const C = new CallbackNodeConfig("C", () => events.push("C"), { id: "C" });
  const D = new CallbackNodeConfig("D", () => events.push("D"), { id: "D" });
  const wf = chain({ id: "wf.clear.runtime", name: "Clear runtime descendants" }).start(A).then(B).then(C).then(D).build();

  const kit = createEngineTestKit();
  await kit.start([wf]);

  const firstRun = await kit.runToCompletion({ wf, startAt: "A", items: items([{ id: 1 }]) });
  assert.equal(firstRun.status, "completed");
  const firstState = await kit.runStore.load(firstRun.runId);
  assert.ok(firstState);

  const llmInvocationNodeId = AgentAttachmentNodeIdFactory.createLanguageModelNodeId("C", 1);
  const toolInvocationNodeId = AgentAttachmentNodeIdFactory.createToolNodeId("C", "lookup_tool", 1);
  const currentState = TargetedExecutionStateFactory.fromRunState(firstState);
  currentState.outputsByNode[llmInvocationNodeId] = { main: items([{ llm: true }]) };
  currentState.outputsByNode[toolInvocationNodeId] = { main: items([{ tool: true }]) };
  currentState.nodeSnapshotsByNodeId[llmInvocationNodeId] = {
    ...firstState.nodeSnapshotsByNodeId.C!,
    nodeId: llmInvocationNodeId,
  };
  currentState.nodeSnapshotsByNodeId[toolInvocationNodeId] = {
    ...firstState.nodeSnapshotsByNodeId.C!,
    nodeId: toolInvocationNodeId,
  };

  events.length = 0;
  const scheduled = await kit.engine.runWorkflowFromState({
    workflow: wf,
    currentState,
    reset: { clearFromNodeId: "C" },
    stopCondition: { kind: "nodeCompleted", nodeId: "C" },
  });
  const done = scheduled.status === "pending" ? await kit.engine.waitForCompletion(scheduled.runId) : scheduled;

  assert.equal(done.status, "completed");
  const stored = await kit.runStore.load(done.runId);
  assert.equal(stored?.nodeSnapshotsByNodeId[llmInvocationNodeId], undefined);
  assert.equal(stored?.nodeSnapshotsByNodeId[toolInvocationNodeId], undefined);
  assert.equal(stored?.outputsByNode[llmInvocationNodeId], undefined);
  assert.equal(stored?.outputsByNode[toolInvocationNodeId], undefined);
});

test("current-state execution throws when multiple root nodes require input", async () => {
  const A = new CallbackNodeConfig("A", () => {}, { id: "A" });
  const B = new CallbackNodeConfig("B", () => {}, { id: "B" });
  const wf = {
    id: "wf.ambiguous.roots",
    name: "Ambiguous roots",
    nodes: [
      { id: "A", kind: "node" as const, type: A.type, name: "A", config: A },
      { id: "B", kind: "node" as const, type: B.type, name: "B", config: B },
    ],
    edges: [],
  };

  const kit = createEngineTestKit();
  await kit.start([wf]);

  await assert.rejects(
    () =>
      kit.engine.runWorkflowFromState({
        workflow: wf,
        stopCondition: { kind: "workflowCompleted" },
      }),
    /Ambiguous execution frontier/,
  );
});

test("serialized stop conditions survive worker scheduling and stop before downstream nodes", async () => {
  const events: string[] = [];
  const n1 = new CallbackNodeConfig("n1", () => events.push("n1"), { id: "n1" });
  const n2 = new CallbackNodeConfig("n2", () => events.push("n2"), {
    id: "n2",
    execution: { hint: "worker", queue: "q.default" },
  });
  const n3 = new CallbackNodeConfig("n3", () => events.push("n3"), { id: "n3" });
  const wf = chain({ id: "wf.stop.worker", name: "Stop worker" }).start(n1).then(n2).then(n3).build();

  const kit = createEngineTestKit();
  await kit.start([wf]);

  const scheduled = await kit.engine.runWorkflowFromState({
    workflow: wf,
    items: items([{ id: 1 }]),
    stopCondition: { kind: "nodeCompleted", nodeId: "n2" },
  });

  assert.equal(scheduled.status, "pending");
  await kit.waitForActivations(1);
  const storedPending = await kit.runStore.load(scheduled.runId);
  assert.equal(storedPending?.control?.stopCondition?.kind, "nodeCompleted");
  assert.equal(storedPending?.control?.stopCondition && "nodeId" in storedPending.control.stopCondition ? storedPending.control.stopCondition.nodeId : undefined, "n2");
  assert.equal(storedPending?.pending?.nodeId, "n2");

  const resumed = await kit.engine.resumeFromStepResult({
    runId: scheduled.runId,
    activationId: storedPending!.pending!.activationId,
    nodeId: "n2",
    outputs: { main: items([{ ok: true }]) },
  });
  const done = resumed.status === "pending" ? await kit.engine.waitForCompletion(resumed.runId) : resumed;

  assert.equal(done.status, "completed");
  assert.equal(events.join(","), "n1");
  const storedDone = await kit.runStore.load(scheduled.runId);
  assert.equal(storedDone?.nodeSnapshotsByNodeId.n3, undefined);
});
