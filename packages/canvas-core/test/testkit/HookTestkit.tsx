/**
 * HookTestkit — minimal infrastructure for testing canvas-core hooks.
 *
 * Provides:
 *   - FakeWorkflowCanvasApiClient: never-resolving stubs for all API client methods.
 *   - mountHook: renderHook wrapper that supplies QueryClient + API client providers.
 *
 * The hooks under test (useWorkflowRunController, etc.) use TanStack Query.
 * Queries don't auto-fire in test environment without a real server — they stay in
 * "pending" state. The tests therefore only assert on initial state (no loading,
 * error, or data assertions beyond "hook mounted without throwing").
 *
 * The realtime bridge (getRealtimeBridge) auto-initialises to a no-op state
 * (retainWorkflowSubscription: null), so WebSocket infrastructure is not needed.
 */
import React from "react";
import { renderHook, type RenderHookResult } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WorkflowCanvasApiClientProvider } from "../../src/context/WorkflowCanvasApiClientContext";
import type { WorkflowCanvasApiClient } from "../../src/types/WorkflowCanvasApiClient";

// --------------------------------------------------------------------------
// Fake API Client
// --------------------------------------------------------------------------

/**
 * WorkflowCanvasApiClient implementation where every method returns a promise
 * that never resolves (simulates a pending network request). Safe to mount hooks
 * against — TanStack Query won't error on startup with a pending promise.
 */
export class FakeWorkflowCanvasApiClient implements WorkflowCanvasApiClient {
  private static neverResolves<T>(): Promise<T> {
    return new Promise(() => {
      /* intentionally never resolves */
    });
  }

  getWorkflow = (_id: string) => FakeWorkflowCanvasApiClient.neverResolves() as never;
  getWorkflows = () => FakeWorkflowCanvasApiClient.neverResolves() as never;
  createWorkflow = () => FakeWorkflowCanvasApiClient.neverResolves() as never;
  updateWorkflow = () => FakeWorkflowCanvasApiClient.neverResolves() as never;
  deleteWorkflow = () => FakeWorkflowCanvasApiClient.neverResolves() as never;
  activateWorkflow = () => FakeWorkflowCanvasApiClient.neverResolves() as never;
  deactivateWorkflow = () => FakeWorkflowCanvasApiClient.neverResolves() as never;
  runWorkflow = () => FakeWorkflowCanvasApiClient.neverResolves() as never;
  stopRun = () => FakeWorkflowCanvasApiClient.neverResolves() as never;
  getRun = () => FakeWorkflowCanvasApiClient.neverResolves() as never;
  getRuns = () => FakeWorkflowCanvasApiClient.neverResolves() as never;
  getWorkflowRuns = () => FakeWorkflowCanvasApiClient.neverResolves() as never;
  getWorkflowCredentialHealth = () => FakeWorkflowCanvasApiClient.neverResolves() as never;
  getWorkflowDebuggerOverlay = () => FakeWorkflowCanvasApiClient.neverResolves() as never;
  getWorkflowDevBuildState = () => FakeWorkflowCanvasApiClient.neverResolves() as never;
  setWorkflowActivation = () => FakeWorkflowCanvasApiClient.neverResolves() as never;
  getCredentialInstances = () => FakeWorkflowCanvasApiClient.neverResolves() as never;
  getCredentialInstance = () => FakeWorkflowCanvasApiClient.neverResolves() as never;
  getCredentialInstanceWithSecrets = () => FakeWorkflowCanvasApiClient.neverResolves() as never;
  createCredentialInstance = () => FakeWorkflowCanvasApiClient.neverResolves() as never;
  updateCredentialInstance = () => FakeWorkflowCanvasApiClient.neverResolves() as never;
  deleteCredentialInstance = () => FakeWorkflowCanvasApiClient.neverResolves() as never;
  testCredentialInstance = () => FakeWorkflowCanvasApiClient.neverResolves() as never;
  getCredentialTypes = () => FakeWorkflowCanvasApiClient.neverResolves() as never;
  getCredentialFieldEnvStatus = () => FakeWorkflowCanvasApiClient.neverResolves() as never;
  getUserAccounts = () => FakeWorkflowCanvasApiClient.neverResolves() as never;
  inviteUser = () => FakeWorkflowCanvasApiClient.neverResolves() as never;
  regenerateUserInvite = () => FakeWorkflowCanvasApiClient.neverResolves() as never;
  updateUserAccountStatus = () => FakeWorkflowCanvasApiClient.neverResolves() as never;
  startTestSuiteRun = () => FakeWorkflowCanvasApiClient.neverResolves() as never;
  getTestSuiteRun = () => FakeWorkflowCanvasApiClient.neverResolves() as never;
  getTestSuiteRuns = () => FakeWorkflowCanvasApiClient.neverResolves() as never;
  getTestSuiteChildRuns = () => FakeWorkflowCanvasApiClient.neverResolves() as never;
  getTestAssertions = () => FakeWorkflowCanvasApiClient.neverResolves() as never;
  getAssertionMetricTrend = () => FakeWorkflowCanvasApiClient.neverResolves() as never;
  pinRunData = () => FakeWorkflowCanvasApiClient.neverResolves() as never;
  unpinRunData = () => FakeWorkflowCanvasApiClient.neverResolves() as never;
  getPinnedRunData = () => FakeWorkflowCanvasApiClient.neverResolves() as never;
  getTelemetryRunTrace = () => FakeWorkflowCanvasApiClient.neverResolves() as never;
  uploadBinary = () => FakeWorkflowCanvasApiClient.neverResolves() as never;
  getRunDebuggerOverlay = () => FakeWorkflowCanvasApiClient.neverResolves() as never;
}

// --------------------------------------------------------------------------
// mountHook
// --------------------------------------------------------------------------

function makeWrapper(client: WorkflowCanvasApiClient) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Disable retries and caching so tests are deterministic
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
    },
  });

  function TestWrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <WorkflowCanvasApiClientProvider value={client}>{children}</WorkflowCanvasApiClientProvider>
      </QueryClientProvider>
    );
  }

  return { wrapper: TestWrapper, queryClient };
}

/**
 * Mounts a hook in a minimal provider tree (QueryClient + WorkflowCanvasApiClientProvider).
 * Returns the renderHook result.
 */
export function mountHook<TResult>(
  render: () => TResult,
  client: WorkflowCanvasApiClient = new FakeWorkflowCanvasApiClient(),
): RenderHookResult<TResult, unknown> {
  const { wrapper } = makeWrapper(client);
  return renderHook(render, { wrapper });
}
