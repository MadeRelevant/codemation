# `@codemation/queue-bullmq`

**BullMQ** integration for Codemation: scheduler, worker, and node execution scheduler types that connect the engine to Redis-backed job queues.

## At a glance

**Enqueue:** when the engine offloads a node activation, **`BullmqNodeExecutionScheduler`** pushes a job to a BullMQ queue in Redis.

**Process:** **`BullmqWorker`** runs the job: it calls **`continuation.markNodeRunning`**, **`node.execute`**, then **`continuation.resumeFromNodeResult`** or **`resumeFromNodeError`** — those are the **engine** continuation API (`NodeActivationContinuation`, typically the same `Engine` instance wired in the worker). The engine then **re-plans the graph** (next nodes, more activations). If another activation is offloaded, **another job** is enqueued → **loop** until the run has no more work.

```
  ┌─────────────────────────────────────────────────────────────────────────────┐
  │  Engine  — plans activations; may offload each activation as a BullMQ job   │
  └───────────────────────────────┬─────────────────────────────────────────────┘
                                  │ enqueue (BullmqNodeExecutionScheduler)
                                  ▼
                           ┌──────────────┐
                           │ Redis/BullMQ │
                           │   queues     │
                           └──────┬───────┘
                                  │ job claimed
                                  ▼
  ┌─────────────────────────────────────────────────────────────────────────────┐
  │  BullmqWorker (this package)                                                  │
  │  markNodeRunning → node.execute → resumeFromNodeResult | resumeFromNodeError │
  └───────────────────────────────┬─────────────────────────────────────────────┘
                                  │
                                  │ NodeActivationContinuation ──► back into Engine
                                  │ (same Engine wired in worker process)
                                  ▼
  ┌─────────────────────────────────────────────────────────────────────────────┐
  │  Engine again — applies outputs, queues downstream nodes, or completes run   │
  └───────────────────────────────┬─────────────────────────────────────────────┘
                                  │
                                  └──► more jobs enqueued, or run ends  (loop ▲)
```

Use **`@codemation/worker-cli`** in production so worker processes run this loop beside your web tier; the scheduler may live with the API host while workers only run `BullmqWorker`.

## Install

```bash
pnpm add @codemation/queue-bullmq@^0.0.0
# or
npm install @codemation/queue-bullmq@^0.0.0
```

## When to use

Add this package when production or integration tests should execute workflows through **BullMQ** workers rather than an in-process or stub scheduler. Pair it with `@codemation/worker-cli` for dedicated worker processes.

## Usage

```ts
import {
  BullmqNodeExecutionScheduler,
  BullmqScheduler,
  BullmqWorker,
  type RedisConnectionConfig,
} from "@codemation/queue-bullmq";
```

Bind these classes in your composition root according to host conventions; Redis connection options are expressed via `RedisConnectionConfig` and your environment.
