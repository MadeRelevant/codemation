/**
 * Tests for WorkflowCanvasApiClientContext and WorkflowCanvasConfigContext.
 * These are thin React context wrappers — tests verify hook behavior.
 */
import React from "react";
import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import {
  WorkflowCanvasApiClientProvider,
  useWorkflowCanvasApiClient,
  useWorkflowCanvasApiClientOptional,
} from "../../src/context/WorkflowCanvasApiClientContext";
import { WorkflowCanvasConfigProvider, useWorkflowCanvasConfig } from "../../src/context/WorkflowCanvasConfigContext";
import type { WorkflowCanvasApiClient } from "../../src/types/WorkflowCanvasApiClient";
import { FakeWorkflowCanvasApiClient } from "../testkit/HookTestkit";

// ── WorkflowCanvasApiClientContext ────────────────────────────────────────────

describe("useWorkflowCanvasApiClient", () => {
  it("throws when used outside provider", () => {
    expect(() => renderHook(() => useWorkflowCanvasApiClient())).toThrow();
  });

  it("returns the provided client", () => {
    const client: WorkflowCanvasApiClient = new FakeWorkflowCanvasApiClient();
    const { result } = renderHook(() => useWorkflowCanvasApiClient(), {
      wrapper: ({ children }) => (
        <WorkflowCanvasApiClientProvider value={client}>{children}</WorkflowCanvasApiClientProvider>
      ),
    });
    expect(result.current).toBe(client);
  });
});

describe("useWorkflowCanvasApiClientOptional", () => {
  it("returns null when used outside provider", () => {
    const { result } = renderHook(() => useWorkflowCanvasApiClientOptional());
    expect(result.current).toBeNull();
  });

  it("returns the provided client when inside provider", () => {
    const client: WorkflowCanvasApiClient = new FakeWorkflowCanvasApiClient();
    const { result } = renderHook(() => useWorkflowCanvasApiClientOptional(), {
      wrapper: ({ children }) => (
        <WorkflowCanvasApiClientProvider value={client}>{children}</WorkflowCanvasApiClientProvider>
      ),
    });
    expect(result.current).toBe(client);
  });
});

// ── WorkflowCanvasConfigContext ────────────────────────────────────────────────

describe("useWorkflowCanvasConfig", () => {
  it("returns undefined when used outside provider", () => {
    const { result } = renderHook(() => useWorkflowCanvasConfig());
    expect(result.current).toBeUndefined();
  });

  it("returns the provided config", () => {
    const config = { theme: "dark" } as never;
    const { result } = renderHook(() => useWorkflowCanvasConfig(), {
      wrapper: ({ children }) => <WorkflowCanvasConfigProvider value={config}>{children}</WorkflowCanvasConfigProvider>,
    });
    expect(result.current).toBe(config);
  });
});
