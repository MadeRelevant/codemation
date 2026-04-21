import assert from "node:assert/strict";
import { test } from "vitest";
import { z } from "zod";

import { AIAgentExecutionHelpersFactory } from "../src/nodes/AIAgentExecutionHelpersFactory";

test("createJsonSchemaRecord strips $schema from the root for Zod object inputs", () => {
  const factory = new AIAgentExecutionHelpersFactory();
  const record = factory.createJsonSchemaRecord(z.object({ question: z.string() }), {
    schemaName: "specialist",
    requireObjectRoot: true,
  });

  assert.equal(record.type, "object");
  assert.ok(record.properties && typeof record.properties === "object");
  assert.equal(record["$schema"], undefined);
});

test("createJsonSchemaRecord accepts object schemas with no properties and normalizes to an empty properties bag", () => {
  const factory = new AIAgentExecutionHelpersFactory();
  const record = factory.createJsonSchemaRecord(z.object({}), {
    schemaName: "specialist",
    requireObjectRoot: true,
  });

  assert.equal(record.type, "object");
  assert.deepEqual(record.properties, {});
  assert.equal(record["$schema"], undefined);
});

test("createJsonSchemaRecord throws when requireObjectRoot is true but schema root is not an object", () => {
  const factory = new AIAgentExecutionHelpersFactory();

  assert.throws(() =>
    factory.createJsonSchemaRecord(z.string(), {
      schemaName: "badTool",
      requireObjectRoot: true,
    }),
  );
});

test("createJsonSchemaRecord keeps nested property schemas and required arrays intact", () => {
  const factory = new AIAgentExecutionHelpersFactory();
  const record = factory.createJsonSchemaRecord(
    z.object({
      name: z.string(),
      details: z.object({ count: z.number() }),
    }),
    { schemaName: "nested", requireObjectRoot: true },
  );

  assert.deepEqual(record.required, ["name", "details"]);
  const properties = record.properties as Record<string, { type?: unknown; properties?: unknown }>;
  assert.equal(properties.name?.type, "string");
  assert.equal(properties.details?.type, "object");
  assert.ok(properties.details?.properties);
});

test("createJsonSchemaRecord prefers the schema instance toJSONSchema method so cross-namespace Zod instances still convert", () => {
  const factory = new AIAgentExecutionHelpersFactory();
  const captured: Array<unknown> = [];
  /**
   * Simulates the consumer-namespace case: a Zod-schema-shaped object whose Zod class internals
   * (`.def`, `._zod`) would fail when passed to the framework's module-level `toJSONSchema`, but
   * which still exposes a working instance `.toJSONSchema(...)` method bound inside its own Zod
   * module. `createJsonSchemaRecord` must call that method rather than the framework import.
   */
  const fakeConsumerSchema = {
    toJSONSchema(params: unknown): unknown {
      captured.push(params);
      return {
        $schema: "http://json-schema.org/draft-07/schema#",
        type: "object",
        properties: { question: { type: "string" } },
        required: ["question"],
        additionalProperties: false,
      };
    },
  };

  const record = factory.createJsonSchemaRecord(
    fakeConsumerSchema as unknown as Parameters<typeof factory.createJsonSchemaRecord>[0],
    { schemaName: "specialist", requireObjectRoot: true },
  );

  assert.deepEqual(captured, [{ target: "draft-07" }]);
  assert.equal(record.type, "object");
  assert.deepEqual(record.required, ["question"]);
  assert.equal(record["$schema"], undefined);
});
