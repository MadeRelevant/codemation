import assert from "node:assert/strict";
import { test } from "vitest";

import {
  ConnectionInvocationEventPublisher,
  InMemoryRunEventBus,
  type ConnectionInvocationRecord,
  type RunEvent,
} from "../../src/index.ts";

function makeRecord(overrides: Partial<ConnectionInvocationRecord> = {}): ConnectionInvocationRecord {
  return {
    invocationId: "inv_1",
    runId: "run_1",
    workflowId: "wf.demo",
    connectionNodeId: "agent$1__conn__llm",
    parentAgentNodeId: "agent",
    parentAgentActivationId: "act_1",
    status: "running",
    updatedAt: "2026-04-30T10:00:00.000Z",
    ...overrides,
  };
}

test("ConnectionInvocationEventPublisher emits started/completed/failed by status", async () => {
  const bus = new InMemoryRunEventBus();
  const seen: RunEvent[] = [];
  const subscription = await bus.subscribe((event) => {
    seen.push(event);
  });
  const publisher = new ConnectionInvocationEventPublisher(bus, undefined);

  await publisher.publish(makeRecord({ status: "running" }));
  await publisher.publish(
    makeRecord({ invocationId: "inv_2", status: "completed", finishedAt: "2026-04-30T10:00:01.000Z" }),
  );
  await publisher.publish(
    makeRecord({ invocationId: "inv_3", status: "failed", finishedAt: "2026-04-30T10:00:02.000Z" }),
  );

  const kinds = seen.map((event) => event.kind);
  assert.deepEqual(kinds, [
    "connectionInvocationStarted",
    "connectionInvocationCompleted",
    "connectionInvocationFailed",
  ]);

  await subscription.close();
});

test("ConnectionInvocationEventPublisher does nothing without a bus", async () => {
  const publisher = new ConnectionInvocationEventPublisher(undefined, undefined);
  await publisher.publish(makeRecord());
});

test("ConnectionInvocationEventPublisher ignores statuses outside the lifecycle", async () => {
  const bus = new InMemoryRunEventBus();
  const seen: RunEvent[] = [];
  const subscription = await bus.subscribe((event) => {
    seen.push(event);
  });
  const publisher = new ConnectionInvocationEventPublisher(bus, undefined);
  await publisher.publish(makeRecord({ status: "idle" as ConnectionInvocationRecord["status"] }));
  assert.deepEqual(seen, []);
  await subscription.close();
});
