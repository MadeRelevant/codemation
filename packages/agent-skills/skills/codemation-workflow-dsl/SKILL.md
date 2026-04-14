---
name: codemation-workflow-dsl
description: Guides Codemation workflow authoring with the fluent Workflow DSL. Use when creating or updating `workflow("...")` definitions, triggers, `.map(...)`, `.node(...)`, branch flow, item handling, or `.build()` chains in `src/workflows`.
compatibility: Designed for Codemation apps and plugins that author workflows with the fluent DSL.
---

# Codemation Workflow DSL

## Use this skill when

Use this skill for authoring or reviewing workflow definitions built with `workflow("...")`.

Do not use this skill for CLI-only troubleshooting or deep host architecture questions unless they directly affect workflow authoring.

## Core mental model

1. A workflow definition describes how items move from a trigger through downstream steps.
2. The fluent authoring chain is the normal starting point for Codemation apps.
3. Finish fluent workflow definitions with `.build()`.
4. Activations are **batch-shaped** (`Items`); many steps use **per-item** execution (`execute`, including helper **`defineNode`**) with optional **`inputSchema`** and **`itemValue`** on config fields. Batch reshape steps (split/filter/aggregate, **`defineBatchNode`**) work on the whole batch.

## Authoring rules

1. Prefer the fluent `workflow(...)` chain for app-local workflow files.
2. Keep workflow files focused on orchestration and named steps.
3. Use custom nodes when a callback grows into reusable product logic.
4. Distinguish **batch activations** from **per-item node bodies**: custom nodes from **`defineNode`** implement **`execute`** per item unless you chose **`defineBatchNode`** for batch **`run`**.

## Typical flow

1. Start with `workflow("wf.example.id")`.
2. Name the workflow with `.name(...)`.
3. Add a trigger such as `.manualTrigger(...)`.
4. Add transformations or nodes in execution order.
5. End with `.build()`.

## Agent tools (callable helpers)

- For **inline** agent tools in workflow files (no separate `@tool()` class), use **`callableTool(...)`** from `@codemation/core`: supply `name`, Zod `inputSchema` / `outputSchema`, and `execute({ input, item, ctx, ... })`. **`CallableToolFactory.callableTool(...)`** is the same implementation if you prefer the factory style.
- Prefer **plugin `Tool` classes** when the tool is reusable across packages; use **`AgentToolFactory.asTool(...)`** when exposing an existing runnable node to the agent.

## Workflow agent authoring

- Use `.agent(...)` for fluent workflow-defined agent steps.
- Define agent messages with `messages`, not a workflow-specific prompt shortcut.
- Use a static `messages` array for fixed prompts.
- Use `itemValue(...)` when agent messages depend on the current item.
- `model` may be a provider string such as `"openai:gpt-4o-mini"` or a `ChatModelConfig`.

## Read next when needed

- Read `references/builder-patterns.md` for item-flow rules and fluent authoring patterns.
