# Canvas Core Test Kit

Reusable helpers for `@codemation/canvas-core` unit tests.

## `HookTestkit.tsx`

Provides `renderHook` infrastructure for canvas-core hooks.

| Export                        | Description                                                                                                                       |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `FakeWorkflowCanvasApiClient` | All methods return never-resolving promises. Safe to mount hooks without a real server — TanStack Query stays in "pending" state. |
| `mountHook(render, client?)`  | Wraps `renderHook` with `QueryClientProvider` + `WorkflowCanvasApiClientProvider`.                                                |

### Usage

```tsx
import { mountHook } from "../testkit/HookTestkit";
import { useWorkflowRunController } from "../../src/hooks/workflowDetail/useWorkflowRunController";

it("mounts without throwing", () => {
  const { result } = mountHook(() => useWorkflowRunController({ workflowId: "wf-test", navigation: fakeNav }));
  expect(result.current).toBeDefined();
});
```

### Environment

The `vitest.config.ts` uses `jsdom` so DOM APIs are available for React hooks.
Canvas-lib pure tests (no DOM needed) also run in jsdom without issues.

### Realtime bridge

`getRealtimeBridge()` auto-initialises with `retainWorkflowSubscription: null`.
All `useWorkflowRealtimeSubscription` effects guard on null, so no WebSocket setup is needed.
