# Define Node (Per-Item)

Load this when you need to author a `defineNode(...)` node that processes one item at a time.

## When to use `defineNode`

- Node logic is straightforward.
- The node belongs to one app or plugin package.
- Helper-based credential slots are sufficient.
- You do not need to inspect the entire batch in one call.

## Minimal skeleton

```ts
import { defineNode } from "@codemation/core";
import { z } from "zod";

export const uppercaseNode = defineNode({
  key: "example.uppercase",
  title: "Uppercase field",
  icon: "lucide:languages", // optional — Lucide, builtin:, si:, or image URL
  inputSchema: z.object({ field: z.string() }),
  async execute({ input, item }, { config }) {
    return { ...input, [config.field]: String(input.field).toUpperCase() };
  },
});
```

## Contract

- `execute(args, context)` is called **once per item** by the engine.
- Return a plain JSON object → one output item on `main`.
- Return a top-level array → **fan-out** (one item per element).
- Return `emitPorts({ portName: [...] })` for multi-port routing.
- Return an item-shaped `{ json, binary?, meta?, paired? }` when you need explicit binary/meta control.

## Config fields with `itemExpr`

Place **static** options (credentials, retry policy, labels) on `config`; place **per-item** values in `inputs` using `itemExpr` on config fields — consistent with built-in nodes.

## Input schema and `inputSchema`

Supply `inputSchema` (Zod) to get typed `input` in `execute` and to drive the canvas form. The engine validates items against it before calling `execute`.

## Testing with `WorkflowTestKit`

```ts
import { createEngineTestKit, registerDefinedNodes } from "@codemation/core/testing";

const kit = createEngineTestKit();
registerDefinedNodes([uppercaseNode]);
const result = await kit.runNode(uppercaseNode, { json: { field: "hello" } });
```

Use `WorkflowTestKit` from `@codemation/core/testing` for engine-backed tests without the host.

## Custom assertion nodes

Set `emitsAssertions: true` on the node config to record results into `TestSuiteRun` infrastructure. The host's `TestSuiteRunTracker` listens for `nodeCompleted` events on runs with `ctx.testContext` set and persists each emitted item (matching `AssertionResult`) as a `TestAssertion` row.

Per-item nodes can also read `ctx.testContext?.{testSuiteRunId, testCaseIndex}` to branch on test mode — useful for synthetic outputs or skipping irreversible side effects.
