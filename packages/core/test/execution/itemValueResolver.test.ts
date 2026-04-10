import assert from "node:assert/strict";
import { test } from "vitest";

import type { NodeExecutionContext, RunnableNodeConfig } from "../../src/index.ts";
import { ItemValueResolver } from "../../src/execution/ItemValueResolver.ts";

class GetterConfig implements RunnableNodeConfig<Readonly<{ url: string }>, Readonly<{ ok: boolean }>> {
  readonly kind = "node" as const;
  readonly type = { name: "GetterNode" } as never;
  readonly execution = { hint: "local" } as const;

  constructor(
    public readonly name: string,
    public readonly args: Readonly<{ urlField?: string }> = {},
  ) {}

  get urlField(): string {
    return this.args.urlField ?? "url";
  }
}

test("ItemValueResolver rejects missing ctx", async () => {
  const resolver = new ItemValueResolver();
  await assert.rejects(
    () => resolver.resolveConfigForItem(null as unknown as NodeExecutionContext, { json: {} }, 0, []),
    (e) => e instanceof Error && (e as Error).message.includes("ctx is required"),
  );
});

test("ItemValueResolver preserves config object when resolveItemValuesForExecution returns undefined", async () => {
  const resolver = new ItemValueResolver();
  const cfg = { kind: "node" as const, name: "keep", marker: "original" } as unknown as RunnableNodeConfig;
  const ctx: NodeExecutionContext<RunnableNodeConfig> = {
    runId: "r1",
    workflowId: "w1",
    nodeId: "n1",
    activationId: "a1",
    data: {} as never,
    config: cfg,
  };
  const out = await resolver.resolveConfigForItem(ctx, { json: {} }, 0, []);
  assert.equal((out.config as { marker?: string }).marker, "original");
});

test("ItemValueResolver preserves prototype getters for runnable config instances without itemValue leaves", async () => {
  const resolver = new ItemValueResolver();
  const cfg = new GetterConfig("getter");
  const ctx: NodeExecutionContext<GetterConfig> = {
    runId: "r1",
    workflowId: "w1",
    nodeId: "n1",
    activationId: "a1",
    data: {} as never,
    config: cfg,
  };

  const out = await resolver.resolveConfigForItem(ctx, { json: { url: "data:text/plain,hello" } }, 0, [
    { json: { url: "data:text/plain,hello" } },
  ]);

  assert.equal(out.config, cfg);
  assert.equal(out.config.urlField, "url");
});

test('ItemValueResolver resolves legacy Symbol("codemation.itemValue") leaves (duplicate module graphs)', async () => {
  const resolver = new ItemValueResolver();
  const legacyBrand = Symbol("codemation.itemValue");
  const legacy = {
    [legacyBrand]: true,
    fn: () => [{ role: "system", content: "hello" }],
  } as unknown as { messages: unknown };
  const cfg = {
    kind: "node" as const,
    name: "legacy",
    messages: legacy,
  } as unknown as RunnableNodeConfig;
  const ctx: NodeExecutionContext<RunnableNodeConfig> = {
    runId: "r1",
    workflowId: "w1",
    nodeId: "n1",
    activationId: "a1",
    data: {} as never,
    config: cfg,
  };

  const out = await resolver.resolveConfigForItem(ctx, { json: {} }, 0, []);
  const resolved = out.config as unknown as { messages?: unknown };
  assert.deepEqual(resolved.messages, [{ role: "system", content: "hello" }]);
});

test("ItemValueResolver resolves snapshot-hydrated itemValue wrappers missing symbol brands", async () => {
  const resolver = new ItemValueResolver();
  const unbranded = {
    fn: () => [{ role: "system", content: "hello" }],
  } as unknown as { messages: unknown };
  const cfg = {
    kind: "node" as const,
    name: "unbranded",
    messages: unbranded,
  } as unknown as RunnableNodeConfig;
  const ctx: NodeExecutionContext<RunnableNodeConfig> = {
    runId: "r1",
    workflowId: "w1",
    nodeId: "n1",
    activationId: "a1",
    data: {} as never,
    config: cfg,
  };

  const out = await resolver.resolveConfigForItem(ctx, { json: {} }, 0, []);
  const resolved = out.config as unknown as { messages?: unknown };
  assert.deepEqual(resolved.messages, [{ role: "system", content: "hello" }]);
});
