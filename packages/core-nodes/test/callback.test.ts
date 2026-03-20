import type { Item,NodeExecutionContext } from "@codemation/core";
import { DefaultExecutionBinaryService,InMemoryBinaryStorage,InMemoryRunDataFactory } from "@codemation/core";
import { Callback,CallbackNode } from "@codemation/core-nodes";
import assert from "node:assert/strict";
import { test } from "vitest";

class CallbackNodeTestContextFactory {
  static create(config: Callback): NodeExecutionContext<Callback> {
    const binary = new DefaultExecutionBinaryService(new InMemoryBinaryStorage(), "wf_callback", "run_callback", () => new Date());
    return {
      runId: "run_callback",
      workflowId: "wf_callback",
      parent: undefined,
      now: () => new Date(),
      data: new InMemoryRunDataFactory().create(),
      nodeId: "node_callback",
      activationId: "act_callback",
      config,
      binary: binary.forNode({ nodeId: "node_callback", activationId: "act_callback" }),
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

class CallbackNodeBinaryFixture {
  static async attachGeneratedNote(item: Item, ctx: NodeExecutionContext<Callback>): Promise<Item> {
    const attachment = await ctx.binary.attach({
      name: "note",
      body: new TextEncoder().encode("Generated callback attachment"),
      mimeType: "text/plain",
      filename: "callback-note.txt",
    });
    return ctx.binary.withAttachment(
      {
        ...CallbackNodeJson.withNote(item, "processed"),
        json: {
          ...(CallbackNodeJson.withNote(item, "processed").json as Record<string, unknown>),
          generated: {
            attachmentName: "note",
            hasBinary: true,
          },
        },
      },
      "note",
      attachment,
    );
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

test("CallbackNode can return items that include both json and binary", async () => {
  const config = new Callback("Annotate with attachment", async (items, ctx) => {
    return await Promise.all(items.map(async (item) => await CallbackNodeBinaryFixture.attachGeneratedNote(item, ctx)));
  });
  const items = [{ json: { subject: "RFQ" } }];

  const outputs = await new CallbackNode().execute(items, CallbackNodeTestContextFactory.create(config));

  assert.equal(outputs.main?.[0]?.binary?.note?.mimeType, "text/plain");
  assert.equal(outputs.main?.[0]?.binary?.note?.previewKind, "download");
  assert.deepEqual(outputs.main?.[0]?.json, {
    subject: "RFQ",
    note: "processed",
    generated: {
      attachmentName: "note",
      hasBinary: true,
    },
  });
});
