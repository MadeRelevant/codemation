# @codemation/core

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
