---
name: codemation-framework-concepts
description: Explains Codemation package boundaries, runtime concepts, observability shape, and the normal consumer mental model. Use when the user asks where code belongs across `@codemation/core`, `@codemation/host`, `@codemation/next-host`, `@codemation/cli`, workflows, plugins, credentials, activation, telemetry, or runtime modes. Read this first when starting any Codemation task — it points at the right skill for the work.
compatibility: Designed for Codemation apps, plugins, and framework contributors.
---

# Codemation Framework Concepts

## Use this skill when

Use this skill to explain package ownership, runtime shape, observability boundaries, and the boundary between consumer code and framework code.

Do not use this skill as a substitute for detailed CLI, workflow DSL, or plugin implementation guidance when the user already knows the concept they need.

## Core map

1. `@codemation/core` owns the engine, runtime contracts, and workflow DSL foundations.
2. `@codemation/host` adds config loading, persistence, credentials, APIs, and scheduler wiring.
3. `@codemation/next-host` owns the framework UI.
4. `@codemation/cli` runs local development, build, serve, and user commands.
5. Consumer apps define `codemation.config.ts` and workflow files.

## Important concepts

- workflows define behavior
- triggers start runs
- nodes process items
- items carry workflow data
- credentials provide typed runtime resources
- activation is framework-managed and happens in the UI
- telemetry is observability-first: traces, spans, artifacts, and metric points are framework-owned runtime data
- run retention and telemetry retention can differ, so trend data can outlive raw run state
- **workflow testing** is a first-class primitive: a `TestTrigger` node yields one item per test case, the orchestrator dispatches a workflow run per case with `executionOptions.testContext` set, and `Assertion` nodes (`emitsAssertions: true`) record per-run results into `TestAssertion` rows; the canvas exposes a Tests tab parallel to Live and Executions

## Runtime rule of thumb

1. Start with the minimum setup.
2. Move to shared PostgreSQL and Redis when execution needs separate worker infrastructure.
3. Keep workflow code stable while the runtime shape grows around it.
4. Treat telemetry as part of the runtime contract, not as ad-hoc node-local logging.

## Where to go next

- Authoring workflows → `codemation-workflow-dsl`
- Building a reusable node → `codemation-custom-node-development`
- Building a credential type → `codemation-credential-development`
- Packaging as a plugin → `codemation-plugin-development`
- Calling an MCP server from a workflow → `codemation-mcp-capabilities`
- CLI commands / dev loop → `codemation-cli`

## Read next when needed

- Read `references/architecture-map.md` for package ownership and runtime-mode guidance.
- Use the `codemation-workflow-dsl` skill (and its `references/workflow-testing.md`) for hands-on test authoring with TestTrigger / IsTestRun / Assertion.
