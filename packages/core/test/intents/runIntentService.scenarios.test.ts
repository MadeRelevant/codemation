import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  ExecutableTriggerNode,
  Items,
  NodeExecutionContext,
  NodeOutputs,
  RunCurrentState,
  TriggerNodeConfig,
  TriggerSetupContext,
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
