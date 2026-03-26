# `@codemation/worker-cli`

The **queue worker** CLI: a small Node entry that boots the host worker side (BullMQ-backed execution) for a consumer project. `codemation serve worker` spawns this package from the consumer root.

## Install

```bash
pnpm add @codemation/worker-cli@^0.0.0
# or
npm install @codemation/worker-cli@^0.0.0
```

## When to use

Install alongside `@codemation/cli` in deployments that run **web and worker as separate processes**. You can also invoke the binary directly when debugging worker startup.

## Usage

```bash
npx codemation-worker@latest
# or after local install:
pnpm exec codemation-worker
```

Programmatic import (advanced):

```ts
import { CodemationWorkerCli } from "@codemation/worker-cli";
```

**Peer dependency:** `tsx` >= 4 where the worker is launched via tsx.
