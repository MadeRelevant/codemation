# Engine Behavior Contract

This document freezes the behavior the engine refactor must preserve. The source of truth is the existing test suite, not the current runtime shape.

## Capability Matrix

| Capability                        | What must remain true                                                                                                                                 | Primary tests                                                                                                                                                                                                                                          |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Linear execution                  | Nodes execute in graph order and completed runs resolve final outputs from the workflow tail.                                                         | `packages/core/test/engine/engine.flows.test.ts`                                                                                                                                                                                                       |
| Trigger handling                  | Trigger nodes bootstrap correctly and executable triggers can start ordinary runs.                                                                    | `packages/core/test/engine/engine.flows.test.ts`, `packages/core/test/engine/engine.webhooks.test.ts`                                                                                                                                                  |
| Fan-out and fan-in                | Branching and merge-style nodes preserve dependency semantics and only activate when required inputs are satisfied.                                   | `packages/core/test/engine/engine.flows.test.ts`                                                                                                                                                                                                       |
| Batch semantics                   | Nodes receive batches and downstream activations preserve item counts and provenance.                                                                 | `packages/core/test/engine/engine.flows.test.ts`                                                                                                                                                                                                       |
| Subworkflow execution             | Child workflow runs keep parent references and resolve nested outputs through the workflow runner contract.                                           | `packages/core/test/engine/engine.flows.test.ts`, `packages/core/test/engine/engine.offload.test.ts`                                                                                                                                                   |
| Worker offload and resume         | Worker-hinted nodes persist pending state, survive serialization, and resume through the same activation id.                                          | `packages/core/test/engine/engine.offload.test.ts`, `packages/core/test/engine/engine.targetedExecution.test.ts`                                                                                                                                       |
| Snapshot replay across code drift | Persisted workflow snapshots continue to resolve tokens and replay runs even when live code moved on.                                                 | `packages/core/test/persisted/persistedWorkflowRoundtrip.test.ts`, `packages/core/test/engine/engine.flows.test.ts`                                                                                                                                    |
| Current-state execution           | Running from persisted state honors `stopCondition`, frontier planning, and `clearFromNodeId` semantics.                                              | `packages/core/test/engine/engine.targetedExecution.test.ts`                                                                                                                                                                                           |
| Pinned-output skipping            | Pinned outputs survive clear-from-node, preserve downstream satisfaction, and produce skipped snapshots instead of re-executing the pinned node.      | `packages/core/test/engine/engine.targetedExecution.test.ts`, `packages/host/test/workflowDetail/mutableExecutionFlows.test.tsx`                                                                                                                       |
| Webhook respond-now flows         | Trigger-thrown webhook control signals either complete immediately or respond immediately and continue processing.                                    | `packages/core/test/engine/engine.webhooks.test.ts`                                                                                                                                                                                                    |
| Run event publication             | Queue, start, completion, and failure snapshots are published as run events with stable snapshot payloads.                                            | `packages/core/test/run/run-events.test.ts`                                                                                                                                                                                                            |
| Endpoint-to-trigger matching      | A registered webhook endpoint can be matched back to the owning workflow trigger without frontend graph knowledge.                                    | `packages/core/test/engine/engine.webhooks.test.ts` plus matcher tests added during this refactor                                                                                                                                                      |
| Resource / loop hardening         | Directed cycles are rejected at planning time; runs enforce a persisted activation budget and subworkflow depth limits (inherited along parent refs). | `packages/core/test/engine/engine.cycleDetection.test.ts`, `packages/core/test/engine/engine.activationBudget.test.ts`, `packages/core/test/engine/engine.subworkflowDepth.test.ts`, `packages/core/test/policies/engineExecutionLimitsPolicy.test.ts` |

## Refactor Rule

Refactor acceptance means:

- the matrix above stays green
- higher-level intent APIs may replace low-level callers
- internal classes may move or split
- no behavior may be removed unless a test is intentionally changed with a matching product decision

## Per-item runnable execution (unified model)

This section locks **current** engine semantics for runnable nodes that execute **per item** (`executeOne` / `ItemNode`).

### Top-level JSON array rule

- **`item.json` MUST NOT be a JSON array at the top level** (nested arrays inside objects are allowed, e.g. `messages: [...]`).
- If a node **returns** a **top-level array** from `executeOne`, the engine treats it as **fan-out**: **one output `Item` per array element** on the chosen output port(s). That keeps `item.json` on the wire non-array while still allowing **1→N** without a Split node.

### Return shapes (`executeOne`)

1. **Single JSON object / primitive / null** (`JsonNonArray`) → **one** output item on `main` (unless multi-port emission below).
2. **Top-level array** of `JsonNonArray` → **many** items on `main`, one per element.
3. **Multi-port emission** — use **`emitPorts({ portName: [...] })`** so plain object outputs never collide with “special” shapes. Each port value is **`Items`** or **`JsonNonArray[]`** (arrays of payloads are expanded to items using lineage policy).

### Lineage carry (`binary` / `meta` / `paired`)

- **Default — emit-only:** emitted items contain **only** the new `json` payload (plus any fields the node explicitly sets). **`binary` / `meta` / `paired`** from the inbound item are **not** copied forward.
- **Default — router-style nodes** (multiple `outputPorts`, e.g. `If`, `Switch`): **carry-through** — propagate **`binary` / `meta` / `paired`** when emitting, consistent with routing nodes tagging lineage.
- **Override:** `RunnableNodeConfig.lineageCarry?: "emitOnly" | "carryThrough"` wins over defaults.

### Fan-in (multi-inbound edges)

- When a node has **more than one inbound edge** (including multiple edges into the same declared input port, e.g. a diamond join), the engine uses **collect** semantics and builds **`inputsByPort`** keyed by a **stable collect key** (duplicate `to.input` targets are disambiguated by **`fromNodeId:fromOutput`**).
- **Default merge:** **merge-by-origin** — items from each port with the same **`meta._cm.originIndex`** (or derived lineage) are combined into **one** current item whose **`json`** is a **record keyed by collect port**: `{ [portKey]: <that port’s item.json> }` (**inner join** on origin). If **no** origin metadata exists, the engine falls back to **merge-by-position** across ports (same index on each port).

### Flow (mermaid)

```mermaid
flowchart TD
  A[Inbound Items / inputsByPort] --> B{executeMulti?}
  B -->|yes| M[executeMulti - Merge etc.]
  B -->|no + executeOne| F[Fan-in merge by origin]
  F --> P[Zod + itemValue resolve]
  P --> E[executeOne]
  E --> R{Return shape}
  R -->|JsonNonArray| O1[1 item on main]
  R -->|JsonNonArray[]| O2[N items fan-out]
  R -->|emitPorts| O3[Per-port Items]
```

### Examples

- **Per-item config:** use **`itemValue(({ item, ctx }) => ...)`** on config fields; the engine resolves these **per item** before `executeOne`. Use **`ctx.data`** when you need outputs from **any** completed upstream node (same idea as the former `mapInput` context, without a separate mapper stage).
- **Fan-out without Split:** `return [{ id: 1 }, { id: 2 }]` emits two downstream items.
- **Switch:** `return emitPorts({ even: [...], odd: [...] })` routes items to ports without wrapping payloads in ad-hoc JSON bags.
