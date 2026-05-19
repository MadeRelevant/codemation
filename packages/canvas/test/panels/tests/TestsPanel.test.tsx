// @vitest-environment jsdom

/**
 * Smoke tests for TestsPanel covering the static display branches:
 * - no test triggers → empty state message
 * - single trigger → label (not picker)
 * - multiple triggers → select picker
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createWorkflowCanvasApiClient, WorkflowCanvasApiClientProvider } from "@codemation/canvas-core";

import { TestsPanel } from "../../../src/panels/tests/TestsPanel";
import type { WorkflowNodeDto } from "@codemation/host/dto";

const neverResolveFetch: typeof globalThis.fetch = () => new Promise(() => {});

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
}

function makeApiClient() {
  return createWorkflowCanvasApiClient({
    apiBase: "",
    getToken: () => null,
    fetch: neverResolveFetch,
  });
}

function makeTestTrigger(id: string, name: string): WorkflowNodeDto {
  return {
    id,
    kind: "trigger",
    type: "TestTrigger",
    name,
    triggerKind: "test",
  } as unknown as WorkflowNodeDto;
}

function makeRegularNode(id: string): WorkflowNodeDto {
  return {
    id,
    kind: "node",
    type: "SomeNode",
    name: "Regular node",
  } as unknown as WorkflowNodeDto;
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={makeQueryClient()}>
      <WorkflowCanvasApiClientProvider value={makeApiClient()}>{children}</WorkflowCanvasApiClientProvider>
    </QueryClientProvider>
  );
}

describe("TestsPanel", () => {
  it("shows an empty state when workflow has no test triggers", () => {
    render(
      <Wrapper>
        <TestsPanel workflowId="wf-1" workflowNodes={[makeRegularNode("n1")]} />
      </Wrapper>,
    );
    expect(screen.getByText(/No test triggers in this workflow/i)).toBeInTheDocument();
  });

  it("shows a static label for a single test trigger", () => {
    render(
      <Wrapper>
        <TestsPanel workflowId="wf-1" workflowNodes={[makeTestTrigger("t1", "My Test Trigger")]} />
      </Wrapper>,
    );
    expect(screen.getByTestId("tests-panel-single-trigger-label")).toBeInTheDocument();
    expect(screen.getByText("My Test Trigger")).toBeInTheDocument();
  });

  it("shows a select picker when there are multiple test triggers", () => {
    render(
      <Wrapper>
        <TestsPanel
          workflowId="wf-1"
          workflowNodes={[makeTestTrigger("t1", "Trigger A"), makeTestTrigger("t2", "Trigger B")]}
        />
      </Wrapper>,
    );
    expect(screen.getByTestId("tests-panel-trigger-picker")).toBeInTheDocument();
  });
});
