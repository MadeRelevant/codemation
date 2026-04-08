# Item-node execution and input mapping

## Concepts

- **Activation** stays **batch-based**: `NodeActivationRequest` for single-input nodes carries `input: Items`.
- **Default runnable behavior** for many nodes is **per-item** via `executeOne` on the **`ItemNode`** interface (`packages/core/src/contracts/runtimeTypes.ts`).
- The engine applies optional **`RunnableNodeConfig.mapInput`** (per item) and validates with **`inputSchema`** (Zod on the node class and/or config) **before enqueue**, so persisted `inputsByPort` is the **mapped + validated** JSON the node will see.
- **`Node.execute(items)`** remains for **batch** nodes (routers, aggregates, legacy nodes).

## Authoring (code workflows)

### Node implementation

- Implement `ItemNode` with `outputPorts: ['main']` and `executeOne`.
- Provide `inputSchema` on the **class** and/or on **config** (`RunnableNodeConfig.inputSchema`); resolution order is **class → config → `z.unknown()`**.

### Workflow wiring

- Put **`mapInput`** on the downstream **node config** when upstream `item.json` does not already satisfy the input schema.
- **Inspector semantics**: the run store’s `nodeSnapshotsByNodeId[nodeId].inputsByPort` is the **post-map, post-parse** input. Raw upstream output remains visible on the **previous node’s** `outputs`.

## Tests

See `packages/core/test/engine/engine.itemNode.test.ts` for ordering, mapping persistence, schema failures, batch legacy path, and multi-input `executeMulti` (unchanged).
