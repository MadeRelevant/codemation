import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  ExecutableTriggerNode,
  Items,
  NodeExecutionContext,
  NodeOutputs,
  RunCurrentState,
  TestableTriggerNode,
  TriggerNodeConfig,
  TriggerSetupContext,
  TriggerTestItemsContext,
  TypeToken,
} from "../../src/index.ts";
import { WorkflowBuilder } from "../../src/index.ts";
import { CallbackNodeConfig, createRegistrarEngineTestKit, items } from "../harness/index.ts";

class IntentScenarioWebhookTriggerConfig implements TriggerNodeConfig<unknown> {
  readonly kind = "trigger" as const;
  readonly type: TypeToken<unknown> = IntentScenarioWebhookTriggerNode;

  constructor(
    public readonly name: string,
    public readonly endpointKey: string,
    public readonly methods: ReadonlyArray<"GET" | "POST" | "PUT" | "PATCH" | "DELETE">,
    public readonly onExecute: (items: Items) => Promise<NodeOutputs> | NodeOutputs,
    public readonly id?: string,
  ) {}
}

class IntentScenarioWebhookTriggerNode implements ExecutableTriggerNode<IntentScenarioWebhookTriggerConfig> {
  readonly kind = "trigger" as const;
  readonly outputPorts = ["main"] as const;

  async setup(_ctx: TriggerSetupContext<IntentScenarioWebhookTriggerConfig>): Promise<undefined> {
    return undefined;
  }

  async execute(items: Items, ctx: NodeExecutionContext<IntentScenarioWebhookTriggerConfig>): Promise<NodeOutputs> {
    return await ctx.config.onExecute(items);
  }
}

type IntentScenarioPreviewSetupState = Readonly<{
  previewValue: string;
}>;

class IntentScenarioPreviewTriggerConfig implements TriggerNodeConfig<
  Readonly<{ value: string }>,
  IntentScenarioPreviewSetupState
> {
  readonly kind = "trigger" as const;
  readonly type: TypeToken<unknown> = IntentScenarioPreviewTriggerNode;

  constructor(
    public readonly name: string,
    public readonly id?: string,
  ) {}
}

class IntentScenarioPreviewTriggerNode implements TestableTriggerNode<IntentScenarioPreviewTriggerConfig> {
  readonly kind = "trigger" as const;
  readonly outputPorts = ["main"] as const;

  async setup(_ctx: TriggerSetupContext<IntentScenarioPreviewTriggerConfig>): Promise<IntentScenarioPreviewSetupState> {
    return {
      previewValue: "from_setup_state",
    };
  }

  async getTestItems(
    ctx: TriggerTestItemsContext<IntentScenarioPreviewTriggerConfig, IntentScenarioPreviewSetupState>,
  ): Promise<Items> {
    return items([{ value: ctx.previousState.previewValue }]);
  }

  async execute(
    inputItems: Items,
    _ctx: NodeExecutionContext<IntentScenarioPreviewTriggerConfig>,
  ): Promise<NodeOutputs> {
    if (inputItems.length === 0) {
      throw new Error("Expected trigger test items to be synthesized before execute()");
    }
    return { main: inputItems };
  }
}

test("RunIntentService.startWorkflow runs a linear workflow to completion (registrar path)", async () => {
  const n2Hits: unknown[] = [];
  const n1 = new CallbackNodeConfig("N1", () => {}, { id: "N1" });
  const n2 = new CallbackNodeConfig(
    "N2",
    ({ items: received }) => {
      n2Hits.push(...received.map((i) => i.json));
    },
    { id: "N2" },
  );
  const wf = new WorkflowBuilder({ id: "wf.intent.linear", name: "Intent linear" }).start(n1).then(n2).build();
  const kit = createRegistrarEngineTestKit();
  await kit.start([wf]);
  const result = await kit.runIntentStartToCompletion({
    wf,
    startAt: "N1",
    items: items([{ step: 1 }]),
  });
  assert.equal(result.status, "completed");
  assert.deepEqual(n2Hits, [{ step: 1 }]);
});

test("RunIntentService.resolveWebhookTrigger matches the same resolution as Engine", async () => {
  const trigger = new IntentScenarioWebhookTriggerConfig(
    "T",
    "path.intent",
    ["POST"],
    async (input) => ({ main: input }),
    "trigger",
  );
  const wf = new WorkflowBuilder({ id: "wf.intent.webhook", name: "Intent webhook" }).trigger(trigger).build();
  const kit = createRegistrarEngineTestKit();
  await kit.start([wf]);
  const fromIntent = kit.runIntent.resolveWebhookTrigger({ endpointPath: "path.intent", method: "POST" });
  const fromEngine = kit.engine.resolveWebhookTrigger({ endpointPath: "path.intent", method: "POST" });
  assert.deepEqual(fromIntent, fromEngine);
  assert.equal(fromIntent.status, "ok");
});

test("RunIntentService.runMatchedWebhook completes trigger and downstream like engine webhook path", async () => {
  const events: string[] = [];
  const trigger = new IntentScenarioWebhookTriggerConfig(
    "T",
    "path.runMatched",
    ["POST"],
    async (input) => {
      events.push("trigger");
      return { main: input };
    },
    "trigger",
  );
  const downstream = new CallbackNodeConfig(
    "D",
    () => {
      events.push("downstream");
    },
    { id: "downstream" },
  );
  const wf = new WorkflowBuilder({ id: "wf.intent.matched", name: "Intent matched" })
    .trigger(trigger)
    .then(downstream)
    .build();
  const kit = createRegistrarEngineTestKit();
  await kit.start([wf]);
  const result = await kit.runIntent.runMatchedWebhook({
    endpointPath: "path.runMatched",
    method: "POST",
    requestItem: items([{ k: 1 }])[0]!,
  });
  assert.equal(result.runStatus, "completed");
  assert.equal(events.join(","), "trigger,downstream");
  const stored = await kit.runStore.load(result.runId);
  assert.equal(stored?.status, "completed");
});

test("RunIntentService.rerunFromNode with items runs from that node", async () => {
  const downstreamHits: unknown[] = [];
  const n1 = new CallbackNodeConfig("N1", () => {}, { id: "N1" });
  const n2 = new CallbackNodeConfig(
    "N2",
    ({ items: received }) => {
      downstreamHits.push(...received.map((i) => i.json));
    },
    { id: "N2" },
  );
  const wf = new WorkflowBuilder({ id: "wf.intent.rerun", name: "Intent rerun" }).start(n1).then(n2).build();
  const kit = createRegistrarEngineTestKit();
  await kit.start([wf]);
  const first = await kit.runIntentStartToCompletion({ wf, startAt: "N1", items: items([{ a: 1 }]) });
  assert.equal(first.status, "completed");
  const second = await kit.runIntent.rerunFromNode({
    workflow: wf,
    nodeId: "N2",
    currentState: {} as any,
    items: items([{ b: 2 }]),
  });
  const terminal = second.status === "pending" ? await kit.engine.waitForCompletion(second.runId) : second;
  assert.equal(terminal.status, "completed");
  assert.deepEqual(downstreamHits, [{ a: 1 }, { b: 2 }]);
});

test("RunIntentService.rerunFromNode without items uses persisted run state (runWorkflowFromState path)", async () => {
  const downstreamHits: unknown[] = [];
  const n1 = new CallbackNodeConfig("N1", () => {}, { id: "N1" });
  const n2 = new CallbackNodeConfig(
    "N2",
    ({ items: received }) => {
      downstreamHits.push(...received.map((i) => i.json));
    },
    { id: "N2" },
  );
  const wf = new WorkflowBuilder({ id: "wf.intent.rerun.state", name: "Intent rerun state" })
    .start(n1)
    .then(n2)
    .build();
  const kit = createRegistrarEngineTestKit();
  await kit.start([wf]);
  const first = await kit.runIntentStartToCompletion({ wf, startAt: "N1", items: items([{ a: 1 }]) });
  assert.equal(first.status, "completed");
  const stored = await kit.runStore.load(first.runId);
  assert.ok(stored);
  const currentState: RunCurrentState = {
    outputsByNode: stored.outputsByNode,
    nodeSnapshotsByNodeId: stored.nodeSnapshotsByNodeId,
    mutableState: stored.mutableState,
    connectionInvocations: stored.connectionInvocations,
  };
  const second = await kit.runIntent.rerunFromNode({
    workflow: wf,
    nodeId: "N2",
    currentState,
  });
  const terminal = second.status === "pending" ? await kit.engine.waitForCompletion(second.runId) : second;
  assert.equal(terminal.status, "completed");
  assert.deepEqual(downstreamHits, [{ a: 1 }, { a: 1 }]);
});

test("RunIntentService.startWorkflow can continue one node downstream from a trigger preview run without explicit items", async () => {
  const downstreamHits: unknown[] = [];
  const workflow = new WorkflowBuilder({
    id: "wf.intent.trigger.preview.continue",
    name: "Intent trigger preview continue",
  })
    .trigger(new IntentScenarioPreviewTriggerConfig("Preview trigger", "trigger"))
    .then(
      new CallbackNodeConfig(
        "Downstream",
        ({ items: received }) => {
          if (received.length === 0) {
            throw new Error("Expected synthesized trigger items");
          }
          downstreamHits.push(...received.map((item) => item.json));
        },
        { id: "downstream" },
      ),
    )
    .build();
  const kit = createRegistrarEngineTestKit();
  await kit.start([workflow]);

  const previewRun = await kit.runIntent.startWorkflow({
    workflow,
    items: [],
    synthesizeTriggerItems: true,
    stopCondition: { kind: "nodeCompleted", nodeId: "trigger" },
  });
  const previewTerminal =
    previewRun.status === "pending" ? await kit.engine.waitForCompletion(previewRun.runId) : previewRun;
  assert.equal(previewTerminal.status, "completed");

  const storedPreviewState = await kit.runStore.load(previewTerminal.runId);
  assert.ok(storedPreviewState);

  const continuation = await kit.runIntent.startWorkflow({
    workflow,
    items: [],
    currentState: {
      outputsByNode: storedPreviewState.outputsByNode,
      nodeSnapshotsByNodeId: storedPreviewState.nodeSnapshotsByNodeId,
      mutableState: storedPreviewState.mutableState,
      connectionInvocations: storedPreviewState.connectionInvocations,
    },
    reset: { clearFromNodeId: "downstream" },
    stopCondition: { kind: "nodeCompleted", nodeId: "downstream" },
  });
  const continuationTerminal =
    continuation.status === "pending" ? await kit.engine.waitForCompletion(continuation.runId) : continuation;

  assert.equal(continuationTerminal.status, "completed");
  assert.deepEqual(downstreamHits, [{ value: "from_setup_state" }]);
});

test("RunIntentService.startWorkflow can synthesize trigger items when targeting a downstream node from empty state", async () => {
  const downstreamHits: unknown[] = [];
  const workflow = new WorkflowBuilder({
    id: "wf.intent.trigger.preview.synthetic",
    name: "Intent trigger preview synthetic",
  })
    .trigger(new IntentScenarioPreviewTriggerConfig("Preview trigger", "trigger"))
    .then(
      new CallbackNodeConfig(
        "Downstream",
        ({ items: received }) => {
          if (received.length === 0) {
            throw new Error("Expected synthesized trigger items");
          }
          downstreamHits.push(...received.map((item) => item.json));
        },
        { id: "downstream" },
      ),
    )
    .build();
  const kit = createRegistrarEngineTestKit();
  await kit.start([workflow]);

  const run = await kit.runIntent.startWorkflow({
    workflow,
    items: [],
    synthesizeTriggerItems: true,
    currentState: {
      outputsByNode: {},
      nodeSnapshotsByNodeId: {},
      mutableState: { nodesById: {} },
    },
    reset: { clearFromNodeId: "downstream" },
    stopCondition: { kind: "nodeCompleted", nodeId: "downstream" },
  });
  const terminal = run.status === "pending" ? await kit.engine.waitForCompletion(run.runId) : run;

  assert.equal(terminal.status, "completed");
  assert.deepEqual(downstreamHits, [{ value: "from_setup_state" }]);

  const stored = await kit.runStore.load(terminal.runId);
  assert.deepEqual(
    stored?.outputsByNode.trigger?.main?.map((item) => item.json),
    [{ value: "from_setup_state" }],
  );
  assert.deepEqual(
    stored?.outputsByNode.downstream?.main?.map((item) => item.json),
    [{ value: "from_setup_state" }],
  );
});
