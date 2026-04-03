import type { Node, NodeExecutionContext } from "../../src/contracts/runtimeTypes";
import { describe, expect, it } from "vitest";
import { defineCredential, defineNode } from "../../src";
import { z } from "zod";

describe("defineNode", () => {
  it("creates runnable node configs that preserve helper logic and typed credentials", async () => {
    const helperCredential = defineCredential({
      key: "authoring.helperCredential",
      label: "Helper credential",
      public: z.object({
        baseUrl: z.string(),
      }),
      secret: z.object({
        apiKey: z.string(),
      }),
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

    const helperNode = defineNode({
      key: "authoring.uppercaseSubject",
      title: "Uppercase subject",
      input: {
        field: "string",
      },
      credentials: {
        service: helperCredential,
      },
      async run(items, { config, credentials }) {
        const session = await credentials.service();
        return items.map((item) => ({
          ...item,
          [config.field]: `${session.baseUrl}:${String(item[config.field as keyof typeof item] ?? "").toUpperCase()}`,
        }));
      },
    });

    const config = helperNode.create({ field: "subject" });
    const runtime = new (config.type as new () => Node<typeof config>)();
    const outputs = await runtime.execute(
      [
        {
          json: {
            subject: "hello",
          },
        },
      ],
      {
        config,
        getCredential: async () => ({
          baseUrl: "api",
          apiKey: "secret",
        }),
      } as NodeExecutionContext<typeof config>,
    );

    expect(outputs.main).toEqual([
      {
        json: {
          subject: "api:HELLO",
        },
      },
    ]);
  });
});
