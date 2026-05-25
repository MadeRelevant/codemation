/**
 * @description Manual trigger → insert → list → get by id → find one by filter → update → delete.
 * Demonstrates all six collection CRUD nodes in sequence: collectionInsertNode, collectionListNode,
 * collectionGetNode, collectionFindOneNode, collectionUpdateNode, collectionDeleteNode.
 * Collections must be declared in codemation.config.ts via defineCollection("contacts", ...).
 * @tags collection, database, crud, insert, get, find, list, update, delete, store, persist, style:node
 * @uses @codemation/core-nodes, node:collectionInsertNode, node:collectionGetNode, node:collectionFindOneNode, node:collectionListNode, node:collectionUpdateNode, node:collectionDeleteNode
 * @dependencies @codemation/core-nodes@workspace:*
 */

import { workflow } from "@codemation/host";
import {
  collectionInsertNode,
  collectionListNode,
  collectionGetNode,
  collectionFindOneNode,
  collectionUpdateNode,
  collectionDeleteNode,
} from "@codemation/core-nodes";

// Collections store rows that persist across workflow runs.
// Declare "contacts" in codemation.config.ts: defineCollection("contacts", { ... })
// Each node below takes { collectionName, ...args } as its static config.
export default workflow("example.node-collection-crud")
  .name("Collection CRUD: all six operations")
  .manualTrigger<unknown>("Seed contacts", [{ name: "Alice Nguyen", email: "alice@example.com" }])
  // INSERT — writes one row, returns it with id, created_at, updated_at.
  .then(
    collectionInsertNode.create(
      { collectionName: "contacts", data: { name: "Alice Nguyen", email: "alice@example.com" } },
      "Insert contact",
      "insert-contact",
    ),
  )
  // LIST — pages through the collection, emits one item per row.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- collection nodes don't type-check their input; chain types don't compose when each step has a different output type
  .then(
    collectionListNode.create({ collectionName: "contacts", limit: 10 }, "List all contacts", "list-contacts") as any,
  )
  // GET — fetches a single row by its id field (set a known id for a real run).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- same as above
  .then(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- same as above
    collectionGetNode.create(
      { collectionName: "contacts", id: "placeholder-id" },
      "Get contact by id",
      "get-contact",
    ) as any,
  )
  // FIND ONE — finds the first row matching a filter object.
  .then(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- same as above
    collectionFindOneNode.create(
      { collectionName: "contacts", where: { email: "alice@example.com" } },
      "Find contact by email",
      "find-contact",
    ) as any,
  )
  // UPDATE — patches a row by id; returns the updated row.
  .then(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- same as above
    collectionUpdateNode.create(
      { collectionName: "contacts", id: "placeholder-id", patch: { name: "Alice N." } },
      "Update contact name",
      "update-contact",
    ) as any,
  )
  // DELETE — removes a row by id; returns { deleted: boolean, id: string }.
  .then(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- same as above
    collectionDeleteNode.create(
      { collectionName: "contacts", id: "placeholder-id" },
      "Delete contact",
      "delete-contact",
    ) as any,
  )
  .build();
