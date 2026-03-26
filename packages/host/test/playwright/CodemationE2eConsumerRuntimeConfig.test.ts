import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const e2eConfigPath = path.resolve(import.meta.dirname, "..", "..", "..", "e2e", "codemation.config.ts");
const managedEnvKeys = ["DATABASE_URL", "REDIS_URL", "CODEMATION_E2E_FORCE_LOCAL_RUNTIME"] as const;
let importCounter = 0;
const originalEnv = new Map(managedEnvKeys.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of managedEnvKeys) {
    const originalValue = originalEnv.get(key);
    if (originalValue === undefined) {
      delete process.env[key];
      continue;
    }
    process.env[key] = originalValue;
  }
});

async function loadCodemationHost(env: Readonly<Record<string, string | undefined>>) {
  for (const key of managedEnvKeys) {
    const value = env[key];
    if (value === undefined) {
      delete process.env[key];
      continue;
    }
    process.env[key] = value;
  }
  const moduleUrl = `${pathToFileURL(e2eConfigPath).href}?case=${(importCounter += 1)}`;
  const imported = (await import(moduleUrl)) as {
    codemationHost: { runtime: { scheduler: { kind: string }; eventBus: { kind: string } } };
  };
  return imported.codemationHost;
}

describe("browser e2e consumer runtime config", () => {
  it("uses redis-backed runtime when REDIS_URL is present and no override is set", async () => {
    const host = await loadCodemationHost({
      DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5432/postgres",
      REDIS_URL: "redis://127.0.0.1:6379",
      CODEMATION_E2E_FORCE_LOCAL_RUNTIME: undefined,
    });
    expect(host.runtime.scheduler.kind).toBe("bullmq");
    expect(host.runtime.eventBus.kind).toBe("redis");
  });

  it("forces local runtime for browser e2e even when REDIS_URL exists", async () => {
    const host = await loadCodemationHost({
      DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5432/postgres",
      REDIS_URL: "redis://127.0.0.1:6379",
      CODEMATION_E2E_FORCE_LOCAL_RUNTIME: "1",
    });
    expect(host.runtime.scheduler.kind).toBe("local");
    expect(host.runtime.eventBus.kind).toBe("memory");
  });
});
