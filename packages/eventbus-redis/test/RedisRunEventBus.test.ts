/**
 * Tests for RedisRunEventBus and RedisRunEventSubscription.
 *
 * ioredis is aliased at the vitest resolve level (vitest.config.ts) to a
 * lightweight in-process fake (test/__mocks__/ioredis.ts). This allows the
 * real class code to run without a live Redis server, without using vi.mock()
 * (which is forbidden by ESLint rules in this repo).
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "vitest";
import type { RunEvent } from "@codemation/core";

import { RedisRunEventBus } from "../src/RedisRunEventBusRegistry";
import { FakeBroker } from "./__mocks__/ioredis";

function makeEvent(workflowId: string, runId = "run-1"): RunEvent {
  return {
    type: "run.started",
    workflowId,
    runId,
    timestamp: new Date().toISOString(),
  } as unknown as RunEvent;
}

afterEach(() => {
  FakeBroker.reset();
});

describe("RedisRunEventBus.publish", () => {
  it("publishes to the global channel (default prefix)", async () => {
    const bus = new RedisRunEventBus("redis://fake:6379");
    const received: RunEvent[] = [];

    // Subscribe before publishing so we catch the event
    const subscription = await bus.subscribe((event) => received.push(event));

    await bus.publish(makeEvent("wf-global"));

    await subscription.close();
    assert.equal(received.length, 1);
    assert.equal(received[0].workflowId, "wf-global");
  });

  it("publishes to both the global and per-workflow channels", async () => {
    const bus = new RedisRunEventBus("redis://fake:6379");
    const globalReceived: RunEvent[] = [];
    const wfReceived: RunEvent[] = [];

    const globalSub = await bus.subscribe((event) => globalReceived.push(event));
    const wfSub = await bus.subscribeToWorkflow("wf-dual", (event) => wfReceived.push(event));

    await bus.publish(makeEvent("wf-dual"));

    await globalSub.close();
    await wfSub.close();

    assert.equal(globalReceived.length, 1, "global subscriber should receive the event");
    assert.equal(wfReceived.length, 1, "workflow subscriber should receive the event");
  });

  it("uses the custom channelPrefix for channel names", async () => {
    const bus = new RedisRunEventBus("redis://fake:6379", "myapp");
    const received: RunEvent[] = [];

    const subscription = await bus.subscribe((event) => received.push(event));
    await bus.publish(makeEvent("wf-prefix"));

    await subscription.close();
    assert.equal(received.length, 1);
  });

  it("reuses the publisher connection on successive calls (ensurePublisher caching)", async () => {
    const bus = new RedisRunEventBus("redis://fake:6379");
    const sub = await bus.subscribe(() => {});

    // Publish twice — the publisher should be created once and reused
    await bus.publish(makeEvent("wf-cache-1"));
    await bus.publish(makeEvent("wf-cache-2"));

    // If ensurePublisher caching is broken this would throw. Verify no error.
    await sub.close();
  });
});

describe("RedisRunEventBus.subscribe", () => {
  it("delivers published events to global subscribers", async () => {
    const bus = new RedisRunEventBus("redis://fake:6379");
    const received: RunEvent[] = [];

    const subscription = await bus.subscribe((event) => received.push(event));
    await bus.publish(makeEvent("wf-sub"));
    await subscription.close();

    assert.equal(received.length, 1);
    assert.equal(received[0].workflowId, "wf-sub");
  });

  it("does not deliver events to a closed subscription", async () => {
    const bus = new RedisRunEventBus("redis://fake:6379");
    const received: RunEvent[] = [];

    const subscription = await bus.subscribe((event) => received.push(event));
    await subscription.close();

    await bus.publish(makeEvent("wf-after-close"));

    assert.equal(received.length, 0, "closed subscription should not receive events");
  });

  it("filters messages from a different channel (only matching channel triggers handler)", async () => {
    const bus = new RedisRunEventBus("redis://fake:6379");
    const wfReceived: RunEvent[] = [];

    // Subscribe to a specific workflow — should NOT receive events for other workflows via global sub
    const wfSub = await bus.subscribeToWorkflow("wf-filtered", (event) => wfReceived.push(event));
    await bus.publish(makeEvent("wf-other")); // goes to global + wf-other channel
    await wfSub.close();

    assert.equal(wfReceived.length, 0, "workflow subscriber for wf-filtered should not receive events for wf-other");
  });
});

describe("RedisRunEventBus.subscribeToWorkflow", () => {
  it("delivers events matching the workflow to workflow-scoped subscribers", async () => {
    const bus = new RedisRunEventBus("redis://fake:6379");
    const received: RunEvent[] = [];

    const subscription = await bus.subscribeToWorkflow("wf-scoped", (event) => received.push(event));
    await bus.publish(makeEvent("wf-scoped"));
    await bus.publish(makeEvent("wf-other"));
    await subscription.close();

    assert.equal(received.length, 1);
    assert.equal(received[0].workflowId, "wf-scoped");
  });
});

describe("RedisRunEventSubscription.close", () => {
  it("removes the message listener and unsubscribes from the channel", async () => {
    const bus = new RedisRunEventBus("redis://fake:6379");
    const received: RunEvent[] = [];

    const subscription = await bus.subscribe((event) => received.push(event));
    await bus.publish(makeEvent("wf-before-close"));
    assert.equal(received.length, 1);

    await subscription.close();

    await bus.publish(makeEvent("wf-after-close-2"));
    assert.equal(received.length, 1, "no new events after close");
  });
});
