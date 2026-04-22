import assert from "node:assert/strict";
import { test } from "vitest";
import { z } from "zod";

import { AIAgentExecutionHelpersFactory } from "../src/nodes/AIAgentExecutionHelpersFactory";
import { OpenAiStrictJsonSchemaFactory } from "../src/chatModels/OpenAiStrictJsonSchemaFactory";

class StrictSchemaInvariantChecker {
  static assertStrictEverywhere(node: unknown, path: ReadonlyArray<string | number> = []): void {
    if (!node || typeof node !== "object" || Array.isArray(node)) {
      return;
    }
    const o = node as Record<string, unknown>;
    assert.equal(o["$schema"], undefined, `Unexpected $schema at ${StrictSchemaInvariantChecker.fmt(path)}`);
    assert.equal(
      o["unevaluatedProperties"],
      undefined,
      `Unexpected unevaluatedProperties at ${StrictSchemaInvariantChecker.fmt(path)}`,
    );
    if (StrictSchemaInvariantChecker.isObjectNode(o)) {
      const props = (o.properties ?? {}) as Record<string, unknown>;
      assert.equal(
        o.additionalProperties,
        false,
        `additionalProperties must be false at ${StrictSchemaInvariantChecker.fmt(path)}`,
      );
      assert.deepEqual(
        o.required,
        Object.keys(props),
        `required must list every property key at ${StrictSchemaInvariantChecker.fmt(path)}`,
      );
      for (const [key, value] of Object.entries(props)) {
        StrictSchemaInvariantChecker.assertStrictEverywhere(value, [...path, "properties", key]);
      }
    }
    for (const key of ["allOf", "anyOf", "oneOf", "prefixItems"] as const) {
      const branches = o[key];
      if (Array.isArray(branches)) {
        for (let index = 0; index < branches.length; index += 1) {
          StrictSchemaInvariantChecker.assertStrictEverywhere(branches[index], [...path, key, index]);
        }
      }
    }
    if (o.not) {
      StrictSchemaInvariantChecker.assertStrictEverywhere(o.not, [...path, "not"]);
    }
    if (o.items) {
      if (Array.isArray(o.items)) {
        for (let index = 0; index < o.items.length; index += 1) {
          StrictSchemaInvariantChecker.assertStrictEverywhere(o.items[index], [...path, "items", index]);
        }
      } else {
        StrictSchemaInvariantChecker.assertStrictEverywhere(o.items, [...path, "items"]);
      }
    }
    for (const key of ["$defs", "definitions"] as const) {
      const defs = o[key];
      if (defs && typeof defs === "object" && !Array.isArray(defs)) {
        for (const [name, value] of Object.entries(defs as Record<string, unknown>)) {
          StrictSchemaInvariantChecker.assertStrictEverywhere(value, [...path, key, name]);
        }
      }
    }
  }

  private static isObjectNode(o: Record<string, unknown>): boolean {
    const typeIsObject =
      o.type === "object" || (Array.isArray(o.type) && (o.type as ReadonlyArray<unknown>).includes("object"));
    const hasObjectProperties =
      o.properties !== undefined && typeof o.properties === "object" && !Array.isArray(o.properties);
    return typeIsObject || hasObjectProperties;
  }

  private static fmt(path: ReadonlyArray<string | number>): string {
    return path.length === 0 ? "<root>" : path.join(".");
  }
}

class StrictSchemaFactoryTestRig {
  readonly factory = new OpenAiStrictJsonSchemaFactory(new AIAgentExecutionHelpersFactory());
}

test("OpenAiStrictJsonSchemaFactory strictifies a plain z.object root", () => {
  const rig = new StrictSchemaFactoryTestRig();
  const schema = z.object({
    outcome: z.enum(["rfq", "other"]),
    summary: z.string(),
  });

  const record = rig.factory.createStructuredOutputRecord(schema, { schemaName: "out" });

  assert.equal(record.type, "object");
  StrictSchemaInvariantChecker.assertStrictEverywhere(record);
});

test("OpenAiStrictJsonSchemaFactory strictifies a z.discriminatedUnion root", () => {
  const rig = new StrictSchemaFactoryTestRig();
  const schema = z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("a"), value: z.string() }),
    z.object({ kind: z.literal("b"), count: z.number() }),
  ]);

  const record = rig.factory.createStructuredOutputRecord(schema, { schemaName: "out" });

  StrictSchemaInvariantChecker.assertStrictEverywhere(record);
  const branches = (record.anyOf ?? record.oneOf) as ReadonlyArray<Record<string, unknown>> | undefined;
  assert.ok(Array.isArray(branches) && branches.length === 2);
});

test("OpenAiStrictJsonSchemaFactory strictifies a z.union of objects root", () => {
  const rig = new StrictSchemaFactoryTestRig();
  const schema = z.union([z.object({ a: z.string() }), z.object({ b: z.number() })]);

  const record = rig.factory.createStructuredOutputRecord(schema, { schemaName: "out" });

  StrictSchemaInvariantChecker.assertStrictEverywhere(record);
});

test("OpenAiStrictJsonSchemaFactory strictifies a z.object(...).nullable() root", () => {
  const rig = new StrictSchemaFactoryTestRig();
  const schema = z.object({ message: z.string() }).nullable();

  const record = rig.factory.createStructuredOutputRecord(schema, { schemaName: "out" });

  StrictSchemaInvariantChecker.assertStrictEverywhere(record);
});

test("OpenAiStrictJsonSchemaFactory strictifies a z.array(z.object(...)) root", () => {
  const rig = new StrictSchemaFactoryTestRig();
  const schema = z.array(z.object({ sku: z.string(), quantity: z.number() }));

  const record = rig.factory.createStructuredOutputRecord(schema, { schemaName: "out" });

  assert.equal(record.type, "array");
  StrictSchemaInvariantChecker.assertStrictEverywhere(record);
});

test("OpenAiStrictJsonSchemaFactory strictifies deeply nested objects inside arrays and objects", () => {
  const rig = new StrictSchemaFactoryTestRig();
  const schema = z.object({
    company: z.object({ name: z.string(), confidence: z.number() }),
    lineItems: z.array(
      z.object({
        sku: z.string().nullable(),
        description: z.string(),
        quantity: z.number(),
        unitPrice: z.number().nullable(),
      }),
    ),
  });

  const record = rig.factory.createStructuredOutputRecord(schema, { schemaName: "out" });

  StrictSchemaInvariantChecker.assertStrictEverywhere(record);
});

test("OpenAiStrictJsonSchemaFactory forces required to list every property (optional becomes required under strict)", () => {
  const rig = new StrictSchemaFactoryTestRig();
  const schema = z.object({
    required: z.string(),
    optionalLegacy: z.string().optional(),
  });

  const record = rig.factory.createStructuredOutputRecord(schema, { schemaName: "out" });

  assert.deepEqual(record.required, ["required", "optionalLegacy"]);
  StrictSchemaInvariantChecker.assertStrictEverywhere(record);
});

test("OpenAiStrictJsonSchemaFactory strips JSON Schema keywords OpenAI rejects", () => {
  const rig = new StrictSchemaFactoryTestRig();
  const schema = z.object({ name: z.string() });

  const record = rig.factory.createStructuredOutputRecord(schema, { schemaName: "out" });

  assert.equal(record["$schema"], undefined);
  assert.equal(record["unevaluatedProperties"], undefined);
});

test("OpenAiStrictJsonSchemaFactory does not leak the Zod instance through the record", () => {
  const rig = new StrictSchemaFactoryTestRig();
  const schema = z.object({ outcome: z.string() });

  const record = rig.factory.createStructuredOutputRecord(schema, { schemaName: "out" });

  assert.equal(typeof record, "object");
  assert.equal(Array.isArray(record), false);
  assert.equal("_zod" in record, false);
  assert.equal("parse" in record, false);
});
