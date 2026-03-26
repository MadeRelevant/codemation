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
