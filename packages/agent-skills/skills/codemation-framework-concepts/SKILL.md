---
name: codemation-framework-concepts
description: Explains Codemation package boundaries, runtime concepts, and the normal consumer mental model. Use when the user asks where code belongs across `@codemation/core`, `@codemation/host`, `@codemation/next-host`, `@codemation/cli`, workflows, plugins, credentials, activation, or runtime modes.
compatibility: Designed for Codemation apps, plugins, and framework contributors.
---

# Codemation Framework Concepts

## Use this skill when

Use this skill to explain package ownership, runtime shape, and the boundary between consumer code and framework code.

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

## Runtime rule of thumb

1. Start with the minimum setup.
2. Move to shared PostgreSQL and Redis when execution needs separate worker infrastructure.
3. Keep workflow code stable while the runtime shape grows around it.

## Read next when needed

- Read `references/architecture-map.md` for package ownership and runtime-mode guidance.
