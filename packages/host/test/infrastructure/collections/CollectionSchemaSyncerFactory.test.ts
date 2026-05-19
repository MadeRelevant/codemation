import { describe, expect, it } from "vitest";
import { CollectionSchemaSyncerFactory } from "../../../src/infrastructure/collections/CollectionSchemaSyncerFactory";
import { CollectionRegistry } from "../../../src/infrastructure/collections/CollectionRegistry";
import { CollectionSchemaSyncer } from "../../../src/infrastructure/collections/CollectionSchemaSyncer";

function makePrismaClient(): object {
  return { $queryRawUnsafe: async () => [], $executeRawUnsafe: async () => 0 };
}

function makeLogger(): object {
  return { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
}

function makeAppConfig(kind: string): object {
  return { persistence: { kind }, env: {}, collections: [] };
}

function makeRegistry(kind: string): CollectionRegistry {
  return new CollectionRegistry(makeAppConfig(kind) as never);
}

describe("CollectionSchemaSyncerFactory.create", () => {
  it("returns a CollectionSchemaSyncer for postgresql persistence kind", () => {
    const appConfig = makeAppConfig("postgresql");
    const syncer = CollectionSchemaSyncerFactory.create(
      appConfig as never,
      makeRegistry("postgresql"),
      makePrismaClient() as never,
      makeLogger() as never,
    );
    expect(syncer).toBeInstanceOf(CollectionSchemaSyncer);
  });

  it("returns a CollectionSchemaSyncer for sqlite persistence kind", () => {
    const appConfig = makeAppConfig("sqlite");
    const syncer = CollectionSchemaSyncerFactory.create(
      appConfig as never,
      makeRegistry("sqlite"),
      makePrismaClient() as never,
      makeLogger() as never,
    );
    expect(syncer).toBeInstanceOf(CollectionSchemaSyncer);
  });

  it("throws for unsupported persistence kind", () => {
    const appConfig = makeAppConfig("unknown");
    expect(() =>
      CollectionSchemaSyncerFactory.create(
        appConfig as never,
        makeRegistry("unknown"),
        makePrismaClient() as never,
        makeLogger() as never,
      ),
    ).toThrow(/not supported/);
  });
});
