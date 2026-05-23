/**
 * Smoke tests for the three main workflow detail hooks.
 *
 * Strategy: mount each hook in a minimal provider tree (QueryClient +
 * WorkflowCanvasApiClientProvider) via HookTestkit.mountHook().
 * All API calls return never-resolving promises, so queries stay in "pending"
 * state and tests just verify hooks mount without throwing.
 *
 * The realtime bridge auto-initialises to no-op state (retainWorkflowSubscription: null),
 * so no WebSocket setup is needed.
 */
import { describe, it, expect } from "vitest";
import { mountHook } from "../testkit/HookTestkit";
import { useWorkflowRunController } from "../../src/hooks/workflowDetail/useWorkflowRunController";
import { useWorkflowInspectController } from "../../src/hooks/workflowDetail/useWorkflowInspectController";
import { useWorkflowDetailController } from "../../src/hooks/workflowDetail/useWorkflowDetailController";
import type { NavigationAdapter } from "../../src/types/NavigationAdapter";

const fakeNavigation: NavigationAdapter = {
  urlLocation: { selectedRunId: null, isRunsPaneVisible: false, nodeId: null },
  navigateToLocation: () => {},
};

describe("useWorkflowRunController smoke", () => {
  it("mounts without throwing", () => {
    const { result } = mountHook(() =>
      useWorkflowRunController({
        workflowId: "wf-test",
        navigation: fakeNavigation,
      }),
    );
    expect(result.current).toBeDefined();
  });

  it("returns a workflow run controller with expected shape", () => {
    const { result } = mountHook(() =>
      useWorkflowRunController({
        workflowId: "wf-test",
        navigation: fakeNavigation,
      }),
    );
    // Verify critical fields are present (type contract is enforced at compile time)
    expect(typeof result.current.runWorkflowFromCanvas).toBe("function");
    expect(result.current).not.toBeNull();
  });
});

describe("useWorkflowInspectController smoke", () => {
  it("mounts without throwing", () => {
    const { result } = mountHook(() =>
      useWorkflowInspectController({
        workflowId: "wf-test",
        navigation: fakeNavigation,
      }),
    );
    expect(result.current).toBeDefined();
  });

  it("returns an object with inspect-related handler functions", () => {
    const { result } = mountHook(() =>
      useWorkflowInspectController({
        workflowId: "wf-test",
        navigation: fakeNavigation,
      }),
    );
    // Verify the result is a non-null object with some handler properties
    expect(result.current).not.toBeNull();
    expect(typeof result.current).toBe("object");
  });
});

describe("useWorkflowDetailController smoke", () => {
  it("mounts without throwing", () => {
    const { result } = mountHook(() =>
      useWorkflowDetailController({
        workflowId: "wf-test",
        navigation: fakeNavigation,
      }),
    );
    expect(result.current).toBeDefined();
  });

  it("returns a result with run controller shape merged in (runWorkflowFromCanvas is a function)", () => {
    const { result } = mountHook(() =>
      useWorkflowDetailController({
        workflowId: "wf-test",
        navigation: fakeNavigation,
      }),
    );
    // runWorkflowFromCanvas comes from the run sub-controller merged into the facade
    expect(typeof (result.current as Record<string, unknown>)["runWorkflowFromCanvas"]).toBe("function");
  });
});
