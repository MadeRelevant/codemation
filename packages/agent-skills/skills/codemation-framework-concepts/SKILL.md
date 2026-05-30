---
name: codemation-framework-concepts
description: Explains Codemation package boundaries, runtime concepts, observability shape, and the normal consumer mental model. Use when the user asks where code belongs across `@codemation/core`, `@codemation/host`, `@codemation/next-host`, `@codemation/cli`, workflows, plugins, credentials, activation, telemetry, or runtime modes. Read this first when starting any Codemation task — it points at the right skill for the work.
compatibility: Designed for Codemation apps, plugins, and framework contributors.
tags: concepts, architecture
---

# Codemation Framework Concepts

## Mental model

Codemation is a workflow engine with a layered package structure. `@codemation/core` owns the engine and runtime contracts (must stay pure — no HTTP, UI, or vendor SDKs). `@codemation/host` adds persistence, credentials, APIs, and scheduler wiring. `@codemation/next-host` is the framework UI shell. `@codemation/cli` runs local development, build, and serve. Consumer apps define behavior in `codemation.config.ts` and `src/workflows/` — they never touch core internals.

## When to use / when NOT

Use this skill to orient on package ownership, runtime shape, observability boundaries, and the consumer/framework divide.
Do not use as a substitute for detailed CLI, workflow DSL, or plugin implementation guidance when you already know which skill you need.

## Core concepts

- **workflows** define behavior; **triggers** start runs; **nodes** process items; **items** carry `item.json` data.
- **credentials** provide typed runtime resources (bound per operator instance, not per workflow code).
- **activation** is framework-managed and happens in the UI — consumer code does not call it directly.
- **telemetry** is observability-first: traces, spans, artifacts, and metric points are framework-owned runtime data.
- **workflow testing** is a first-class primitive: `TestTrigger` yields one item per test case; `Assertion` nodes record per-run results into `TestAssertion` rows; the canvas exposes a Tests tab.
- **run retention** and **telemetry retention** can differ — trend data can outlive raw run state.

## Where to go next

| Task | Skill |
|------|-------|
| Authoring workflows | `codemation-workflow-dsl` |
| Building a reusable node | `codemation-custom-node-development` |
| Building a credential type | `codemation-credential-development` |
| Packaging as a plugin | `codemation-plugin-development` |
| Calling an MCP server from a workflow | `codemation-mcp-capabilities` |
| CLI commands / dev loop | `codemation-cli` |

## Read next when needed

- Read `references/architecture-map.md` for package ownership and runtime-mode guidance.
