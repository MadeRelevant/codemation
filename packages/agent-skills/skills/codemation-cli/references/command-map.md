# Command Map

## Mental model

- `@codemation/cli` is a thin orchestration layer.
- It wires command objects and runtime helpers.
- It does not own workflow definitions, the Next UI implementation, or the engine itself.

## Pick the right mode

### Consumer mode

Use `codemation dev` for a standalone Codemation app.

- The CLI starts the packaged `@codemation/next-host` UI.
- The CLI owns a stable development gateway.
- The CLI hot-swaps the in-process API runtime when consumer files change.

### Framework-author mode

Use `codemation dev --watch-framework` when working inside the Codemation monorepo.

- The CLI starts `next dev` for `@codemation/next-host`.
- The CLI still owns the stable gateway and runtime swapping.
- This mode is for framework package work, not normal consumer usage.

## Command responsibilities

### `codemation dev`

- default local development flow
- best for consumer projects

### `codemation build`

- emits build output under `.codemation/output/build`
- use for production-oriented packaging flows

### `codemation serve web`

- runs the packaged web surface
- useful when validating runtime wiring outside the dev hot-swap flow

### `codemation serve worker`

- starts the queue-backed worker runtime
- use when web and worker processes are separated

### `codemation user create`

- creates or updates a local-auth bootstrap user
- requires local auth and database access

### `codemation user list`

- lists known users through the host query flow

## Environment notes

- SQLite is the zero-setup default for starter apps.
- When `REDIS_URL` is set, use a shared PostgreSQL `DATABASE_URL`; BullMQ cannot run on SQLite.
- Use `--consumer-root` when commands need to target a different consumer app root.
