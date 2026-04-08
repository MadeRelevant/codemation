# Item-node execution and input mapping

## Concepts

- **Activation** stays **batch-based**: `NodeActivationRequest` for single-input nodes carries `input: Items`.
- **Default runnable behavior** for many nodes is **per-item** via `executeOne` on the **`ItemNode`** interface (`packages/core/src/contracts/runtimeTypes.ts`).
- The engine applies optional **`RunnableNodeConfig.mapInput`** (per item) and validates with **`inputSchema`** (Zod on the node class and/or config) **before enqueue**, so persisted `inputsByPort` is the **mapped + validated** JSON the node will see.
- **`RunnableNodeConfig`** is **`RunnableNodeConfig<TInputJson, TOutputJson, TWireJson>`** (third type defaults to **`TInputJson`**): **`TWireJson`** is **`item.json` from upstream before `mapInput`**; **`TInputJson`** is what **`executeOne`** receives after map + Zod. Use **`RunnableNodeWireJson<TConfig>`** to extract the wire type. **`ItemInputMapper<TWireJson, TInputJson>`** types **`mapInput`** accordingly (see `packages/core/src/contracts/workflowTypes.ts`).
- **`mapInput` context:** **`ItemInputMapperArgs.ctx`** is **`ItemInputMapperContext`**. Use **`ctx.data.getOutputItems(nodeId, "main")`** (or **`getOutputItem`**) to read **any completed** upstream node in this run (e.g. A while mapping at D), not only the immediate predecessor’s **`item`**.
- **`Node.execute(items)`** remains for **batch** nodes (routers, merges, multi-port collect, legacy nodes).

## AI agent (`@codemation/core-nodes`)

- **`AIAgentNode`** implements **`ItemNode`** with **`executeOne`**: model resolution and tools are prepared **once per activation** (shared `ctx`) and each item runs the agent loop separately.
- **Prompts from inputs (recommended for run visibility)**  
  Put the chat payload on **`item.json`** as **`{ messages: [{ role, content }, ...] }`** (roles: `system` \| `user` \| `assistant`).  
  **`AgentMessageConfigNormalizer.resolveFromInputOrConfig`** uses **`input.messages`** when non-empty; otherwise it resolves **`config.messages`** (templates / `buildMessages`).
- **`mapInput` + `inputSchema` on `AIAgent`**  
  Optional **`mapInput`** and **`inputSchema`** on **`AIAgent`** follow the same **`RunnableNodeConfig`** rules as other ItemNodes: the engine maps and validates **before enqueue**, so **`inputsByPort` in run snapshots** reflects the **mapped** prompt payload (good for the canvas I/O panel).
- **Config vs input**  
  Keep **chat model, tools, guardrails, retry** on **`AIAgent`** config. Prefer **`messages` in mapped input** for the text the operator should see on the run; keep **`config.messages`** as a fallback for simple workflows or tooling that does not set `input.messages`.

## Split, Filter, Aggregate (`@codemation/core-nodes`)

These are **batch** nodes: they implement **`Node.execute(items, ctx)`**, not **`ItemNode` / `executeOne`**. They reshape **`Items`** on **`main`** for downstream steps (good for “explode array → per-row work → summarize” patterns).

| Config                     | Node class          | Behavior                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`Split<TIn, TElem>`**    | **`SplitNode`**     | For each input item, calls **`getElements(item, ctx)`** and emits **one output item per element** with **`json: element`**, spreading **`binary` / `meta` / `paired`** from the parent item.                                                                                                                                                                                   |
| **`Filter<TIn>`**          | **`FilterNode`**    | Keeps items where **`predicate(item, index, items, ctx)`** is true; passing items through unchanged (same item shape on **`main`**).                                                                                                                                                                                                                                           |
| **`Aggregate<TIn, TOut>`** | **`AggregateNode`** | If the batch is **non-empty**, runs **`aggregate(items, ctx)`** (sync or async) and emits **a single item** on **`main`** with **`json: TOut`**. If the batch is **empty**, emits **no items** on **`main`**. The emitted aggregate item is **`json`-only** (no automatic copy of **`binary` / `meta`** from inputs—compute or merge inside **`aggregate`** if you need them). |

**`Split` and empty output:** **`continueWhenEmptyOutput: true`** on **`Split`** so that when **`getElements`** returns `[]` for every item, downstream single-input nodes can still activate with an **empty batch** (aligned with **`MapData`** empty-output semantics).

**Sample workflow:** `apps/test-dev/src/workflows/samples/splitFilterAggregateDemo.ts`.

## Authoring (code workflows)

### Node implementation

- Implement `ItemNode` with `outputPorts: ['main']` and `executeOne`.
- Provide `inputSchema` on the **class** and/or on **config** (`RunnableNodeConfig.inputSchema`); resolution order is **class → config → `z.unknown()`**.

### Workflow wiring

- Put **`mapInput`** on the downstream **node config** when upstream `item.json` does not already satisfy the input schema. To combine the **direct** wire with data from an **earlier** node, read **`ctx.data`** inside **`mapInput`** (see **Concepts** above).
- **Inspector semantics**: the run store’s `nodeSnapshotsByNodeId[nodeId].inputsByPort` is the **post-map, post-parse** input. Raw upstream output remains visible on the **previous node’s** `outputs`.

## Tests

- `packages/core/test/engine/engine.itemNode.test.ts` — ordering, mapping persistence, **`ctx.data`** in **`mapInput`**, schema failures, batch legacy path, multi-input `executeMulti`.
- `packages/core-nodes/test/splitFilterAggregate.test.ts` — **`SplitNode`**, **`FilterNode`**, **`AggregateNode`** batch behavior.
