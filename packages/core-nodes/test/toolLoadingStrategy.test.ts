import { test, expect } from "vitest";
import { BM25Index } from "../src/nodes/BM25Index";
import { DeferredMetaToolStrategy } from "../src/nodes/DeferredMetaToolStrategy";
import type { ToolLoadingStrategyInitInput } from "../src/nodes/ToolLoadingStrategy";
import { jsonSchema } from "ai";

// --- BM25Index unit tests ---

test("BM25Index: empty index returns empty results", () => {
  const idx = new BM25Index();
  const results = idx.search("send email", 5);
  expect(results).toEqual([]);
});

test("BM25Index: single document match", () => {
  const idx = new BM25Index();
  idx.add(["send gmail email message"]);
  const results = idx.search("send email", 5);
  expect(results).toHaveLength(1);
  expect(results[0]).toBe(0);
});

test("BM25Index: top-K returns highest scoring first", () => {
  const idx = new BM25Index();
  idx.add([
    "create calendar event appointment",
    "send gmail email message compose",
    "read inbox messages",
    "send email compose message gmail",
  ]);
  const results = idx.search("send email", 2);
  // Should rank email-related docs higher
  expect(results.length).toBeLessThanOrEqual(2);
  // The "send email" docs should be in top results
  expect(results.some((i) => i === 1 || i === 3)).toBe(true);
});

test("BM25Index: query with no matching terms returns empty", () => {
  const idx = new BM25Index();
  idx.add(["create calendar event", "send email message"]);
  const results = idx.search("xyzzy_nonexistent_term", 5);
  expect(results).toEqual([]);
});

test("BM25Index: tokenize lowercases and splits on non-alphanumeric", () => {
  const idx = new BM25Index();
  const tokens = idx.tokenize("Send Email to User_123!");
  expect(tokens).toEqual(["send", "email", "to", "user", "123"]);
});

// --- DeferredMetaToolStrategy unit tests ---

function makeMockToolSet(name: string, description: string): Record<string, unknown> {
  return {
    [name]: {
      description,
      inputSchema: jsonSchema({ type: "object", properties: {}, required: [], additionalProperties: false }),
    },
  };
}

async function makeStrategy(opts: Partial<ToolLoadingStrategyInitInput> = {}): Promise<DeferredMetaToolStrategy> {
  const strategy = new DeferredMetaToolStrategy(new BM25Index(), () => {});
  await strategy.initialize({
    nodeBackedTools: opts.nodeBackedTools ?? {},
    mcpToolsByServer: opts.mcpToolsByServer ?? new Map(),
    pinnedMcpTools: opts.pinnedMcpTools ?? [],
  });
  return strategy;
}

test("DeferredMetaToolStrategy: no MCP tools — only node-backed tools, no find_tools", async () => {
  const nodeTools = makeMockToolSet("my_node_tool", "a node tool");
  const strategy = await makeStrategy({ nodeBackedTools: nodeTools as any });
  const tools = strategy.getToolsForTurn({ turnIndex: 0 });
  expect("my_node_tool" in tools).toBe(true);
  expect("find_tools" in tools).toBe(false);
});

test("DeferredMetaToolStrategy: with MCP tools — find_tools is present", async () => {
  const mcpTools = makeMockToolSet("gmail_send", "send a gmail email");
  const mcpToolsByServer = new Map([["gmail", mcpTools as any]]);
  const strategy = await makeStrategy({ mcpToolsByServer });
  const tools = strategy.getToolsForTurn({ turnIndex: 0 });
  expect("find_tools" in tools).toBe(true);
  expect("gmail_send" in tools).toBe(false); // not pinned, should not be present
});

test("DeferredMetaToolStrategy: find_tools description mentions next turn", async () => {
  const mcpTools = makeMockToolSet("gmail_send", "send email");
  const mcpToolsByServer = new Map([["gmail", mcpTools as any]]);
  const strategy = await makeStrategy({ mcpToolsByServer });
  const tools = strategy.getToolsForTurn({ turnIndex: 0 });
  const findToolsDef = tools["find_tools"];
  expect(findToolsDef?.description).toContain("next turn");
});

test("DeferredMetaToolStrategy: find_tools execution returns BM25 results", async () => {
  const mcpTools = makeMockToolSet("gmail_send", "send a gmail email message");
  const mcpToolsByServer = new Map([["gmail", mcpTools as any]]);
  const strategy = await makeStrategy({ mcpToolsByServer });
  const results = await strategy.executeMetaTool("find_tools", { query: "send email" });
  expect(Array.isArray(results)).toBe(true);
  const arr = results as Array<{ serverId: string; toolName: string }>;
  expect(arr.length).toBeGreaterThan(0);
  expect(arr[0].serverId).toBe("gmail");
  expect(arr[0].toolName).toBe("gmail_send");
});

test("DeferredMetaToolStrategy: after find_tools, next turn includes surfaced tools", async () => {
  const mcpTools = makeMockToolSet("gmail_send", "send a gmail email");
  const mcpToolsByServer = new Map([["gmail", mcpTools as any]]);
  const strategy = await makeStrategy({ mcpToolsByServer });

  // Simulate find_tools call
  const foundResults = [{ serverId: "gmail", toolName: "gmail_send", description: "send email", inputSchema: {} }];
  strategy.recordFoundTools(foundResults);
  const foundIds = strategy.getFoundToolIds();
  expect(foundIds).toContain("gmail:gmail_send");

  // Next turn should include the surfaced tool
  const tools = strategy.getToolsForTurn({
    turnIndex: 1,
    previousFoundToolIds: foundIds,
  });
  expect("gmail_send" in tools).toBe(true);
  expect("find_tools" in tools).toBe(true); // still available
});

test("DeferredMetaToolStrategy: pinned tools always present regardless of turn", async () => {
  const mcpTools = makeMockToolSet("slack_send", "send slack message");
  const mcpToolsByServer = new Map([["slack", mcpTools as any]]);
  const strategy = await makeStrategy({
    mcpToolsByServer,
    pinnedMcpTools: ["slack:slack_send"],
  });

  // Turn 0: pinned tools present without find_tools call
  const tools0 = strategy.getToolsForTurn({ turnIndex: 0 });
  expect("slack_send" in tools0).toBe(true);

  // Turn 1: still present
  const tools1 = strategy.getToolsForTurn({ turnIndex: 1 });
  expect("slack_send" in tools1).toBe(true);
});

test("DeferredMetaToolStrategy: hard cap throws on > 16 pinned tools", async () => {
  const mcpTools: Record<string, unknown> = {};
  const pinnedMcpTools: string[] = [];
  for (let i = 0; i < 17; i++) {
    const name = `tool_${i}`;
    mcpTools[name] = {
      description: `tool ${i}`,
      inputSchema: jsonSchema({ type: "object", properties: {}, required: [], additionalProperties: false }),
    };
    pinnedMcpTools.push(`server:${name}`);
  }

  const strategy = new DeferredMetaToolStrategy(new BM25Index(), () => {});
  await expect(
    strategy.initialize({
      nodeBackedTools: {},
      mcpToolsByServer: new Map([["server", mcpTools as any]]),
      pinnedMcpTools,
    }),
  ).rejects.toThrow(/hard limit/);
});

test("DeferredMetaToolStrategy: soft limit calls warnFn for > 8 pinned tools", async () => {
  const mcpTools: Record<string, unknown> = {};
  const pinnedMcpTools: string[] = [];
  for (let i = 0; i < 9; i++) {
    const name = `tool_${i}`;
    mcpTools[name] = {
      description: `tool ${i}`,
      inputSchema: jsonSchema({ type: "object", properties: {}, required: [], additionalProperties: false }),
    };
    pinnedMcpTools.push(`server:${name}`);
  }

  const warnings: string[] = [];
  const strategy = new DeferredMetaToolStrategy(new BM25Index(), (msg) => warnings.push(msg));
  await strategy.initialize({
    nodeBackedTools: {},
    mcpToolsByServer: new Map([["server", mcpTools as any]]),
    pinnedMcpTools,
  });
  expect(warnings.length).toBeGreaterThan(0);
  expect(warnings[0]).toContain("soft limit");
});

test("DeferredMetaToolStrategy: ownsToolName returns true only for find_tools", async () => {
  const strategy = await makeStrategy();
  // ownsToolName always returns true for find_tools for routing purposes
  expect(strategy.ownsToolName("find_tools")).toBe(true);
  expect(strategy.ownsToolName("some_other_tool")).toBe(false);
  expect(strategy.ownsToolName("gmail_send")).toBe(false);
});
