import type { NodeExecutionContext, RunnableNode } from "../../src/contracts/runtimeTypes";
import { describe, expect, it } from "vitest";
import { defineCredential, defineBatchNode, defineNode } from "../../src";
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

  it("stores keepBinaries on created configs when defineNode enables it", () => {
    const binaryKeepingNode = defineNode({
      key: "authoring.keepBinaries",
      title: "Keep binaries",
      input: {},
      keepBinaries: true,
      execute({ input }, _context) {
        return input;
      },
    });

    const config = binaryKeepingNode.create({} as Record<string, never>) as Readonly<{ keepBinaries?: boolean }>;

    expect(config.keepBinaries).toBe(true);
  });

  it("defaults keepBinaries to false for helper-defined nodes", () => {
    const defaultNode = defineNode({
      key: "authoring.defaultKeepBinaries",
      title: "Default keep binaries",
      input: {},
      execute({ input }, _context) {
        return input;
      },
    });

    const config = defaultNode.create({} as Record<string, never>) as Readonly<{ keepBinaries?: boolean }>;

    expect(config.keepBinaries).toBe(false);
  });

  it("plumbs inspectorSummary option into a method that reads sibling config fields", () => {
    type SummaryConfig = Readonly<{ method: string; url: string }>;
    const httpishNode = defineNode<"authoring.summary", SummaryConfig, unknown, unknown, undefined>({
      key: "authoring.summary",
      title: "Summary",
      input: { method: "GET", url: "" },
      inspectorSummary({ config }) {
        return [
          { label: "Method", value: config.method },
          { label: "URL", value: config.url },
        ];
      },
      execute({ input }) {
        return input;
      },
    });

    const instance = httpishNode.create({ method: "POST", url: "https://api.example.com/x" }) as Readonly<{
      inspectorSummary?: () => ReadonlyArray<{ label: string; value: string }> | undefined;
    }>;

    expect(typeof instance.inspectorSummary).toBe("function");
    expect(instance.inspectorSummary?.()).toEqual([
      { label: "Method", value: "POST" },
      { label: "URL", value: "https://api.example.com/x" },
    ]);
  });

  it("defineBatchNode created config exposes credential requirements and inspectorSummary", () => {
    const batchWithSummary = defineBatchNode({
      key: "authoring.batchSummary",
      title: "Batch summary",
      input: {} as Readonly<{ text: string }>,
      inspectorSummary({ config }) {
        return [{ label: "text", value: (config as Readonly<{ text: string }>).text }];
      },
      run(items) {
        return items;
      },
    });

    const config = batchWithSummary.create({ text: "hello" } as Readonly<{ text: string }>);
    // getCredentialRequirements returns empty when no credentials defined
    expect(config.getCredentialRequirements()).toEqual([]);
    // inspectorSummary delegates to the option
    expect(config.inspectorSummary?.()).toEqual([{ label: "text", value: "hello" }]);
    // register calls context.registerNode
    let registered = false;
    const fakeCtx = {
      registerNode: (_cls: unknown) => {
        registered = true;
      },
    };
    batchWithSummary.register(fakeCtx as never);
    expect(registered).toBe(true);
  });

  it("defineBatchNode runs all items at once and returns the batch result", async () => {
    const batchUpperCase = defineBatchNode({
      key: "authoring.batchUppercase",
      title: "Batch uppercase",
      input: {} as Readonly<{ text: string }>,
      async run(items) {
        return items.map((item) => ({ text: item.text.toUpperCase() }));
      },
    });

    const config = batchUpperCase.create({} as Readonly<{ text: string }>);
    const runtime = new (config.type as new () => RunnableNode<typeof config>)();

    const makeCtx = (_idx: number, _all: ReadonlyArray<{ text: string }>) =>
      ({
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
        getCredential: async () => ({}),
      }) as unknown as NodeExecutionContext<typeof config>;

    const items = [{ text: "hello" }, { text: "world" }];
    // For batch nodes, only the last item (itemIndex === items.length - 1) produces output
    const earlyOut = await runtime.execute({
      input: items[0]!,
      item: { json: items[0]! },
      itemIndex: 0,
      items: items.map((j) => ({ json: j })),
      ctx: makeCtx(0, items),
    });
    expect(earlyOut).toEqual([]);

    const finalOut = await runtime.execute({
      input: items[1]!,
      item: { json: items[1]! },
      itemIndex: 1,
      items: items.map((j) => ({ json: j })),
      ctx: makeCtx(1, items),
    });
    expect(finalOut).toEqual([{ text: "HELLO" }, { text: "WORLD" }]);
  });

  it("inspectorSummary() returns undefined when the option is not provided", () => {
    const noSummaryNode = defineNode({
      key: "authoring.noSummary",
      title: "No summary",
      input: {},
      execute({ input }) {
        return input;
      },
    });

    const instance = noSummaryNode.create({} as Record<string, never>) as Readonly<{
      inspectorSummary?: () => unknown;
    }>;

    expect(instance.inspectorSummary?.()).toBeUndefined();
  });
});
