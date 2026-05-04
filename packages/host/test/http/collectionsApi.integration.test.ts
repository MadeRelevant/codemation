// @vitest-environment node

import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { c, defineCollection } from "@codemation/core";
import type { CodemationConfig } from "../../src/presentation/config/CodemationConfig";
import { ApiPaths } from "../../src/presentation/http/ApiPaths";
import type {
  CollectionDetailDto,
  CollectionRowDto,
  CollectionSummaryDto,
  ListCollectionRowsResponseDto,
  SyncCollectionsResponseDto,
} from "../../src/dto";
import { FrontendHttpIntegrationHarness } from "./testkit/FrontendHttpIntegrationHarness";
import { IntegrationTestAuth } from "./testkit/IntegrationTestAuth";
import type { IntegrationDatabase } from "./testkit/IntegrationDatabaseFactory";
import { IntegrationDatabaseFactory } from "./testkit/IntegrationDatabaseFactory";
import { mergeIntegrationDatabaseRuntime } from "./testkit/mergeIntegrationDatabaseRuntime";

const contactsCollection = defineCollection({
  name: "contacts",
  fields: {
    name: c.text().notNull(),
    email: c.text(),
    age: c.int(),
  },
  indexes: [],
});

class CollectionsApiFixture {
  static createConfig(): CodemationConfig {
    return {
      collections: [contactsCollection.definition],
      runtime: {
        eventBus: { kind: "memory" },
        scheduler: { kind: "local" },
      },
      auth: IntegrationTestAuth.developmentBypass,
    };
  }
}

describe("collections HTTP API", () => {
  let database: IntegrationDatabase;
  let harness: FrontendHttpIntegrationHarness;

  beforeAll(async () => {
    database = await IntegrationDatabaseFactory.create();
    harness = new FrontendHttpIntegrationHarness({
      config: mergeIntegrationDatabaseRuntime(CollectionsApiFixture.createConfig(), database),
      consumerRoot: path.resolve(import.meta.dirname, "../../.."),
    });
    await harness.start();
  });

  afterAll(async () => {
    await harness.close();
    await database.close();
  });

  it("GET /collections returns collection list", async () => {
    const response = await harness.request({ method: "GET", url: ApiPaths.collections() });
    expect(response.statusCode).toBe(200);
    const body = response.json<ReadonlyArray<CollectionSummaryDto>>();
    expect(Array.isArray(body)).toBe(true);
    const contacts = body.find((c) => c.name === "contacts");
    expect(contacts).toBeDefined();
    expect(contacts!.fieldCount).toBe(3);
  });

  it("GET /collections/:name returns schema detail", async () => {
    const response = await harness.request({ method: "GET", url: ApiPaths.collection("contacts") });
    expect(response.statusCode).toBe(200);
    const detail = response.json<CollectionDetailDto>();
    expect(detail.name).toBe("contacts");
    expect(detail.fields.length).toBe(3);
    const nameField = detail.fields.find((f) => f.name === "name");
    expect(nameField).toBeDefined();
    expect(nameField!.nullable).toBe(false);
  });

  it("GET /collections/unknown returns 404", async () => {
    const response = await harness.request({ method: "GET", url: ApiPaths.collection("unknown_xyz") });
    expect(response.statusCode).toBe(404);
  });

  it("POST /collections/:name/rows inserts and returns the new row", async () => {
    const response = await harness.request({
      method: "POST",
      url: ApiPaths.collectionRows("contacts"),
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ name: "Alice", email: "alice@example.com", age: 30 }),
    });
    expect(response.statusCode).toBe(201);
    const row = response.json<CollectionRowDto>();
    expect(typeof row.id).toBe("string");
    expect(row.data.name).toBe("Alice");
    expect(row.data.email).toBe("alice@example.com");
    expect(typeof row.created_at).toBe("string");
  });

  it("GET /collections/:name/rows lists rows with pagination", async () => {
    // Insert two more rows
    await harness.request({
      method: "POST",
      url: ApiPaths.collectionRows("contacts"),
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ name: "Bob", email: "bob@example.com" }),
    });
    await harness.request({
      method: "POST",
      url: ApiPaths.collectionRows("contacts"),
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ name: "Carol", email: "carol@example.com" }),
    });

    const response = await harness.request({
      method: "GET",
      url: `${ApiPaths.collectionRows("contacts")}?limit=2&offset=0`,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<ListCollectionRowsResponseDto>();
    expect(body.rows.length).toBeLessThanOrEqual(2);
    expect(typeof body.total).toBe("number");
    expect(body.limit).toBe(2);
    expect(body.offset).toBe(0);
  });

  it("GET /collections/:name/rows/:id returns a specific row", async () => {
    // Insert a row
    const insertResponse = await harness.request({
      method: "POST",
      url: ApiPaths.collectionRows("contacts"),
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ name: "Dave", email: "dave@example.com" }),
    });
    const inserted = insertResponse.json<CollectionRowDto>();

    const response = await harness.request({
      method: "GET",
      url: ApiPaths.collectionRow("contacts", inserted.id),
    });
    expect(response.statusCode).toBe(200);
    const row = response.json<CollectionRowDto>();
    expect(row.id).toBe(inserted.id);
    expect(row.data.name).toBe("Dave");
  });

  it("PATCH /collections/:name/rows/:id updates and returns the row", async () => {
    const insertResponse = await harness.request({
      method: "POST",
      url: ApiPaths.collectionRows("contacts"),
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ name: "Eve", email: "eve@example.com" }),
    });
    const inserted = insertResponse.json<CollectionRowDto>();

    const patchResponse = await harness.request({
      method: "PATCH",
      url: ApiPaths.collectionRow("contacts", inserted.id),
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ name: "Eve Updated" }),
    });
    expect(patchResponse.statusCode).toBe(200);
    const updated = patchResponse.json<CollectionRowDto>();
    expect(updated.id).toBe(inserted.id);
    expect(updated.data.name).toBe("Eve Updated");
  });

  it("DELETE /collections/:name/rows/:id returns deleted:true", async () => {
    const insertResponse = await harness.request({
      method: "POST",
      url: ApiPaths.collectionRows("contacts"),
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ name: "Frank" }),
    });
    const inserted = insertResponse.json<CollectionRowDto>();

    const deleteResponse = await harness.request({
      method: "DELETE",
      url: ApiPaths.collectionRow("contacts", inserted.id),
    });
    expect(deleteResponse.statusCode).toBe(200);
    const result = deleteResponse.json<{ deleted: boolean }>();
    expect(result.deleted).toBe(true);
  });

  it("POST /collections/sync returns sync result", async () => {
    const response = await harness.request({ method: "POST", url: ApiPaths.syncCollections() });
    expect(response.statusCode).toBe(200);
    const result = response.json<SyncCollectionsResponseDto>();
    expect(typeof result.planned).toBe("number");
    expect(typeof result.applied).toBe("number");
    expect(result.dryRun).toBe(false);
  });

  it("POST /collections/sync?dryRun=1 returns planned-only result", async () => {
    const response = await harness.request({
      method: "POST",
      url: `${ApiPaths.syncCollections()}?dryRun=1`,
    });
    expect(response.statusCode).toBe(200);
    const result = response.json<SyncCollectionsResponseDto>();
    expect(result.dryRun).toBe(true);
    expect(result.applied).toBe(0);
  });
});
