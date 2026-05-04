import { describe, it, expect, beforeEach } from "vitest";
import { defineCollection, c, DefinedCollectionRegistry, type CollectionDefinition } from "@codemation/core";

describe("defineCollection", () => {
  beforeEach(() => {
    // Clear the registry before each test
    const _list = DefinedCollectionRegistry.list();
    // We can't directly clear, but we can test resolution
  });

  it("should create a collection definition with text fields", () => {
    const collection = defineCollection({
      name: "users",
      fields: {
        email: c.text().notNull(),
        name: c.text(),
      },
    });

    expect(collection.kind).toBe("defined-collection");
    expect(collection.definition.name).toBe("users");
    expect(collection.definition.fields).toHaveProperty("email");
    expect(collection.definition.fields).toHaveProperty("name");
    expect(collection.definition.fields.email.type).toBe("text");
    expect(collection.definition.fields.email.nullable).toBe(false);
    expect(collection.definition.fields.name.nullable).toBe(true);
  });

  it("should support all column types", () => {
    const collection = defineCollection({
      name: "test_table",
      fields: {
        text_col: c.text(),
        int_col: c.int(),
        bigint_col: c.bigint(),
        double_col: c.double(),
        bool_col: c.bool(),
        ts_col: c.timestamptz(),
        json_col: c.jsonb(),
        uuid_col: c.uuid(),
      },
    });

    expect(collection.definition.fields.text_col.type).toBe("text");
    expect(collection.definition.fields.int_col.type).toBe("int");
    expect(collection.definition.fields.bigint_col.type).toBe("bigint");
    expect(collection.definition.fields.double_col.type).toBe("double");
    expect(collection.definition.fields.bool_col.type).toBe("bool");
    expect(collection.definition.fields.ts_col.type).toBe("timestamptz");
    expect(collection.definition.fields.json_col.type).toBe("jsonb");
    expect(collection.definition.fields.uuid_col.type).toBe("uuid");
  });

  it("should support default values", () => {
    const collection = defineCollection({
      name: "test_table",
      fields: {
        status: c.text().default("active"),
      },
    });

    expect(collection.definition.fields.status.default).toBe("active");
    expect(collection.definition.fields.status.nullable).toBe(false);
  });

  it("should reject invalid collection names", () => {
    expect(() => {
      defineCollection({
        name: "Invalid-Name",
        fields: { col: c.text() },
      });
    }).toThrow(/lowercase letters/);

    expect(() => {
      defineCollection({
        name: "2invalid",
        fields: { col: c.text() },
      });
    }).toThrow(/start with a lowercase letter/);
  });

  it("should reject invalid field names", () => {
    expect(() => {
      defineCollection({
        name: "test",
        fields: { "Invalid-Field": c.text() },
      });
    }).toThrow(/lowercase letters/);
  });

  it("should reject reserved field names", () => {
    expect(() => {
      defineCollection({
        name: "test",
        fields: { id: c.text() },
      });
    }).toThrow(/reserved/);

    expect(() => {
      defineCollection({
        name: "test",
        fields: { created_at: c.text() },
      });
    }).toThrow(/reserved/);

    expect(() => {
      defineCollection({
        name: "test",
        fields: { updated_at: c.text() },
      });
    }).toThrow(/reserved/);
  });

  it("should validate indexes reference existing fields", () => {
    expect(() => {
      defineCollection({
        name: "test",
        fields: { email: c.text() },
        indexes: [{ on: ["nonexistent"] }],
      });
    }).toThrow(/non-existent field/);
  });

  it("should accept valid indexes", () => {
    const collection = defineCollection({
      name: "test",
      fields: {
        email: c.text(),
        user_id: c.int(),
      },
      indexes: [{ on: ["email"], unique: true }, { on: ["user_id"] }],
    });

    expect(collection.definition.indexes).toHaveLength(2);
    expect(collection.definition.indexes[0].on).toEqual(["email"]);
    expect(collection.definition.indexes[0].unique).toBe(true);
    expect(collection.definition.indexes[1].on).toEqual(["user_id"]);
  });

  it("should register the collection in the registry", () => {
    defineCollection({
      name: "registry_test",
      fields: { col: c.text() },
    });

    const resolved = DefinedCollectionRegistry.resolve("registry_test");
    expect(resolved).toBeDefined();
    expect(resolved?.name).toBe("registry_test");
  });

  it("should support register callback", () => {
    const collection = defineCollection({
      name: "callback_test",
      fields: { col: c.text() },
    });

    const registered: CollectionDefinition[] = [];
    collection.register({
      registerCollection(def) {
        registered.push(def);
      },
    });

    expect(registered).toHaveLength(1);
    expect(registered[0].name).toBe("callback_test");
  });
});
