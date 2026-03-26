# `@codemation/eventbus-redis`

**Redis-backed run event bus** implementation for Codemation, bridging engine events to infrastructure using **ioredis**. It implements host/runtime expectations for publishing and subscribing to run lifecycle traffic.

## At a glance

**End-to-end (why Redis):** run lifecycle signals must cross processes (API process vs worker, or multiple hosts). The engine publishes **`RunEvent`**; this package serializes them to Redis so every subscriber sees the same stream.

```
  Run starts
  ──────────
  · User clicks Run / HTTP command  ─┐
  · Webhook / trigger / schedule     ├──►  @codemation/host  ──►  Engine  ──►  RunEvent
                                       │         (StartWorkflowRun, etc.)      │  (publish)
                                       │                                      │
                                       │         ┌────────────────────────────┘
                                       │         ▼
                                       │   ┌──────────────────┐
                                       │   │ eventbus-redis   │  Redis PUBLISH to:
                                       └──►│ RedisRunEventBus │  · codemation.run-events.all
                                           │ (this package)   │  · codemation.run-events.workflow.<id>
                                           └────────┬─────────┘
                                                    │
                    any process with a subscriber   │ SUBSCRIBE (same channels)
                                                    ▼
                                           ┌──────────────────┐
                                           │ @codemation/host │
                                           │ WorkflowRunEvent │
                                           │ WebsocketRelay   │──► workflow WebSocket room
                                           └────────┬─────────┘      (clients subscribed by
                                                    │               workflowId)
                                                    ▼
                                           Browser / live UI updates
                                           (nodeQueued, nodeStarted, …)
```

**Compact view**

```
  Engine (main or worker)     Redis pub/sub              @codemation/host
  ┌────────────────────┐     ┌──────────────┐          ┌────────────────────────┐
  │ RunEvent publishers│────►│ RedisRunEvent│◄────────│ WorkflowRunEvent     │
  │ (engine + run store)│ pub │ Bus channels │ sub     │ WebsocketRelay → room  │
  └────────────────────┘     └──────────────┘          └────────────────────────┘
```

Workers and the HTTP server can live on different machines; all subscribe to the same Redis channels. **In-memory** `RunEventBus` only works inside one process.

## Typical events on this bus

These mirror `@codemation/core` **`RunEvent`** kinds (serialized over Redis):

| Kind            | Meaning (high level)                    |
| --------------- | --------------------------------------- |
| `runCreated`    | A workflow run was started (or resumed) |
| `runSaved`      | Persisted run state was written         |
| `nodeQueued`    | A node is scheduled / entered the queue |
| `nodeStarted`   | Execution of a node began               |
| `nodeCompleted` | A node finished successfully            |
| `nodeFailed`    | A node failed with an error snapshot    |

Use **in-memory** bus for single-process dev; switch to **Redis** when multiple processes or machines must observe the same run lifecycle.

## Install

```bash
pnpm add @codemation/eventbus-redis@^0.0.0
# or
npm install @codemation/eventbus-redis@^0.0.0
```

Requires a reachable Redis deployment compatible with your host configuration.

## When to use

Wire this package when you run Codemation in multi-process or scaled setups and want run events (progress, completion, errors) to flow through Redis instead of an in-memory bus.

## Usage

```ts
import { RedisRunEventBus } from "@codemation/eventbus-redis";
```

Register the implementation through your host DI/bootstrap where `EventBus`-style services are bound (exact wiring depends on your `CodemationApplication` configuration).
