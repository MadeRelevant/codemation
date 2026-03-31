import type { CodemationConfig } from "@codemation/host";
import { expect, test } from "vitest";

import { ConsumerDatabaseConnectionResolver } from "../src/database/ConsumerDatabaseConnectionResolver";

const consumerRoot = "/tmp/codemation-consumer-root";

test("uses CodemationConfig.runtime.database.url for postgresql", () => {
  const r = new ConsumerDatabaseConnectionResolver();
  const persistence = r.resolve(
    { DATABASE_URL: "postgresql://localhost/should-be-ignored" } as NodeJS.ProcessEnv,
    { runtime: { database: { kind: "postgresql", url: "postgresql://localhost/from-config" } } } as CodemationConfig,
    consumerRoot,
  );
  expect(persistence).toEqual({ kind: "postgresql", databaseUrl: "postgresql://localhost/from-config" });
});

test("falls back to CodemationConfig.runtime.database.url", () => {
  const r = new ConsumerDatabaseConnectionResolver();
  const persistence = r.resolve(
    {} as NodeJS.ProcessEnv,
    { runtime: { database: { kind: "postgresql", url: "postgresql://localhost/from-config" } } } as CodemationConfig,
    consumerRoot,
  );
  expect(persistence).toEqual({ kind: "postgresql", databaseUrl: "postgresql://localhost/from-config" });
});

test("returns none when runtime.database is absent", () => {
  const r = new ConsumerDatabaseConnectionResolver();
  expect(
    r.resolve({ DATABASE_URL: "postgresql://x" } as NodeJS.ProcessEnv, {} as CodemationConfig, consumerRoot),
  ).toEqual({
    kind: "none",
  });
});

test("throws when postgresql is configured without a database URL", () => {
  const r = new ConsumerDatabaseConnectionResolver();
  expect(() =>
    r.resolve(
      {} as NodeJS.ProcessEnv,
      { runtime: { database: { kind: "postgresql" } } } as CodemationConfig,
      consumerRoot,
    ),
  ).toThrow(/no database URL/);
});

test("CODEMATION_DATABASE_KIND selects postgresql when set alongside a postgres URL", () => {
  const r = new ConsumerDatabaseConnectionResolver();
  expect(
    r.resolve(
      { CODEMATION_DATABASE_KIND: "postgresql" } as NodeJS.ProcessEnv,
      { runtime: { database: { url: "postgresql://localhost/db" } } } as CodemationConfig,
      consumerRoot,
    ),
  ).toEqual({ kind: "postgresql", databaseUrl: "postgresql://localhost/db" });
});

test("resolves PGlite data directory from CODEMATION_PGLITE_DATA_DIR relative to consumer root", () => {
  const r = new ConsumerDatabaseConnectionResolver();
  expect(
    r.resolve(
      { CODEMATION_PGLITE_DATA_DIR: "custom-pg" } as NodeJS.ProcessEnv,
      { runtime: { database: { kind: "pglite" } } } as CodemationConfig,
      "/app/consumer",
    ),
  ).toEqual({ kind: "pglite", dataDir: "/app/consumer/custom-pg" });
});

test("uses configured pgliteDataDir when env override is absent", () => {
  const r = new ConsumerDatabaseConnectionResolver();
  expect(
    r.resolve(
      {} as NodeJS.ProcessEnv,
      { runtime: { database: { kind: "pglite", pgliteDataDir: "/var/pglite" } } } as CodemationConfig,
      consumerRoot,
    ),
  ).toEqual({ kind: "pglite", dataDir: "/var/pglite" });
});
