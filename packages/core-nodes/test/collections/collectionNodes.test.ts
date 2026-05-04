import "reflect-metadata";

import assert from "node:assert/strict";
import { test } from "vitest";

import { DefaultExecutionContextFactory } from "@codemation/core/bootstrap";
import { WorkflowTestKit } from "@codemation/core/testing";

import {
  collectionDeleteNode,
  collectionFindOneNode,
  collectionGetNode,
  collectionInsertNode,
  collectionListNode,
  collectionUpdateNode,
} from "../../src/nodes/collections/index.ts";
import {
  InMemoryCollectionStore,
  InMemoryCollectionStoreFixtureFactory,
} from "./InMemoryCollectionStoreFixtureFactory.ts";

function buildKit(stores: Readonly<Record<string, InMemoryCollectionStore>>) {
  const collections = stores;
  const executionContextFactory = new DefaultExecutionContextFactory(
    undefined,
    undefined,
    undefined,
    undefined,
    collections,
  );
  const kit = new WorkflowTestKit({ executionContextFactory });
  kit.registerDefinedNodes([
    collectionInsertNode,
    collectionGetNode,
    collectionFindOneNode,
    collectionListNode,
    collectionUpdateNode,
    collectionDeleteNode,
  ]);
  return kit;
}

function items<T>(jsonItems: ReadonlyArray<T>) {
  return jsonItems.map((json) => ({ json }));
}

test("collection-insert: inserts a row and returns it with id/timestamps", async () => {
  const store = InMemoryCollectionStoreFixtureFactory.create();
  const kit = buildKit({ contacts: store });

  const node = collectionInsertNode.create(
    { collectionName: "contacts", data: { name: "Alice", age: 30 } },
    "Insert Contact",
    "n-insert",
  );
  const result = await kit.runNode({ node, items: items([{}]), workflowId: "wf.collections.insert" });

  assert.equal(result.status, "completed");
  assert.equal(result.outputs.length, 1);
  const row = result.outputs[0]!.json as Record<string, unknown>;
  assert.ok(typeof row.id === "string", "row should have id");
  assert.equal(row.name, "Alice");
  assert.equal(row.age, 30);
  assert.ok(row.created_at instanceof Date || typeof row.created_at === "string" || row.created_at instanceof Object);
});

test("collection-get: returns the row when found", async () => {
  const store = InMemoryCollectionStoreFixtureFactory.create();
  const inserted = await store.insert({ name: "Bob" });

  const kit = buildKit({ contacts: store });
  const node = collectionGetNode.create({ collectionName: "contacts", id: inserted.id }, "Get Contact", "n-get");
  const result = await kit.runNode({ node, items: items([{}]), workflowId: "wf.collections.get" });

  assert.equal(result.status, "completed");
  assert.equal(result.outputs.length, 1);
  const row = result.outputs[0]!.json as Record<string, unknown>;
  assert.equal(row.id, inserted.id);
  assert.equal(row.name, "Bob");
});

test("collection-get: emits no items when row not found", async () => {
  const store = InMemoryCollectionStoreFixtureFactory.create();
  const kit = buildKit({ contacts: store });

  const node = collectionGetNode.create(
    { collectionName: "contacts", id: "row_missing" },
    "Get Missing",
    "n-get-missing",
  );
  const result = await kit.runNode({ node, items: items([{}]), workflowId: "wf.collections.get.miss" });

  assert.equal(result.status, "completed");
  assert.equal(result.outputs.length, 0);
});

test("collection-find-one: returns matching row", async () => {
  const store = InMemoryCollectionStoreFixtureFactory.create();
  await store.insert({ name: "Charlie", role: "admin" });
  await store.insert({ name: "Dana", role: "user" });

  const kit = buildKit({ contacts: store });
  const node = collectionFindOneNode.create(
    { collectionName: "contacts", where: { role: "admin" } },
    "Find One Contact",
    "n-findone",
  );
  const result = await kit.runNode({ node, items: items([{}]), workflowId: "wf.collections.findone" });

  assert.equal(result.status, "completed");
  assert.equal(result.outputs.length, 1);
  const row = result.outputs[0]!.json as Record<string, unknown>;
  assert.equal(row.name, "Charlie");
});

test("collection-find-one: emits no items when nothing matches", async () => {
  const store = InMemoryCollectionStoreFixtureFactory.create();
  const kit = buildKit({ contacts: store });

  const node = collectionFindOneNode.create(
    { collectionName: "contacts", where: { role: "superadmin" } },
    "Find One Missing",
    "n-findone-miss",
  );
  const result = await kit.runNode({ node, items: items([{}]), workflowId: "wf.collections.findone.miss" });

  assert.equal(result.status, "completed");
  assert.equal(result.outputs.length, 0);
});

test("collection-list: emits one item per row", async () => {
  const store = InMemoryCollectionStoreFixtureFactory.create();
  await store.insert({ name: "Eve" });
  await store.insert({ name: "Frank" });
  await store.insert({ name: "Grace" });

  const kit = buildKit({ contacts: store });
  const node = collectionListNode.create({ collectionName: "contacts" }, "List Contacts", "n-list");
  const result = await kit.runNode({ node, items: items([{}]), workflowId: "wf.collections.list" });

  assert.equal(result.status, "completed");
  assert.equal(result.outputs.length, 3);
  const names = result.outputs.map((o) => (o.json as Record<string, unknown>).name);
  assert.deepEqual(names, ["Eve", "Frank", "Grace"]);
});

test("collection-list: respects limit and offset", async () => {
  const store = InMemoryCollectionStoreFixtureFactory.create();
  await store.insert({ name: "H1" });
  await store.insert({ name: "H2" });
  await store.insert({ name: "H3" });

  const kit = buildKit({ contacts: store });
  const node = collectionListNode.create(
    { collectionName: "contacts", limit: 2, offset: 1 },
    "List with pagination",
    "n-list-page",
  );
  const result = await kit.runNode({ node, items: items([{}]), workflowId: "wf.collections.list.page" });

  assert.equal(result.status, "completed");
  assert.equal(result.outputs.length, 2);
  const names = result.outputs.map((o) => (o.json as Record<string, unknown>).name);
  assert.deepEqual(names, ["H2", "H3"]);
});

test("collection-update: updates the row and returns updated state", async () => {
  const store = InMemoryCollectionStoreFixtureFactory.create();
  const inserted = await store.insert({ name: "Ivan", status: "active" });

  const kit = buildKit({ contacts: store });
  const node = collectionUpdateNode.create(
    { collectionName: "contacts", id: inserted.id, patch: { status: "inactive" } },
    "Update Contact",
    "n-update",
  );
  const result = await kit.runNode({ node, items: items([{}]), workflowId: "wf.collections.update" });

  assert.equal(result.status, "completed");
  assert.equal(result.outputs.length, 1);
  const row = result.outputs[0]!.json as Record<string, unknown>;
  assert.equal(row.id, inserted.id);
  assert.equal(row.name, "Ivan");
  assert.equal(row.status, "inactive");
});

test("collection-delete: returns deleted:true when row exists", async () => {
  const store = InMemoryCollectionStoreFixtureFactory.create();
  const inserted = await store.insert({ name: "Jack" });

  const kit = buildKit({ contacts: store });
  const node = collectionDeleteNode.create(
    { collectionName: "contacts", id: inserted.id },
    "Delete Contact",
    "n-delete",
  );
  const result = await kit.runNode({ node, items: items([{}]), workflowId: "wf.collections.delete" });

  assert.equal(result.status, "completed");
  assert.equal(result.outputs.length, 1);
  const out = result.outputs[0]!.json as Record<string, unknown>;
  assert.equal(out.deleted, true);
  assert.equal(out.id, inserted.id);
});

test("collection-delete: returns deleted:false when row does not exist", async () => {
  const store = InMemoryCollectionStoreFixtureFactory.create();
  const kit = buildKit({ contacts: store });

  const node = collectionDeleteNode.create(
    { collectionName: "contacts", id: "row_ghost" },
    "Delete Missing",
    "n-delete-miss",
  );
  const result = await kit.runNode({ node, items: items([{}]), workflowId: "wf.collections.delete.miss" });

  assert.equal(result.status, "completed");
  assert.equal(result.outputs.length, 1);
  const out = result.outputs[0]!.json as Record<string, unknown>;
  assert.equal(out.deleted, false);
});

test("collection-insert: throws when collection is not registered", async () => {
  const kit = buildKit({});

  const node = collectionInsertNode.create(
    { collectionName: "unknown_collection", data: { field: "value" } },
    "Insert Unknown",
    "n-insert-unknown",
  );
  const result = await kit.runNode({ node, items: items([{}]), workflowId: "wf.collections.insert.unknown" });

  assert.equal(result.status, "failed");
});
