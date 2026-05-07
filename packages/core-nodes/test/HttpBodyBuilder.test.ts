import { HttpBodyBuilder } from "../src/http/HttpBodyBuilder";
import type { Item, NodeExecutionContext } from "@codemation/core";
import type { RunnableNodeConfig } from "@codemation/core";
import assert from "node:assert/strict";
import { describe, test } from "vitest";

/** Minimal fake for ctx that only supports openReadStream. */
function makeFakeCtx(
  binaryData?: Readonly<Record<string, Uint8Array>>,
): NodeExecutionContext<RunnableNodeConfig<unknown, unknown>> {
  return {
    runId: "run_test",
    workflowId: "wf_test",
    nodeId: "node_test",
    activationId: "act_test",
    parent: undefined,
    now: () => new Date(),
    config: {} as RunnableNodeConfig<unknown, unknown>,
    data: {} as NodeExecutionContext<RunnableNodeConfig<unknown, unknown>>["data"],
    binary: {
      attach: async (args) => {
        return {
          id: "att_test",
          storageKey: "key_test",
          mimeType: args.mimeType,
          size: 0,
          storageDriver: "memory",
          previewKind: "download",
          createdAt: new Date().toISOString(),
          runId: "run_test",
          workflowId: "wf_test",
          nodeId: "node_test",
          activationId: "act_test",
        };
      },
      withAttachment: (item, name, attachment) => ({
        ...item,
        binary: { ...((item as Item).binary ?? {}), [name]: attachment },
      }),
      forNode: () => {
        throw new Error("fake ctx for unit test does not support this binary op");
      },
      openReadStream: async (attachment) => {
        const key = attachment.storageKey;
        const data = binaryData?.[key];
        if (!data) {
          return undefined;
        }
        const ReadableStream = globalThis.ReadableStream;
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(data);
            controller.close();
          },
        });
        return { body: stream as import("node:stream/web").ReadableStream<Uint8Array> };
      },
    } as unknown as NodeExecutionContext<RunnableNodeConfig<unknown, unknown>>["binary"],
  };
}

describe("HttpBodyBuilder", () => {
  const builder = new HttpBodyBuilder();

  test("returns undefined for undefined body", async () => {
    const ctx = makeFakeCtx();
    const result = await builder.build(undefined, { json: {} }, ctx);
    assert.equal(result, undefined);
  });

  test("returns undefined for kind=none", async () => {
    const ctx = makeFakeCtx();
    const result = await builder.build({ kind: "none" }, { json: {} }, ctx);
    assert.equal(result, undefined);
  });

  test("encodes JSON body", async () => {
    const ctx = makeFakeCtx();
    const result = await builder.build({ kind: "json", data: { hello: "world" } }, { json: {} }, ctx);
    assert.ok(result);
    assert.equal(result.contentType, "application/json");
    assert.equal(result.body, JSON.stringify({ hello: "world" }));
  });

  test("encodes form body", async () => {
    const ctx = makeFakeCtx();
    const result = await builder.build({ kind: "form", data: { name: "alice", age: "30" } }, { json: {} }, ctx);
    assert.ok(result);
    assert.equal(result.contentType, "application/x-www-form-urlencoded");
    assert.ok(typeof result.body === "string");
    const params = new URLSearchParams(result.body as string);
    assert.equal(params.get("name"), "alice");
    assert.equal(params.get("age"), "30");
  });

  test("encodes multipart body with text fields", async () => {
    const ctx = makeFakeCtx();
    const result = await builder.build({ kind: "multipart", fields: { title: "test-title" } }, { json: {} }, ctx);
    assert.ok(result);
    // Empty contentType = FormData sets boundary automatically
    assert.equal(result.contentType, "");
    assert.ok(result.body instanceof FormData);
    assert.equal((result.body as FormData).get("title"), "test-title");
  });

  test("encodes multipart body with binary attachment", async () => {
    const fakeBytes = new TextEncoder().encode("file-contents");
    const ctx = makeFakeCtx({ key_test: fakeBytes });
    const item: Item = {
      json: {},
      binary: {
        myfile: {
          id: "att_test",
          storageKey: "key_test",
          mimeType: "text/plain",
          size: fakeBytes.length,
          storageDriver: "memory",
          previewKind: "download",
          createdAt: new Date().toISOString(),
          runId: "run_test",
          workflowId: "wf_test",
          nodeId: "node_test",
          activationId: "act_test",
          filename: "test.txt",
        },
      },
    };

    const result = await builder.build(
      { kind: "multipart", fields: { note: "attached" }, binaries: { file: "myfile" } },
      item,
      ctx,
    );
    assert.ok(result);
    assert.equal(result.contentType, "");
    assert.ok(result.body instanceof FormData);
    const formData = result.body as FormData;
    assert.equal(formData.get("note"), "attached");
    const fileEntry = formData.get("file");
    assert.ok(fileEntry instanceof Blob);
    assert.equal((fileEntry as Blob).type, "text/plain");
  });

  test("kind binary: throws when the named slot has no attachment on the item", async () => {
    const builder = new HttpBodyBuilder();
    const ctx = makeFakeCtx();
    const item: Item = { json: {}, binary: {} };

    await assert.rejects(
      builder.build({ kind: "binary", slot: "missing-slot" }, item, ctx),
      /no binary attachment found at slot "missing-slot"/,
    );
  });

  test("kind binary: throws when openReadStream returns undefined", async () => {
    const builder = new HttpBodyBuilder();
    // makeFakeCtx returns undefined for any storageKey not in binaryData; passing
    // an empty binaryData simulates a storage adapter that has lost the bytes.
    const ctx = makeFakeCtx({});
    const item: Item = {
      json: {},
      binary: {
        orphan: {
          id: "att_orphan",
          storageKey: "missing_key",
          mimeType: "application/octet-stream",
          size: 0,
          storageDriver: "memory",
          previewKind: "download",
          createdAt: new Date().toISOString(),
          runId: "run_test",
          workflowId: "wf_test",
          nodeId: "node_test",
          activationId: "act_test",
        },
      },
    };

    await assert.rejects(
      builder.build({ kind: "binary", slot: "orphan" }, item, ctx),
      /could not open read stream for slot "orphan"/,
    );
  });
});
