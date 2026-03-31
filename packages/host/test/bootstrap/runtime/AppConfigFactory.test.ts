import { describe, expect, it } from "vitest";

import { AppConfigFactory } from "../../../src/bootstrap/runtime/AppConfigFactory";
import type { NormalizedCodemationConfig } from "../../../src/presentation/config/CodemationConfigNormalizer";

function normalizedBase(overrides: Partial<NormalizedCodemationConfig> = {}): NormalizedCodemationConfig {
  return {
    containerRegistrations: [],
    workflows: [],
    ...overrides,
  } as NormalizedCodemationConfig;
}

describe("AppConfigFactory", () => {
  const factory = new AppConfigFactory();

  it("throws when postgresql is selected but database URL is not a postgres URL", () => {
    expect(() =>
      factory.create({
        repoRoot: "/repo",
        consumerRoot: "/consumer",
        env: {},
        config: normalizedBase({
          runtime: {
            database: { kind: "postgresql", url: "mysql://localhost/db" },
          },
        }),
        workflowSources: [],
      }),
    ).toThrow(/postgresql:\/\/ or postgres:\/\//);
  });

  it("maps CODEMATION_DATABASE_KIND over configured database kind", () => {
    const app = factory.create({
      repoRoot: "/repo",
      consumerRoot: "/consumer",
      env: { CODEMATION_DATABASE_KIND: "pglite" } as NodeJS.ProcessEnv,
      config: normalizedBase({
        runtime: {
          database: { kind: "postgresql", url: "postgresql://localhost/db" },
        },
      }),
      workflowSources: [],
    });
    expect(app.persistence).toEqual({
      kind: "pglite",
      dataDir: "/consumer/.codemation/pglite",
    });
  });

  it("defaults scheduler to bullmq when REDIS_URL is set and scheduler kind is unset", () => {
    const app = factory.create({
      repoRoot: "/repo",
      consumerRoot: "/consumer",
      env: { REDIS_URL: "redis://127.0.0.1:6379" } as NodeJS.ProcessEnv,
      config: normalizedBase({
        runtime: {
          database: { kind: "postgresql", url: "postgresql://localhost/db" },
        },
      }),
      workflowSources: [],
    });
    expect(app.scheduler.kind).toBe("bullmq");
    expect(app.scheduler.redisUrl).toBe("redis://127.0.0.1:6379");
  });

  it("uses explicit runtime.scheduler.kind when provided", () => {
    const app = factory.create({
      repoRoot: "/repo",
      consumerRoot: "/consumer",
      env: { REDIS_URL: "redis://127.0.0.1:6379" } as NodeJS.ProcessEnv,
      config: normalizedBase({
        runtime: {
          database: { kind: "postgresql", url: "postgresql://localhost/db" },
          scheduler: { kind: "local" },
        },
      }),
      workflowSources: [],
    });
    expect(app.scheduler.kind).toBe("local");
  });

  it("defaults event bus to redis when scheduler is bullmq and event bus kind is unset", () => {
    const app = factory.create({
      repoRoot: "/repo",
      consumerRoot: "/consumer",
      env: { REDIS_URL: "redis://127.0.0.1:6379" } as NodeJS.ProcessEnv,
      config: normalizedBase({
        runtime: {
          database: { kind: "postgresql", url: "postgresql://localhost/db" },
          scheduler: { kind: "bullmq", workerQueues: ["default"] },
        },
      }),
      workflowSources: [],
    });
    expect(app.eventing.kind).toBe("redis");
  });

  it("falls back to websocket port 3001 when CODEMATION_WS_PORT is invalid", () => {
    const app = factory.create({
      repoRoot: "/repo",
      consumerRoot: "/consumer",
      env: { CODEMATION_WS_PORT: "not-a-number" } as NodeJS.ProcessEnv,
      config: normalizedBase(),
      workflowSources: [],
    });
    expect(app.webSocketPort).toBe(3001);
  });
});
