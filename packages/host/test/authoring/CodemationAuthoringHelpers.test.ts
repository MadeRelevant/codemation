import { c, defineCollection, defineCredential, defineNode } from "@codemation/core";
import { describe, expect, it } from "vitest";
import { defineCodemationApp, definePlugin } from "../../src/presentation/config/CodemationAuthoring.types";
import { CodemationConfigNormalizer } from "../../src/presentation/config/CodemationConfigNormalizer";

describe("Codemation authoring helpers", () => {
  it("maps the beginner app surface onto the current host config", () => {
    const helperNode = defineNode({
      key: "hostAuthoring.uppercase",
      title: "Uppercase",
      input: {
        field: "string",
      },
      execute({ input }, _context) {
        return input;
      },
    });
    const helperCredential = defineCredential({
      key: "hostAuthoring.apiKey",
      label: "API key",
      public: {
        baseUrl: "string",
      },
      secret: {
        apiKey: "password",
      },
      async createSession({ publicConfig, material }) {
        return {
          baseUrl: publicConfig.baseUrl,
          apiKey: material.apiKey,
        };
      },
      async test() {
        return {
          status: "healthy",
          testedAt: new Date().toISOString(),
        };
      },
    });

    const config = defineCodemationApp({
      name: "Support Automation",
      auth: {
        kind: "local",
        allowUnauthenticatedInDevelopment: true,
      },
      database: {
        kind: "sqlite",
        filePath: ".codemation/codemation.sqlite",
      },
      execution: {
        mode: "inline",
      },
      nodes: [helperNode],
      credentials: [helperCredential],
      workflows: [],
    });

    const normalized = new CodemationConfigNormalizer().normalize(config);

    expect(normalized.app).toEqual({
      auth: {
        kind: "local",
        allowUnauthenticatedInDevelopment: true,
      },
      database: {
        kind: "sqlite",
        sqliteFilePath: ".codemation/codemation.sqlite",
      },
      scheduler: {
        kind: "inline",
        queuePrefix: undefined,
        workerQueues: undefined,
        redisUrl: undefined,
      },
      whitelabel: {
        productName: "Support Automation",
        logoPath: undefined,
      },
    });
    expect(normalized.credentialTypes).toContain(helperCredential);
    expect(normalized.containerRegistrations).toHaveLength(1);
  });

  it("creates plugins that register helper nodes and credentials", async () => {
    const helperNode = defineNode({
      key: "hostAuthoring.pluginNode",
      title: "Plugin node",
      input: {
        field: "string",
      },
      execute({ input }, _context) {
        return input;
      },
    });
    const helperCredential = defineCredential({
      key: "hostAuthoring.pluginCredential",
      label: "Plugin credential",
      public: {
        region: "string",
      },
      secret: {
        token: "password",
      },
      async createSession({ publicConfig, material }) {
        return {
          region: publicConfig.region,
          token: material.token,
        };
      },
      async test() {
        return {
          status: "healthy",
          testedAt: new Date().toISOString(),
        };
      },
    });
    const plugin = definePlugin({
      name: "Authoring plugin",
      nodes: [helperNode],
      credentials: [helperCredential],
    });

    const registeredNodes: unknown[] = [];
    const registeredCredentials: unknown[] = [];

    if (!plugin.register) {
      throw new Error("Authoring helper plugin should always provide register().");
    }

    await plugin.register({
      container: {} as never,
      appConfig: {} as never,
      loggerFactory: {} as never,
      registerNode(token) {
        registeredNodes.push(token);
      },
      registerCredentialType(type) {
        registeredCredentials.push(type);
      },
      registerCollection() {},
      registerValue() {},
      registerClass() {},
      registerFactory() {},
    });

    expect(registeredNodes).toHaveLength(1);
    expect(registeredCredentials).toEqual([helperCredential]);
  });

  it("resolves database.urlEnv from the environment", () => {
    const previousValue = process.env["DB_URL_AUTHORING_TEST"];
    process.env["DB_URL_AUTHORING_TEST"] = "postgresql://localhost/test";
    try {
      const config = defineCodemationApp({
        database: { kind: "postgresql", urlEnv: "DB_URL_AUTHORING_TEST" },
        workflowsDir: "./src/workflows",
      });
      expect(config.app?.database?.url).toBe("postgresql://localhost/test");
    } finally {
      if (previousValue === undefined) {
        delete process.env["DB_URL_AUTHORING_TEST"];
      } else {
        process.env["DB_URL_AUTHORING_TEST"] = previousValue;
      }
    }
  });

  it("rejects database.url and database.urlEnv set together", () => {
    expect(() =>
      defineCodemationApp({
        database: { kind: "postgresql", url: "postgresql://a", urlEnv: "DB_URL" },
        workflows: [],
      }),
    ).toThrow(/mutually exclusive/);
  });

  it("resolves execution.modeEnv from the environment", () => {
    const previousValue = process.env["EXEC_MODE_AUTHORING_TEST"];
    process.env["EXEC_MODE_AUTHORING_TEST"] = "queue";
    try {
      const config = defineCodemationApp({
        execution: { modeEnv: "EXEC_MODE_AUTHORING_TEST" },
        workflows: [],
      });
      expect(config.app?.scheduler?.kind).toBe("queue");
    } finally {
      if (previousValue === undefined) {
        delete process.env["EXEC_MODE_AUTHORING_TEST"];
      } else {
        process.env["EXEC_MODE_AUTHORING_TEST"] = previousValue;
      }
    }
  });

  it("rejects execution.mode and execution.modeEnv set together", () => {
    expect(() =>
      defineCodemationApp({
        execution: { mode: "inline", modeEnv: "EXEC_MODE" },
        workflows: [],
      }),
    ).toThrow(/mutually exclusive/);
  });

  it("resolves execution.redisUrlEnv from the environment", () => {
    const previousValue = process.env["REDIS_URL_AUTHORING_TEST"];
    process.env["REDIS_URL_AUTHORING_TEST"] = "redis://localhost:6379";
    try {
      const config = defineCodemationApp({
        execution: { redisUrlEnv: "REDIS_URL_AUTHORING_TEST" },
        workflows: [],
      });
      expect(config.app?.scheduler?.redisUrl).toBe("redis://localhost:6379");
    } finally {
      if (previousValue === undefined) {
        delete process.env["REDIS_URL_AUTHORING_TEST"];
      } else {
        process.env["REDIS_URL_AUTHORING_TEST"] = previousValue;
      }
    }
  });

  it("maps workflowsDir to workflowDiscovery.directories", () => {
    const config = defineCodemationApp({
      workflowsDir: "./src/workflows",
      workflows: [],
    });
    expect(config.workflowDiscovery?.directories).toContain("./src/workflows");
  });

  it("merges workflowsDir with existing workflowDiscovery.directories", () => {
    const config = defineCodemationApp({
      workflowDiscovery: { directories: ["./extra"] },
      workflowsDir: "./src/workflows",
      workflows: [],
    });
    const dirs = config.workflowDiscovery?.directories ?? [];
    expect(dirs).toContain("./extra");
    expect(dirs).toContain("./src/workflows");
  });

  it("normalizer accepts sqlite when auth kind is managed", () => {
    const config = defineCodemationApp({
      auth: { kind: "managed" as "local" },
      database: { kind: "sqlite", filePath: ".codemation/codemation.sqlite" },
      workflowsDir: "./src/workflows",
    });
    expect(() => new CodemationConfigNormalizer().normalize(config)).not.toThrow();
  });

  it("normalizer rejects managed mode with no workflow source", () => {
    const config = defineCodemationApp({
      auth: { kind: "managed" as "local" },
      database: { kind: "postgresql", url: "postgresql://localhost/test" },
    });
    expect(() => new CodemationConfigNormalizer().normalize(config)).toThrow(/workflow source/);
  });

  it("normalizer accepts managed mode with workflowsDir and postgresql", () => {
    const config = defineCodemationApp({
      auth: { kind: "managed" as "local" },
      database: { kind: "postgresql", url: "postgresql://localhost/test" },
      workflowsDir: "./src/workflows",
    });
    expect(() => new CodemationConfigNormalizer().normalize(config)).not.toThrow();
  });

  it("surfaces collections registered via defineCodemationApp onto normalized config", () => {
    const userCollection = defineCollection({
      name: "test_users",
      fields: {
        email: c.text().notNull(),
        age: c.int(),
      },
    });

    const config = defineCodemationApp({
      collections: [userCollection],
      workflows: [],
    });

    const normalized = new CodemationConfigNormalizer().normalize(config);

    expect(normalized.collections).toBeDefined();
    expect(normalized.collections!.some((col) => col.name === "test_users")).toBe(true);
  });
});
