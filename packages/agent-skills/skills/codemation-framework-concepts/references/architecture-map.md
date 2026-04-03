# Architecture Map

## Main packages

- `@codemation/core`: engine, workflow DSL foundations, runtime contracts, planning, execution
- `@codemation/host`: config loading, persistence, credentials, scheduler wiring, API surface
- `@codemation/next-host`: framework-owned operator UI
- `@codemation/cli`: `dev`, `build`, `serve web`, `serve worker`, and user commands

## Where app code lives

In a normal Codemation app, most user code lives in:

- `codemation.config.ts`
- `src/workflows/**/*.ts`
- optional custom node modules or packages
- optional credential registrations

## Minimum setup

Use the minimum setup when:

- you are starting a new app
- one process is enough
- local PGlite is fine
- fast local iteration matters more than shared worker infrastructure

## Production setup

Move to the production shape when:

- web and worker processes should be separate
- workflows are long-running or bursty
- you need shared staging or production infrastructure
- queue-backed execution is a better fit than inline execution

That usually means:

- PostgreSQL instead of embedded PGlite
- Redis for queue-backed execution
- BullMQ-backed scheduling

## Activation flow

- deploy the workflow definition and any supporting plugin changes
- configure and test credentials in the UI
- activate the workflow only when the environment is ready
