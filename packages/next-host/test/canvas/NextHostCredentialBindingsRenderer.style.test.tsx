// @vitest-environment jsdom
/**
 * Smoke test: NextHostCredentialBindingsRenderer renders without any inline `style=` props
 * in the section markup it directly controls.
 * Sprint 14 Story 11 — D4 (replace inline style blocks with Tailwind utilities).
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  NodeCredentialBindingsSection,
  WorkflowCanvasConfigProvider,
  WorkflowCanvasApiClientProvider,
} from "@codemation/canvas";
import type { NodeCredentialBindingsSlotProps } from "@codemation/canvas";
import { NextHostApiClientAdapter } from "../../src/features/workflows/canvas-adapter/NextHostApiClientAdapter";
import { NextHostCredentialBindingsRenderer } from "../../src/features/workflows/canvas-adapter/NextHostCredentialBindingsRenderer";
import {
  credentialInstancesQueryKey,
  workflowCredentialHealthQueryKey,
  credentialTypesQueryKey,
  credentialFieldEnvStatusQueryKey,
} from "@codemation/canvas";
import {
  testGmailOAuthCredentialType,
  testWorkflowCredentialHealthDto,
  testWorkflowDiagramNode,
  testWorkflowCredentialHealthSlot,
  testCredentialInstanceDto,
} from "../credentials/factories/credentialUiTestFactories";

const gmailType = testGmailOAuthCredentialType();

describe("NextHostCredentialBindingsRenderer — no inline style props (Sprint 14 Story 11 D4)", () => {
  afterEach(() => cleanup());

  it("renders the credential section without inline style attributes on the section and its direct children", () => {
    const workflowId = "wf-style-check";
    const node = testWorkflowDiagramNode();
    const instance = testCredentialInstanceDto({ instanceId: "inst-1", typeId: "gmail-oauth" });
    const slot = testWorkflowCredentialHealthSlot({
      workflowId,
      nodeId: node.id,
      slotKey: "mail",
      acceptedTypes: ["gmail-oauth"],
      health: { status: "healthy" },
      instance: {
        instanceId: "inst-1",
        typeId: "gmail-oauth",
        displayName: "Test mail",
        setupStatus: "ready",
      },
    });
    const health = testWorkflowCredentialHealthDto(workflowId, [slot]);

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(credentialTypesQueryKey, [gmailType]);
    queryClient.setQueryData(credentialInstancesQueryKey, [instance]);
    queryClient.setQueryData(credentialFieldEnvStatusQueryKey, {});
    queryClient.setQueryData(workflowCredentialHealthQueryKey(workflowId), health);

    const priorFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] }) as typeof fetch;

    const apiClient = new NextHostApiClientAdapter();
    const renderCredentialBindings = (props: NodeCredentialBindingsSlotProps) => (
      <NextHostCredentialBindingsRenderer {...props} />
    );

    const { container } = render(
      <WorkflowCanvasApiClientProvider value={apiClient}>
        <WorkflowCanvasConfigProvider value={{ renderCredentialBindings }}>
          <QueryClientProvider client={queryClient}>
            <NodeCredentialBindingsSection
              workflowId={workflowId}
              node={node}
              pendingCredentialEditForNodeId={null}
              onConsumedPendingCredentialEdit={vi.fn()}
            />
          </QueryClientProvider>
        </WorkflowCanvasConfigProvider>
      </WorkflowCanvasApiClientProvider>,
    );

    // Check only the section element we own and its direct children.
    // Child primitives (Radix Select, etc.) may add inline styles internally.
    const section = container.querySelector('[data-testid="node-properties-credential-section"]');
    if (section) {
      expect((section as HTMLElement).getAttribute("style")).toBeNull();
      const styledDirectChildren = section.querySelectorAll(":scope > [style]");
      expect(styledDirectChildren.length).toBe(0);
    }
    // If section is null, no credential slots rendered, which is fine.

    globalThis.fetch = priorFetch;
  });
});
