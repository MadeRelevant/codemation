import assert from "node:assert/strict";
import test from "node:test";
import type { Item, NodeExecutionContext } from "@codemation/core";
import { InMemoryCredentialService, InMemoryRunDataFactory } from "@codemation/core";
import { Callback, CallbackNode } from "@codemation/core-nodes";

class CallbackNodeTestContextFactory {
  static create(config: Callback): NodeExecutionContext<Callback> {
    return {
      runId: "run_callback",
      workflowId: "wf_callback",
      parent: undefined,
      now: () => new Date(),
      services: {
        credentials: new InMemoryCredentialService(),
      },
      data: new InMemoryRunDataFactory().create(),
      nodeId: "node_callback",
      activationId: "act_callback",
      config,
    };
  }
}

class CallbackNodeJson {
  static withNote(item: Item, note: string): Item {
    const base = typeof item.json === "object" && item.json !== null ? (item.json as Record<string, unknown>) : {};
    return {
      ...item,
      json: {
        ...base,
        note,
      },
    };
  }
}

test("CallbackNode passes items through by default", async () => {
  const config = new Callback();
  const items = [{ json: { ok: true } }];

  const outputs = await new CallbackNode().execute(items, CallbackNodeTestContextFactory.create(config));

  assert.deepEqual(outputs, { main: items });
});

test("CallbackNode lets inline callbacks transform items", async () => {
  const config = new Callback("Annotate", (items) => items.map((item) => CallbackNodeJson.withNote(item, "processed")));
  const items = [{ json: { subject: "RFQ" } }];

  const outputs = await new CallbackNode().execute(items, CallbackNodeTestContextFactory.create(config));

  assert.deepEqual(outputs, {
    main: [{ json: { subject: "RFQ", note: "processed" } }],
  });
});
