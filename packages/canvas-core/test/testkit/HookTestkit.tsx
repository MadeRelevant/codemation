/**
 * HookTestkit — minimal infrastructure for testing canvas-core hooks.
 *
 * Provides:
 *   - FakeWorkflowCanvasApiClient: never-resolving stubs for all API client methods.
 *   - mountHook: renderHook wrapper that supplies QueryClient + API client providers.
 *   - mountHookWithClient: like mountHook but exposes queryClient so tests can prime cache.
 *
 * The hooks under test (useWorkflowRunController, etc.) use TanStack Query.
 * Queries don't auto-fire in test environment without a real server — they stay in
 * "pending" state unless you prime the QueryClient cache via queryClient.setQueryData().
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
 *
 * Override individual methods per-test by passing a partial override object
 * to `buildFakeApiClient`.
 */
export class FakeWorkflowCanvasApiClient implements WorkflowCanvasApiClient {
  static neverResolves<T>(): Promise<T> {
    return new Promise(() => {
      /* intentionally never resolves */
    });
  }

  fetchWorkflows = () => FakeWorkflowCanvasApiClient.neverResolves() as never;
  fetchWorkflow = () => FakeWorkflowCanvasApiClient.neverResolves() as never;
  fetchWorkflowRuns = () => FakeWorkflowCanvasApiClient.neverResolves() as never;
  fetchWorkflowDebuggerOverlay = () => FakeWorkflowCanvasApiClient.neverResolves() as never;
  fetchRun = () => FakeWorkflowCanvasApiClient.neverResolves() as never;
  fetchRunDetail = () => FakeWorkflowCanvasApiClient.neverResolves() as never;
  fetchTelemetryRunTrace = () => FakeWorkflowCanvasApiClient.neverResolves() as never;
  fetchCredentialTypes = () => FakeWorkflowCanvasApiClient.neverResolves() as never;
  fetchCredentialFieldEnvStatus = () => FakeWorkflowCanvasApiClient.neverResolves() as never;
  fetchCredentialInstances = () => FakeWorkflowCanvasApiClient.neverResolves() as never;
  fetchCredentialInstanceWithSecrets = () => FakeWorkflowCanvasApiClient.neverResolves() as never;
  fetchWorkflowCredentialHealth = () => FakeWorkflowCanvasApiClient.neverResolves() as never;
  fetchUserAccounts = () => FakeWorkflowCanvasApiClient.neverResolves() as never;
  fetchWorkflowTestSuiteRuns = () => FakeWorkflowCanvasApiClient.neverResolves() as never;
  fetchTestSuiteRunDetail = () => FakeWorkflowCanvasApiClient.neverResolves() as never;
  fetchTestSuiteRunAssertions = () => FakeWorkflowCanvasApiClient.neverResolves() as never;
  fetchRunAssertions = () => FakeWorkflowCanvasApiClient.neverResolves() as never;
  fetchTestSuiteRunChildRuns = () => FakeWorkflowCanvasApiClient.neverResolves() as never;
  postStartTestSuiteRun = () => FakeWorkflowCanvasApiClient.neverResolves() as never;
  fetchAssertionMetricTrends = () => FakeWorkflowCanvasApiClient.neverResolves() as never;
  patchWorkflowActivation = () => FakeWorkflowCanvasApiClient.neverResolves() as never;
  postRunWorkflow = () => FakeWorkflowCanvasApiClient.neverResolves() as never;
  postRunNode = () => FakeWorkflowCanvasApiClient.neverResolves() as never;
  patchRunNodePin = () => FakeWorkflowCanvasApiClient.neverResolves() as never;
  patchRunWorkflowSnapshot = () => FakeWorkflowCanvasApiClient.neverResolves() as never;
  putWorkflowDebuggerOverlay = () => FakeWorkflowCanvasApiClient.neverResolves() as never;
  postWorkflowDebuggerOverlayCopyRun = () => FakeWorkflowCanvasApiClient.neverResolves() as never;
  postUserInvite = () => FakeWorkflowCanvasApiClient.neverResolves() as never;
  postUserInviteRegenerate = () => FakeWorkflowCanvasApiClient.neverResolves() as never;
  patchUserStatus = () => FakeWorkflowCanvasApiClient.neverResolves() as never;
  postWorkflowDebuggerOverlayBinaryUpload = () => FakeWorkflowCanvasApiClient.neverResolves() as never;
}

/**
 * Build a fake API client with method overrides for specific tests.
 * Unspecified methods fall back to never-resolving stubs.
 */
export function buildFakeApiClient(overrides: Partial<WorkflowCanvasApiClient> = {}): WorkflowCanvasApiClient {
  return Object.assign(new FakeWorkflowCanvasApiClient(), overrides);
}

// --------------------------------------------------------------------------
// mountHook / mountHookWithClient
// --------------------------------------------------------------------------

function makeWrapper(client: WorkflowCanvasApiClient, existingQueryClient?: QueryClient) {
  const queryClient =
    existingQueryClient ??
    new QueryClient({
      defaultOptions: {
        queries: {
          // Disable retries and caching so tests are deterministic
          retry: false,
          gcTime: 0,
          staleTime: 0,
        },
        mutations: {
          retry: false,
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

/**
 * Mounts a hook and exposes the QueryClient so tests can prime the cache via
 * queryClient.setQueryData() before or after render.
 */
export function mountHookWithClient<TResult>(
  render: () => TResult,
  options: Readonly<{
    client?: WorkflowCanvasApiClient;
    queryClient?: QueryClient;
  }> = {},
): RenderHookResult<TResult, unknown> & { queryClient: QueryClient } {
  const client = options.client ?? new FakeWorkflowCanvasApiClient();
  const { wrapper, queryClient } = makeWrapper(client, options.queryClient);
  const hookResult = renderHook(render, { wrapper });
  return Object.assign(hookResult, { queryClient });
}
