import type { CodemationConfig } from "@codemation/host";
import { expect, test } from "vitest";

import { ConsumerDatabaseUrlResolver } from "../src/database/ConsumerDatabaseUrlResolver";

test("prefers DATABASE_URL from the environment over config", () => {
  const r = new ConsumerDatabaseUrlResolver();
  const url = r.resolve(
    { DATABASE_URL: "postgresql://localhost/from-env" } as NodeJS.ProcessEnv,
    { runtime: { database: { url: "postgresql://localhost/from-config" } } } as CodemationConfig,
  );
  expect(url).toBe("postgresql://localhost/from-env");
});

test("falls back to CodemationConfig.runtime.database.url", () => {
  const r = new ConsumerDatabaseUrlResolver();
  const url = r.resolve(
    {} as NodeJS.ProcessEnv,
    { runtime: { database: { url: "postgresql://localhost/from-config" } } } as CodemationConfig,
  );
  expect(url).toBe("postgresql://localhost/from-config");
});

test("returns undefined when neither source is set", () => {
  const r = new ConsumerDatabaseUrlResolver();
  expect(r.resolve({} as NodeJS.ProcessEnv, {} as CodemationConfig)).toBeUndefined();
});
