import { defineCredential, defineNode } from "@codemation/core";
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
      run(items) {
        return items;
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
      run(items) {
        return items;
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
      registerValue() {},
      registerClass() {},
      registerFactory() {},
    });

    expect(registeredNodes).toHaveLength(1);
    expect(registeredCredentials).toEqual([helperCredential]);
  });
});
