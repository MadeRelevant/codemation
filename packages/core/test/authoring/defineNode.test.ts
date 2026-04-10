import type { NodeExecutionContext, RunnableNode } from "../../src/contracts/runtimeTypes";
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
      async execute(args, { config, credentials }) {
        const session = await credentials.service();
        const row = args.input as Record<string, unknown>;
        return {
          ...row,
          [config.field]: `${session.baseUrl}:${String(row[config.field] ?? "").toUpperCase()}`,
        };
      },
    });

    const config = helperNode.create({ field: "subject" });
    const runtime = new (config.type as new () => RunnableNode<typeof config>)();
    const itemJson = { subject: "hello" };
    const ctx = {
      config,
      nodeId: "n1",
      activationId: "a1",
      runId: "r1",
      workflowId: "w1",
      subworkflowDepth: 0,
      engineMaxNodeActivations: 10_000,
      engineMaxSubworkflowDepth: 32,
      now: () => new Date(),
      data: { completedNodeOutputs: {} },
      binary: {},
      getCredential: async () => ({
        baseUrl: "api",
        apiKey: "secret",
      }),
    } as unknown as NodeExecutionContext<typeof config>;

    const out = await runtime.execute({
      input: itemJson,
      item: { json: itemJson },
      itemIndex: 0,
      items: [{ json: itemJson }],
      ctx,
    });

    expect(out).toEqual({
      subject: "api:HELLO",
    });
  });

  it("exposes icon on created configs when defineNode sets icon", () => {
    const iconNode = defineNode({
      key: "authoring.iconProbe",
      title: "Icon probe",
      icon: "lucide:braces",
      input: {},
      execute({ input }, _context) {
        return input;
      },
    });

    const config = iconNode.create({} as Record<string, never>);
    expect(config.icon).toBe("lucide:braces");
  });
});
