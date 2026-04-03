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
4. Think in batches of items, not single-record callbacks.

## Authoring rules

1. Prefer the fluent `workflow(...)` chain for app-local workflow files.
2. Keep workflow files focused on orchestration and named steps.
3. Use custom nodes when a callback grows into reusable product logic.
4. Remember that node execution receives batches of items, even when examples look single-item.

## Typical flow

1. Start with `workflow("wf.example.id")`.
2. Name the workflow with `.name(...)`.
3. Add a trigger such as `.manualTrigger(...)`.
4. Add transformations or nodes in execution order.
5. End with `.build()`.

## Read next when needed

- Read `references/builder-patterns.md` for item-flow rules and fluent authoring patterns.
