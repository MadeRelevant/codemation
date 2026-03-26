import path from "node:path";
import { describe, expect, it } from "vitest";
import { DatabasePersistenceResolver } from "../../src/infrastructure/persistence/DatabasePersistenceResolver";

describe("DatabasePersistenceResolver", () => {
  const consumerRoot = "/tmp/codemation-consumer-root";
  const resolver = new DatabasePersistenceResolver();

  it("resolves postgresql from CodemationConfig.runtime.database.url", () => {
    expect(
      resolver.resolve({
        runtimeConfig: {
          database: { kind: "postgresql", url: "postgresql://localhost:5432/db" },
        },
        env: {} as NodeJS.ProcessEnv,
        consumerRoot,
      }),
    ).toEqual({ kind: "postgresql", databaseUrl: "postgresql://localhost:5432/db" });
  });

  it("ignores DATABASE_URL when runtime.database is set (config is the source of truth)", () => {
    expect(
      resolver.resolve({
        runtimeConfig: {
          database: { kind: "postgresql", url: "postgresql://localhost/from-config" },
        },
        env: { DATABASE_URL: "postgresql://localhost/from-env" } as NodeJS.ProcessEnv,
        consumerRoot,
      }),
    ).toEqual({ kind: "postgresql", databaseUrl: "postgresql://localhost/from-config" });
  });

  it("defaults runtime.database to pglite with data dir under consumer root when kind omitted", () => {
    expect(
      resolver.resolve({
        runtimeConfig: { database: {} },
        env: {} as NodeJS.ProcessEnv,
        consumerRoot,
      }),
    ).toEqual({ kind: "pglite", dataDir: path.resolve(consumerRoot, ".codemation/pglite") });
  });

  it("returns none when runtime.database is absent", () => {
    expect(
      resolver.resolve({
        runtimeConfig: {},
        env: { DATABASE_URL: "postgresql://ignored" } as NodeJS.ProcessEnv,
        consumerRoot,
      }),
    ).toEqual({ kind: "none" });
  });
});
