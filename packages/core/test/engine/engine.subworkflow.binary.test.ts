/**
 * Regression suite: item.binary slots must survive a SubWorkflow boundary in both directions.
 *
 * Direction 1 — parent → child input:
 *   A parent attaches "parent-slot" before the SubWorkflow node. The child must see it.
 *
 * Direction 2 — child terminal → parent continuation:
 *   The child attaches "child-slot" and returns the item. The parent's continuation node
 *   must see both slots.
 *
 * The suite also verifies that attachment bytes are readable (openReadStream) in the child
 * for parent-attached blobs, and in the parent for child-attached blobs, confirming that
 * the underlying BinaryStorage instance is shared across run boundaries.
 *
 * Implementation notes:
 * - Use `ItemHarnessNodeConfig` (not the harness `CallbackNodeConfig`) whenever a node
 *   must modify the item or attach binary. `CallbackNodeConfig` discards its callback's
 *   return and always echoes input items — it is only useful for side-effect observation.
 * - `createEngineTestKit` / `WorkflowTestKit` must be configured with an
 *   `InMemoryBinaryStorage` so `ctx.binary.attach` calls have a working storage backend.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { z } from "zod";
import "reflect-metadata";

import {
  DefaultExecutionContextFactory,
  InMemoryBinaryStorage,
} from "../../src/index.ts";
import { WorkflowBuilder } from "../../src/workflow/dsl/WorkflowBuilder.ts";
import { createEngineTestKit } from "../harness/index.ts";
import { CallbackNodeConfig, SubWorkflowRunnerConfig, items } from "../harness/index.ts";
import { ItemHarnessNodeConfig } from "../../src/testing/ItemHarnessNodeConfig.ts";
import type { Item, BinaryAttachment } from "../../src/index.ts";

// Shared binary storage so parent and child runs can read each other's blobs.
function makeKit() {
  const storage = new InMemoryBinaryStorage();
  const executionContextFactory = new DefaultExecutionContextFactory(storage);
  return createEngineTestKit({ executionContextFactory });
}

test("parent binary slot is visible in child, child slot is visible in parent after SubWorkflow", async () => {
  let parentSlotInChild: BinaryAttachment | undefined;
  let childSlotInParent: BinaryAttachment | undefined;
  let parentSlotInParent: BinaryAttachment | undefined;
  let childBytesReadableFromParent = false;
  let parentBytesReadableFromChild = false;

  // ---- child workflow ----
  // Assertion: verify the item arriving in the child has parent-slot, then pass it through.
  const childAssert = new CallbackNodeConfig<unknown>(
    "ChildAssert",
    async ({ items: childItems, ctx }) => {
      const item = childItems[0] as Item | undefined;
      parentSlotInChild = item?.binary?.["parent-slot"];
      assert.ok(parentSlotInChild, "child must see parent-slot");

      // Verify the parent's bytes are readable from inside the child run.
      const stream = await ctx.binary.openReadStream(parentSlotInChild!);
      assert.ok(stream, "child must be able to openReadStream parent-slot bytes");
      const chunks: Uint8Array[] = [];
      for await (const chunk of stream.body) {
        chunks.push(chunk as Uint8Array);
      }
      const text = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf-8");
      assert.equal(text, "parent-bytes");
      parentBytesReadableFromChild = true;
      // CallbackNodeConfig echoes input items — that's fine here; we only need the assertion side-effect.
    },
    { id: "child-assert" },
  );

  // Transformation: attach child-slot to the item. Must use ItemHarnessNodeConfig because
  // CallbackNodeConfig discards its callback's return value.
  const childAttach = new ItemHarnessNodeConfig(
    "ChildAttach",
    z.unknown(),
    async ({ item, ctx }) => {
      const attachment = await ctx.binary.attach({
        name: "child-slot",
        body: Buffer.from("child-bytes"),
        mimeType: "text/plain",
        filename: "c.txt",
      });
      return ctx.binary.withAttachment(item as Item, "child-slot", attachment);
    },
    { id: "child-attach" },
  );

  const child = new WorkflowBuilder({ id: "wf.binary.child", name: "Binary child" })
    .start(childAssert)
    .then(childAttach)
    .build();

  // ---- parent workflow ----
  // Transformation: attach parent-slot to the item.
  const parentAttach = new ItemHarnessNodeConfig(
    "ParentAttach",
    z.unknown(),
    async ({ item, ctx }) => {
      const attachment = await ctx.binary.attach({
        name: "parent-slot",
        body: Buffer.from("parent-bytes"),
        mimeType: "text/plain",
        filename: "p.txt",
      });
      return ctx.binary.withAttachment(item as Item, "parent-slot", attachment);
    },
    { id: "parent-attach" },
  );

  const sub = new SubWorkflowRunnerConfig("Sub", {
    workflowId: "wf.binary.child",
    id: "sub",
  });

  // Assertion: verify both slots are visible and child bytes are readable from the parent.
  const parentContinue = new CallbackNodeConfig<unknown>(
    "ParentContinue",
    async ({ items: parentItems, ctx }) => {
      const item = parentItems[0] as Item | undefined;
      parentSlotInParent = item?.binary?.["parent-slot"];
      childSlotInParent = item?.binary?.["child-slot"];

      assert.ok(parentSlotInParent, "parent-slot must survive SubWorkflow round-trip");
      assert.ok(childSlotInParent, "child-slot must be visible in parent after SubWorkflow");

      const stream = await ctx.binary.openReadStream(childSlotInParent!);
      assert.ok(stream, "parent must be able to openReadStream child-slot bytes");
      const chunks: Uint8Array[] = [];
      for await (const chunk of stream.body) {
        chunks.push(chunk as Uint8Array);
      }
      const text = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf-8");
      assert.equal(text, "child-bytes");
      childBytesReadableFromParent = true;
    },
    { id: "parent-continue" },
  );

  const parent = new WorkflowBuilder({ id: "wf.binary.parent", name: "Binary parent" })
    .start(parentAttach)
    .then(sub)
    .then(parentContinue)
    .build();

  const kit = makeKit();
  await kit.start([parent, child]);
  const result = await kit.runToCompletion({
    wf: parent,
    startAt: "parent-attach",
    items: items([{ x: 1 }]),
  });

  assert.equal(result.status, "completed");
  assert.ok(parentBytesReadableFromChild, "stream-readback of parent bytes in child run");
  assert.ok(childBytesReadableFromParent, "stream-readback of child bytes in parent run");
});

test("binary slots from parent are propagated even when child emits new json shape", async () => {
  let parentSlotSurvived = false;

  // Assertion: child verifies doc slot is present.
  const childVerify = new CallbackNodeConfig<unknown>(
    "ChildVerify",
    ({ items: childItems }) => {
      const item = childItems[0] as Item | undefined;
      assert.ok(item?.binary?.["doc"], "child must see doc slot");
    },
    { id: "child-verify" },
  );

  // Transformation: change json shape while preserving binary (spread item).
  const childTransform = new ItemHarnessNodeConfig(
    "ChildTransform",
    z.unknown(),
    ({ item }) => {
      return { ...(item as Item), json: { transformed: true } } as Item;
    },
    { id: "child-transform" },
  );

  const child = new WorkflowBuilder({ id: "wf.binary.child2", name: "Binary child2" })
    .start(childVerify)
    .then(childTransform)
    .build();

  const parentAttach = new ItemHarnessNodeConfig(
    "ParentAttach2",
    z.unknown(),
    async ({ item, ctx }) => {
      const attachment = await ctx.binary.attach({
        name: "doc",
        body: Buffer.from("doc-content"),
        mimeType: "application/pdf",
        filename: "doc.pdf",
      });
      return ctx.binary.withAttachment(item as Item, "doc", attachment);
    },
    { id: "parent-attach2" },
  );

  const sub = new SubWorkflowRunnerConfig("Sub2", {
    workflowId: "wf.binary.child2",
    id: "sub2",
  });

  const parentCheck = new CallbackNodeConfig<unknown>(
    "ParentCheck2",
    ({ items: parentItems }) => {
      const item = parentItems[0] as Item | undefined;
      assert.ok(item?.binary?.["doc"], "doc slot must survive SubWorkflow even when child changed json");
      parentSlotSurvived = true;
    },
    { id: "parent-check2" },
  );

  const parent = new WorkflowBuilder({ id: "wf.binary.parent2", name: "Binary parent2" })
    .start(parentAttach)
    .then(sub)
    .then(parentCheck)
    .build();

  const kit = makeKit();
  await kit.start([parent, child]);
  const result = await kit.runToCompletion({
    wf: parent,
    startAt: "parent-attach2",
    items: items([{ n: 42 }]),
  });

  assert.equal(result.status, "completed");
  assert.ok(parentSlotSurvived, "binary slot must survive SubWorkflow boundary");
});

test("pre-existing binary slot on item travels through subworkflow (both directions)", async () => {
  let seenInChild = false;
  let seenInParent = false;
  let bothSlotsInParent = false;

  const fakeAttachment: BinaryAttachment = {
    id: "fake-pre",
    storageKey: "fake/key/pre",
    mimeType: "text/plain",
    size: 5,
    storageDriver: "memory",
    previewKind: "download",
    createdAt: new Date().toISOString(),
    runId: "fake-run",
    workflowId: "fake-wf",
    nodeId: "fake-node",
    activationId: "fake-act",
    filename: "pre.txt",
  };

  const childPreSlot: BinaryAttachment = {
    id: "fake-child-pre",
    storageKey: "fake/key/child-pre",
    mimeType: "text/plain",
    size: 5,
    storageDriver: "memory",
    previewKind: "download",
    createdAt: new Date().toISOString(),
    runId: "fake-run",
    workflowId: "fake-wf",
    nodeId: "fake-node",
    activationId: "fake-act",
    filename: "child-pre.txt",
  };

  // Observe that child sees pre-slot, then add child-pre-slot.
  const childCheck = new ItemHarnessNodeConfig(
    "ChildCheck",
    z.unknown(),
    ({ item }) => {
      const it = item as Item;
      seenInChild = !!it.binary?.["pre-slot"];
      return {
        ...it,
        binary: {
          ...it.binary,
          "child-pre-slot": childPreSlot,
        },
      } as Item;
    },
    { id: "child-check" },
  );

  const child = new WorkflowBuilder({ id: "wf.pre-binary.child", name: "Pre-binary child" })
    .start(childCheck)
    .build();

  const sub = new SubWorkflowRunnerConfig("SubPre", {
    workflowId: "wf.pre-binary.child",
    id: "sub-pre",
  });

  const parentCheck = new CallbackNodeConfig<unknown>(
    "ParentCheckPre",
    ({ items: parentItems }) => {
      const item = parentItems[0] as Item | undefined;
      seenInParent = !!item?.binary?.["pre-slot"];
      bothSlotsInParent = !!item?.binary?.["pre-slot"] && !!item?.binary?.["child-pre-slot"];
    },
    { id: "parent-check-pre" },
  );

  const parent = new WorkflowBuilder({ id: "wf.pre-binary.parent", name: "Pre-binary parent" })
    .start(sub)
    .then(parentCheck)
    .build();

  const inputItem: Item = {
    json: { x: 1 },
    binary: { "pre-slot": fakeAttachment },
  };

  const kit = createEngineTestKit();
  await kit.start([parent, child]);
  const result = await kit.runToCompletion({
    wf: parent,
    startAt: "sub-pre",
    items: [inputItem],
  });

  assert.equal(result.status, "completed");
  assert.ok(seenInChild, "child should see pre-existing binary slot");
  assert.ok(seenInParent, "parent should see pre-existing binary slot after subworkflow");
  assert.ok(bothSlotsInParent, "parent should see both pre-slot and child-pre-slot after subworkflow");
});
