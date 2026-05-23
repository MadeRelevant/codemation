import assert from "node:assert/strict";
import { test } from "vitest";

import { CollectionRowFormSchemaFactory } from "../../src/features/collections/components/CollectionRowFormSchemaFactory";
import type { CollectionFieldDto } from "@codemation/host/dto";

function makeField(overrides: Partial<CollectionFieldDto> = {}): CollectionFieldDto {
  return { name: "field", type: "text", nullable: false, hasDefault: false, ...overrides };
}

test("uuid type maps to z.string()", () => {
  const schema = CollectionRowFormSchemaFactory.create([makeField({ name: "id", type: "uuid" })]);
  assert.ok(schema.safeParse({ id: "550e8400-e29b-41d4-a716-446655440000" }).success);
  assert.ok(!schema.safeParse({ id: 123 }).success);
});

test("bigint type maps to z.coerce.number().int()", () => {
  const schema = CollectionRowFormSchemaFactory.create([makeField({ name: "amount", type: "bigint" })]);
  assert.ok(schema.safeParse({ amount: 9999999 }).success);
  assert.ok(schema.safeParse({ amount: "42" }).success);
  assert.ok(!schema.safeParse({ amount: 3.14 }).success);
});

test("double type maps to z.coerce.number()", () => {
  const schema = CollectionRowFormSchemaFactory.create([makeField({ name: "price", type: "double" })]);
  assert.ok(schema.safeParse({ price: 3.14 }).success);
  assert.ok(schema.safeParse({ price: "2.5" }).success);
});

test("timestamptz type maps to z.coerce.date()", () => {
  const schema = CollectionRowFormSchemaFactory.create([makeField({ name: "created_at", type: "timestamptz" })]);
  assert.ok(schema.safeParse({ created_at: "2026-05-15T00:00:00.000Z" }).success);
  assert.ok(schema.safeParse({ created_at: new Date() }).success);
});

test("jsonb type maps to z.unknown() (accepts any value)", () => {
  const schema = CollectionRowFormSchemaFactory.create([makeField({ name: "meta", type: "jsonb" })]);
  assert.ok(schema.safeParse({ meta: { key: "value" } }).success);
  assert.ok(schema.safeParse({ meta: [1, 2, 3] }).success);
  assert.ok(schema.safeParse({ meta: null }).success);
});

test("unknown type falls back to z.string()", () => {
  const schema = CollectionRowFormSchemaFactory.create([makeField({ name: "x", type: "unknown_future_type" })]);
  assert.ok(schema.safeParse({ x: "hello" }).success);
  assert.ok(!schema.safeParse({ x: 42 }).success);
});

test("create builds a schema with multiple fields of different types", () => {
  const schema = CollectionRowFormSchemaFactory.create([
    makeField({ name: "name", type: "text" }),
    makeField({ name: "count", type: "int" }),
    makeField({ name: "ratio", type: "double" }),
  ]);
  assert.ok(schema.safeParse({ name: "foo", count: 1, ratio: 0.5 }).success);
});

test("nullable field is optional in the schema", () => {
  const schema = CollectionRowFormSchemaFactory.create([makeField({ name: "notes", type: "jsonb", nullable: true })]);
  assert.ok(schema.safeParse({}).success);
});

test("bool type maps to z.coerce.boolean()", () => {
  const schema = CollectionRowFormSchemaFactory.create([makeField({ name: "active", type: "bool" })]);
  assert.ok(schema.safeParse({ active: true }).success);
  assert.ok(schema.safeParse({ active: false }).success);
  assert.ok(schema.safeParse({ active: "true" }).success);
});

test("int type maps to z.coerce.number().int()", () => {
  const schema = CollectionRowFormSchemaFactory.create([makeField({ name: "count", type: "int" })]);
  assert.ok(schema.safeParse({ count: 42 }).success);
  assert.ok(schema.safeParse({ count: "10" }).success);
  assert.ok(!schema.safeParse({ count: 1.5 }).success);
});

test("text type maps to z.string()", () => {
  const schema = CollectionRowFormSchemaFactory.create([makeField({ name: "label", type: "text" })]);
  assert.ok(schema.safeParse({ label: "hello" }).success);
  assert.ok(!schema.safeParse({ label: 42 }).success);
});
