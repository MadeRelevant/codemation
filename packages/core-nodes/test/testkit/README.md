# Core Nodes Test Kit

Reusable helpers for `@codemation/core-nodes` unit tests.

## Exports

### `CoreNodesTestContextFactory`

Builds a minimal `NodeExecutionContext<TConfig>` for node unit tests. All infrastructure (binary service, run data) uses in-memory variants so no external services are needed.

```ts
import { CoreNodesTestContextFactory } from "./testkit/CoreNodesTestContextFactory";

const ctx = CoreNodesTestContextFactory.create(config);
const out = await runPerItemLikeEngine(new SomeNode(), items, ctx);
```

### `TelemetryTestKit`

Capturing telemetry fakes for testing AI agent nodes and cost tracking.

| Export                           | Description                                                               |
| -------------------------------- | ------------------------------------------------------------------------- |
| `CapturingTelemetrySpanScope`    | Records all metrics, events, artifacts, and span-end calls.               |
| `CapturingNodeTelemetry`         | Extends scope with `NodeExecutionTelemetry` contract; tracks child spans. |
| `CapturingCostTrackingTelemetry` | Records usage records and delegates metric recording to parent scope.     |
| `StubCredentialSessionService`   | Always resolves with an empty string session (no-op).                     |

```ts
import { CapturingNodeTelemetry } from "./testkit/TelemetryTestKit";

const telemetry = new CapturingNodeTelemetry();
// ... run node ...
assert.equal(telemetry.metrics.length, 1);
```
