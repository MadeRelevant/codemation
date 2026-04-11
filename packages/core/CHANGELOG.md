# @codemation/core

## 0.4.0

### Minor Changes

- [#54](https://github.com/MadeRelevant/codemation/pull/54) [`35b78bb`](https://github.com/MadeRelevant/codemation/commit/35b78bb4d8c7ee2998a8b8e51e5ffc3fd901e4c7) Thanks [@cblokland90](https://github.com/cblokland90)! - **Breaking change:** `defineNode(...)` now follows the per-item pipeline: implement **`execute(args, context)`** (optional **`inputSchema`**, **`mapInput`**, and **`TWireJson`** on the generated runnable config). Add **`defineBatchNode(...)`** with **`run(items, context)`** for plugin nodes that still require batch **`run`** semantics.

  Built-in nodes and workflow DSL (`split` / `filter` / `aggregate` on the fluent chain, Switch routing, execution normalization) align with the unified runnable model.

  Align documentation (site guides, repo **`AGENTS.md`**, **`strict-oop-di`** skill, **`packages/core/docs/item-node-execution.md`**) and the **plugin** starter **`AGENTS.md`** with **config** for static wiring (credentials, retry, presentation) vs **inputs** / wire JSON for per-item behavior.

- [#56](https://github.com/MadeRelevant/codemation/pull/56) [`eb97e53`](https://github.com/MadeRelevant/codemation/commit/eb97e5376f4f620099c32c14d7797ed3039bf7bb) Thanks [@cblokland90](https://github.com/cblokland90)! - Add fluent workflow authoring support for port routing and core nodes.
  - `workflow()` DSL: add `route(...)`, `merge(...)`, and `switch(...)` helpers so multi-port graphs can be expressed without manual `edges`.
  - `Callback`: allow returning `emitPorts(...)` and configuring declared output ports and error handling options.
  - Next host: fix execution inspector tree nesting by preferring `snapshot.parent.nodeId` when available (nested agent/tool invocations).

## 0.3.0

### Minor Changes

- [#52](https://github.com/MadeRelevant/codemation/pull/52) [`bb2b3b8`](https://github.com/MadeRelevant/codemation/commit/bb2b3b89069697c6aa36aac1de7124c5eea65c3e) Thanks [@cblokland90](https://github.com/cblokland90)! - **Breaking change:** `defineNode(...)` now follows the per-item pipeline: implement **`executeOne(args, context)`** (optional **`inputSchema`**, **`mapInput`**, and **`TWireJson`** on the generated runnable config). Add **`defineBatchNode(...)`** with **`run(items, context)`** for plugin nodes that still require legacy batch **`Node.execute`** semantics.

  Align documentation (site guides, repo **`AGENTS.md`**, **`strict-oop-di`** skill, **`packages/core/docs/item-node-execution.md`**) and the **plugin** starter **`AGENTS.md`** with **config** for static wiring (credentials, retry, presentation) vs **inputs** / wire JSON for per-item behavior.

## 0.2.3

### Patch Changes

- [#50](https://github.com/MadeRelevant/codemation/pull/50) [`d3a4321`](https://github.com/MadeRelevant/codemation/commit/d3a4321dc178df51dfd61cc6eb872ccca36bbcdb) Thanks [@cblokland90](https://github.com/cblokland90)! - Release automation: GitHub Actions now dispatches `publish-npm.yml` after versioning so npm OIDC trusted publishing continues to match the publish workflow file (no `workflow_call` from the Changesets workflow).

## 0.2.2

### Patch Changes

- [#47](https://github.com/MadeRelevant/codemation/pull/47) [`74dc571`](https://github.com/MadeRelevant/codemation/commit/74dc571afb592bd7c05297b25f9f1fb06a46815f) Thanks [@cblokland90](https://github.com/cblokland90)! - Item-node input mapping refinements, `RunQueuePlanner` multi-input merge routing, Split/Filter/Aggregate batch nodes, AIAgent `ItemNode` + optional `mapInput`/`inputSchema`, and documentation updates.

- [#47](https://github.com/MadeRelevant/codemation/pull/47) [`74dc571`](https://github.com/MadeRelevant/codemation/commit/74dc571afb592bd7c05297b25f9f1fb06a46815f) Thanks [@cblokland90](https://github.com/cblokland90)! - Add `TWireJson` to `RunnableNodeConfig`, typed `ItemInputMapper<TWire, TIn>` (bivariant for storage), `RunnableNodeWireJson` helper, and align `ChainCursor` / workflow DSL with upstream wire typing. Introduce `ItemInputMapperContext` so `mapInput` receives typed `ctx.data` (`RunDataSnapshot`) for reading any completed upstream node’s outputs.

## 0.2.1

### Patch Changes

- [#44](https://github.com/MadeRelevant/codemation/pull/44) [`4989e9c`](https://github.com/MadeRelevant/codemation/commit/4989e9c7d97513c05904d47d2f85794ba716a4d3) Thanks [@cblokland90](https://github.com/cblokland90)! - Add optional `icon` to `defineNode(...)` so plugin nodes can set `NodeConfigBase.icon` for the workflow canvas (Lucide, `builtin:`, `si:`, or image URLs).

## 0.2.0

### Minor Changes

- [#41](https://github.com/MadeRelevant/codemation/pull/41) [`a72444e`](https://github.com/MadeRelevant/codemation/commit/a72444e25c4e744a9a90e231a59c93f8d90346e5) Thanks [@cblokland90](https://github.com/cblokland90)! - Add `WorkflowTestKit` and related engine test harness exports on `@codemation/core/testing`, with create-codemation templates and agent skills updated to document plugin unit tests.

### Patch Changes

- [#41](https://github.com/MadeRelevant/codemation/pull/41) [`a72444e`](https://github.com/MadeRelevant/codemation/commit/a72444e25c4e744a9a90e231a59c93f8d90346e5) Thanks [@cblokland90](https://github.com/cblokland90)! - Normalize run persistence around work items, execution instances, and run slot projections, while aligning the HTTP/UI run detail flow to run-centric naming. This also fixes AI agent tool schema serialization, nested tool item propagation, and execution inspector/canvas status handling for inline scheduler workflows.

## 0.1.0

### Minor Changes

- [#39](https://github.com/MadeRelevant/codemation/pull/39) [`cbfe843`](https://github.com/MadeRelevant/codemation/commit/cbfe843ef2363e400a219f4d0bcd05b091ab83b4) Thanks [@cblokland90](https://github.com/cblokland90)! - Add `WorkflowTestKit` and related engine test harness exports on `@codemation/core/testing`, with create-codemation templates and agent skills updated to document plugin unit tests.

## 0.0.19

### Patch Changes

- [#26](https://github.com/MadeRelevant/codemation/pull/26) [`405c854`](https://github.com/MadeRelevant/codemation/commit/405c8541961f41dcba653f352691a821b0470ca0) Thanks [@cblokland90](https://github.com/cblokland90)! - Fix manual trigger reruns and current-state resume behavior.

  Current-state execution now treats empty upstream outputs like the live queue planner, so untaken branches stay dead on resume. Manual downstream runs can also synthesize trigger test items through core intent handling instead of relying on host-specific trigger logic.

## 0.0.18

### Patch Changes

- f0c6878: Introduce Changesets, a single CI status check for branch protection, and the Codemation pre-stable license across published packages.
