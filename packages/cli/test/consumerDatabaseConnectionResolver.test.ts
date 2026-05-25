import path from "node:path";
import { expect, test } from "vitest";

import { ConsumerDatabaseConnectionResolver } from "../src/database/ConsumerDatabaseConnectionResolver";

const consumerRoot = "/tmp/codemation-consumer-root";

test("resolves postgresql from CODEMATION_DATABASE_URL", () => {
  const r = new ConsumerDatabaseConnectionResolver();
  const persistence = r.resolveFromEnv(
    { CODEMATION_DATABASE_URL: "postgresql://localhost/from-env" } as NodeJS.ProcessEnv,
    consumerRoot,
  );
  expect(persistence).toEqual({ kind: "postgresql", databaseUrl: "postgresql://localhost/from-env" });
});

test("resolves sqlite from CODEMATION_DATABASE_URL with relative path", () => {
  const r = new ConsumerDatabaseConnectionResolver();
  const persistence = r.resolveFromEnv(
    { CODEMATION_DATABASE_URL: "sqlite://custom/sqlite.db" } as NodeJS.ProcessEnv,
    consumerRoot,
  );
  expect(persistence).toEqual({ kind: "sqlite", databaseFilePath: path.resolve(consumerRoot, "custom/sqlite.db") });
});

test("resolves sqlite from CODEMATION_DATABASE_URL with absolute path", () => {
  const r = new ConsumerDatabaseConnectionResolver();
  const persistence = r.resolveFromEnv(
    { CODEMATION_DATABASE_URL: "sqlite:///var/codemation.sqlite" } as NodeJS.ProcessEnv,
    consumerRoot,
  );
  expect(persistence).toEqual({ kind: "sqlite", databaseFilePath: "/var/codemation.sqlite" });
});

test("defaults to local SQLite file when CODEMATION_DATABASE_URL is absent", () => {
  const r = new ConsumerDatabaseConnectionResolver();
  const persistence = r.resolveFromEnv({} as NodeJS.ProcessEnv, consumerRoot);
  expect(persistence).toEqual({
    kind: "sqlite",
    databaseFilePath: path.resolve(consumerRoot, ".codemation", "codemation.sqlite"),
  });
});

test("normalises pgsql:// scheme to postgresql://", () => {
  const r = new ConsumerDatabaseConnectionResolver();
  const persistence = r.resolveFromEnv(
    { CODEMATION_DATABASE_URL: "pgsql://user:pass@host:5432/db" } as NodeJS.ProcessEnv,
    consumerRoot,
  );
  expect(persistence).toEqual({ kind: "postgresql", databaseUrl: "postgresql://user:pass@host:5432/db" });
});
