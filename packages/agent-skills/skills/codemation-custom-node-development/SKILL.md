---
name: codemation-custom-node-development
description: Guides Codemation custom node development with `defineNode(...)` (`execute` per item), `defineBatchNode(...)` (batch `run`), reusable node modules, credential-aware nodes, and the class-based node fallback for advanced cases. Use when creating or updating custom nodes for apps or plugin packages.
compatibility: Designed for Codemation apps and plugin packages that define reusable nodes.
---

# Codemation Custom Node Development

## Use this skill when

Use this skill for reusable custom node work, whether the node lives inside an app or a published plugin package.

Do not use this skill for pure workflow chaining questions unless the node implementation itself is changing.

## Default approach

1. Start with `defineNode(...)`.
2. Implement **`execute(args, context)`** — one mapped **input** in, one output payload per item (activations are still batch-shaped; the engine iterates items for you).
3. Give the node a stable key and a clear title.
4. Optionally set **`icon`** on the `defineNode` definition so the workflow canvas shows a proper glyph (same string contract as `NodeConfigBase.icon`).
5. Use **`defineBatchNode(...)`** with **`run(items, context)`** only when the node must process the **entire batch** at once (legacy batch semantics).
6. Promote callback-heavy logic into a node when the graph or tests need a stronger boundary.

## Node rules

1. Prefer helper-based nodes first.
2. Keep nodes deterministic and focused.
3. Request credentials through named slots instead of hard-coded secrets.
4. Put **static** options (credentials, retry policy, labels) on **config**; put **per-item** behavior in **inputs** / wire JSON and optional **`itemExpr`** on config fields (consistent with built-in nodes).
5. **Emit files with `ctx.binary`, not base64 in `json`:** use **`attach`** + **`withAttachment`** on **`args.ctx.binary`** (`defineNode`) or **`ctx.binary`** (class nodes). Base64 in **`item.json`** bloats persisted run JSON in the database; binaries use **storage + references** only. See `references/node-patterns.md` and repo docs **Concepts → Execution model** / **Custom nodes**.
6. Drop to class-based node APIs only when you need constructor-injected collaborators, decorators, or deeper runtime metadata.

## Testing with `WorkflowTestKit`

For engine-backed tests without the host, use **`WorkflowTestKit`** from **`@codemation/core/testing`**: **`registerDefinedNodes([...])`**, then **`runNode`** or **`run`**. See the plugin development doc and `@codemation/core` tests for examples.

## Custom assertion + test nodes

When building **assertion** nodes that should record results into the framework's TestSuiteRun infrastructure, set **`emitsAssertions: true`** on the node config. The host's `TestSuiteRunTracker` listens for `nodeCompleted` events from runs with `ctx.testContext` set and persists each emitted item (matching the `AssertionResult` shape) as a `TestAssertion` row. Drop in a `defineNode` with a per-item `execute` that returns `AssertionResult[]` and you're done — no service injection required.

Custom **per-item nodes** can also read **`ctx.testContext?.{testSuiteRunId, testCaseIndex}`** to branch on test mode without an `IsTestRun` upstream — useful for synthetic outputs or skipping irreversible side effects when running tests.

## Binary payloads in sub-workflow chains

Binary slots attached inside a node survive SubWorkflow boundaries with no extra work. The shared `BinaryStorage` DI singleton means `ctx.binary.openReadStream` works regardless of which run originally stored the bytes.

### Pattern: attach in a node, read in the parent after SubWorkflow

```ts
// Child node — attaches a slot and returns the modified item.
// Works with defineNode or class-based nodes.
export const parseAndStoreNode = defineNode({
  key: "example.parse-store",
  title: "Parse and Store",
  inputSchema: z.object({ filename: z.string() }),
  async execute({ input, item }, { binary }) {
    const bytes = Buffer.from("...parsed content...");
    const att = await binary.attach({
      name: "parsed",
      body: bytes,
      mimeType: "text/plain",
      filename: `${input.filename}.txt`,
    });
    return binary.withAttachment(item, "parsed", att);
  },
});
```

After `SubWorkflowNode` returns, the parent's continuation nodes see `item.binary["parsed"]` and can call `ctx.binary.openReadStream(item.binary["parsed"])` to read the bytes.

### Testing binary across SubWorkflow with `WorkflowTestKit`

```ts
import { DefaultExecutionContextFactory, InMemoryBinaryStorage } from "@codemation/core";
import { createEngineTestKit } from "@codemation/core/testing";
import { ItemHarnessNodeConfig } from "@codemation/core/testing";

const storage = new InMemoryBinaryStorage();
const kit = createEngineTestKit({
  executionContextFactory: new DefaultExecutionContextFactory(storage),
});

// Use ItemHarnessNodeConfig (NOT CallbackNodeConfig) for nodes that must modify items:
const attachNode = new ItemHarnessNodeConfig(
  "Attach",
  z.unknown(),
  async ({ item, ctx }) => {
    const att = await ctx.binary.attach({
      name: "doc",
      body: Buffer.from("content"),
      mimeType: "application/pdf",
      filename: "doc.pdf",
    });
    return ctx.binary.withAttachment(item as Item, "doc", att);
  },
  { id: "attach" },
);
// CallbackNodeConfig is fine for assertion-only (observe) nodes — it echoes input unchanged.
```

Important: `CallbackNodeConfig` discards its callback return value and always echoes input items. Never use it for nodes that must attach binary or transform items.

## Read next when needed

- Read `references/node-patterns.md` for `defineNode(...)` patterns and packaging guidance.
- Use the `codemation-workflow-dsl` skill's `references/workflow-testing.md` for the full TestTrigger / IsTestRun / Assertion authoring story.
