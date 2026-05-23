/**
 * Behavioral tests for WorkflowRunEventWebsocketRelay.
 * Covers start (subscribe, idempotent), stop (unsubscribe, idempotent).
 */
import { describe, expect, it } from "vitest";
import { WorkflowRunEventWebsocketRelay } from "../../src/application/websocket/WorkflowRunEventWebsocketRelay";

function makeRelay(
  opts: {
    onPublish?: (workflowId: string, msg: unknown) => void;
    onSubscribe?: (cb: (event: unknown) => Promise<void>) => Promise<{ close: () => Promise<void> }>;
  } = {},
) {
  const publisher = {
    publishToRoom: async (workflowId: string, msg: unknown) => {
      opts.onPublish?.(workflowId, msg);
    },
  };
  const runEventBus = {
    subscribe: async (cb: (event: unknown) => Promise<void>) => {
      if (opts.onSubscribe) {
        return opts.onSubscribe(cb);
      }
      return { close: async () => {} };
    },
  };
  return new WorkflowRunEventWebsocketRelay(publisher as never, runEventBus as never);
}

describe("WorkflowRunEventWebsocketRelay", () => {
  it("start subscribes to runEventBus and publishes events", async () => {
    const published: unknown[] = [];
    let capturedCb: ((event: unknown) => Promise<void>) | null = null;

    const relay = makeRelay({
      onPublish: (_id, msg) => published.push(msg),
      onSubscribe: async (cb) => {
        capturedCb = cb;
        return { close: async () => {} };
      },
    });

    await relay.start();
    expect(capturedCb).not.toBeNull();

    // Simulate an event
    await capturedCb!({ workflowId: "wf-1", kind: "runStarted" });
    expect(published).toHaveLength(1);
    expect(published[0]).toMatchObject({ kind: "event" });
  });

  it("start is idempotent (does not re-subscribe on second call)", async () => {
    let subscribeCount = 0;
    const relay = makeRelay({
      onSubscribe: async (_cb) => {
        subscribeCount++;
        return { close: async () => {} };
      },
    });

    await relay.start();
    await relay.start();
    expect(subscribeCount).toBe(1);
  });

  it("stop closes the subscription and clears it", async () => {
    let closed = false;
    const relay = makeRelay({
      onSubscribe: async (_cb) => ({
        close: async () => {
          closed = true;
        },
      }),
    });

    await relay.start();
    await relay.stop();
    expect(closed).toBe(true);
  });

  it("stop is idempotent when not started", async () => {
    const relay = makeRelay();
    // Should not throw when stop is called without start
    await expect(relay.stop()).resolves.not.toThrow();
  });

  it("stop is idempotent after already stopped", async () => {
    let closeCount = 0;
    const relay = makeRelay({
      onSubscribe: async (_cb) => ({
        close: async () => {
          closeCount++;
        },
      }),
    });

    await relay.start();
    await relay.stop();
    await relay.stop();
    expect(closeCount).toBe(1);
  });
});
