// @vitest-environment jsdom

import type { WorkflowCredentialHealthDto } from "@codemation/host-src/application/contracts/CredentialContractsRegistry";
import { ApiPaths } from "../../../host/src/presentation/http/ApiPaths";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NodeCredentialBindingsSection } from "../../src/features/workflows/components/workflowDetail/NodeCredentialBindingsSection";
import {
  credentialFieldEnvStatusQueryKey,
  credentialInstancesQueryKey,
  credentialTypesQueryKey,
  workflowCredentialHealthQueryKey,
} from "../../src/features/workflows/lib/realtime/realtimeQueryKeys";
import { installCredentialsJsdomPolyfills } from "./credentialsJsdomPolyfills";
import {
  testCredentialInstanceDto,
  testGmailOAuthCredentialType,
  testWorkflowCredentialHealthDto,
  testWorkflowCredentialHealthSlot,
  testWorkflowDiagramNode,
} from "./factories/credentialUiTestFactories";

installCredentialsJsdomPolyfills();

const gmailType = testGmailOAuthCredentialType();

describe("NodeCredentialBindingsSection", () => {
  const workflowId = "wf-bind-ui";
  const node = testWorkflowDiagramNode();

  let fetchMock: ReturnType<typeof vi.fn>;
  let priorFetch: typeof globalThis.fetch;

  beforeEach(() => {
    fetchMock = vi.fn();
    priorFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as typeof fetch;
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = priorFetch;
  });

  function renderSection(
    args: Readonly<{
      health: WorkflowCredentialHealthDto;
      credentialInstances?: ReadonlyArray<ReturnType<typeof testCredentialInstanceDto>>;
    }>,
  ) {
    const instances = args.credentialInstances ?? [];
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    queryClient.setQueryData(credentialTypesQueryKey, [gmailType]);
    queryClient.setQueryData(credentialInstancesQueryKey, instances);
    queryClient.setQueryData(credentialFieldEnvStatusQueryKey, {});
    queryClient.setQueryData(workflowCredentialHealthQueryKey(workflowId), args.health);

    let putBindingCalled = false;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (url === ApiPaths.credentialTypes() && method === "GET") {
        return { ok: true, json: async () => [gmailType] };
      }
      if (url === ApiPaths.credentialInstances() && method === "GET") {
        return { ok: true, json: async () => instances };
      }
      if (url === ApiPaths.credentialsEnvStatus() && method === "GET") {
        return { ok: true, json: async () => ({}) };
      }
      if (url.includes("/credential-health") && method === "GET") {
        return {
          ok: true,
          json: async () => args.health,
        };
      }
      if (url === ApiPaths.credentialInstances() && method === "POST") {
        return {
          ok: true,
          json: async () => ({
            instanceId: "new-inst-1",
            typeId: "gmail-oauth",
            displayName: "New mail",
            sourceKind: "db",
            publicConfig: {},
            tags: [],
            setupStatus: "ready",
            createdAt: "2026-01-01T00:00:00Z",
            updatedAt: "2026-01-01T00:00:00Z",
          }),
        };
      }
      if (url === ApiPaths.credentialInstanceTest("new-inst-1") && method === "POST") {
        return {
          ok: true,
          text: async () => JSON.stringify({ status: "healthy", message: "OK" }),
        };
      }
      if (url.includes("withSecrets=1") && method === "GET") {
        return {
          ok: true,
          json: async () => ({
            instanceId: "new-inst-1",
            typeId: "gmail-oauth",
            displayName: "New mail",
            sourceKind: "db",
            publicConfig: {},
            secretConfig: { token: "x" },
            tags: [],
            setupStatus: "ready",
            createdAt: "2026-01-01T00:00:00Z",
            updatedAt: "2026-01-01T00:00:00Z",
          }),
        };
      }
      if (url === ApiPaths.credentialBindings() && method === "PUT") {
        putBindingCalled = true;
        return { ok: true, json: async () => ({}) };
      }
      return { ok: true, json: async () => [] };
    });

    render(
      <QueryClientProvider client={queryClient}>
        <NodeCredentialBindingsSection
          workflowId={workflowId}
          node={node}
          pendingCredentialEditForNodeId={null}
          onConsumedPendingCredentialEdit={vi.fn()}
        />
      </QueryClientProvider>,
    );

    return { wasBindingPut: () => putBindingCalled };
  }

  it("does not render a credentials section when the node has no credential slots", () => {
    const health = testWorkflowCredentialHealthDto(workflowId, []);

    renderSection({ health });

    expect(screen.queryByTestId("node-properties-credential-section")).not.toBeInTheDocument();
  });

  it("PUTs credential binding when selecting an existing credential on an unbound slot", async () => {
    const health = testWorkflowCredentialHealthDto(workflowId, [
      testWorkflowCredentialHealthSlot({
        workflowId,
        nodeId: "node-1",
        slotKey: "mail",
        acceptedTypes: ["gmail-oauth"],
        health: { status: "unbound" },
      }),
    ]);

    const existingInstance = testCredentialInstanceDto({
      instanceId: "pick-me",
      typeId: "gmail-oauth",
      displayName: "Work Gmail",
    });

    const { wasBindingPut } = renderSection({ health, credentialInstances: [existingInstance] });

    fireEvent.click(screen.getByTestId("node-properties-credential-slot-select-node-1-mail"));
    const option = await screen.findByRole("option", { name: "Work Gmail" });
    fireEvent.click(option);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        ApiPaths.credentialBindings(),
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({
            workflowId,
            nodeId: "node-1",
            slotKey: "mail",
            instanceId: "pick-me",
          }),
        }),
      );
    });
    expect(wasBindingPut()).toBe(true);
  });

  it("PUTs credential binding after creating a credential from an empty slot", async () => {
    const health = testWorkflowCredentialHealthDto(workflowId, [
      testWorkflowCredentialHealthSlot({
        workflowId,
        nodeId: "node-1",
        slotKey: "mail",
        acceptedTypes: ["gmail-oauth"],
        health: { status: "unbound" },
      }),
    ]);

    const { wasBindingPut } = renderSection({ health });

    fireEvent.click(screen.getByTestId("node-properties-credential-slot-select-node-1-mail"));
    fireEvent.click(await screen.findByTestId("node-properties-credential-slot-new-node-1-mail"));

    await screen.findByTestId("credential-dialog");

    fireEvent.change(screen.getByTestId("credential-display-name-input"), {
      target: { value: "New mail" },
    });
    fireEvent.click(screen.getByTestId("credential-show-secrets-toggle"));
    fireEvent.change(await screen.findByTestId("credential-secret-token"), {
      target: { value: "secret-token" },
    });

    fireEvent.click(screen.getByTestId("credential-create-button"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        ApiPaths.credentialBindings(),
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({
            workflowId,
            nodeId: "node-1",
            slotKey: "mail",
            instanceId: "new-inst-1",
          }),
        }),
      );
    });
    expect(wasBindingPut()).toBe(true);
  });

  it("does not PUT credential binding when the slot already has an instance", async () => {
    const health = testWorkflowCredentialHealthDto(workflowId, [
      testWorkflowCredentialHealthSlot({
        workflowId,
        nodeId: "node-1",
        slotKey: "mail",
        acceptedTypes: ["gmail-oauth"],
        health: { status: "healthy" },
        instance: {
          instanceId: "existing-inst",
          typeId: "gmail-oauth",
          displayName: "Existing",
          setupStatus: "ready",
        },
      }),
    ]);

    renderSection({ health });

    fireEvent.click(screen.getByTestId("node-properties-credential-slot-select-node-1-mail"));
    fireEvent.click(await screen.findByTestId("node-properties-credential-slot-new-node-1-mail"));

    await screen.findByTestId("credential-dialog");

    fireEvent.change(screen.getByTestId("credential-display-name-input"), {
      target: { value: "Another" },
    });
    fireEvent.click(screen.getByTestId("credential-show-secrets-toggle"));
    fireEvent.change(await screen.findByTestId("credential-secret-token"), {
      target: { value: "secret-token" },
    });

    fireEvent.click(screen.getByTestId("credential-create-button"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        ApiPaths.credentialInstanceTest("new-inst-1"),
        expect.objectContaining({ method: "POST" }),
      );
    });

    const putCalls = fetchMock.mock.calls.filter(
      ([u, init]) => u === ApiPaths.credentialBindings() && (init as RequestInit | undefined)?.method === "PUT",
    );
    expect(putCalls).toHaveLength(0);
  });

  it("PUTs credential binding when selecting a different credential on an already-bound slot", async () => {
    const health = testWorkflowCredentialHealthDto(workflowId, [
      testWorkflowCredentialHealthSlot({
        workflowId,
        nodeId: "node-1",
        slotKey: "mail",
        acceptedTypes: ["gmail-oauth"],
        health: { status: "healthy" },
        instance: {
          instanceId: "existing-inst",
          typeId: "gmail-oauth",
          displayName: "Existing",
          setupStatus: "ready",
        },
      }),
    ]);

    const existingInstance = testCredentialInstanceDto({
      instanceId: "existing-inst",
      typeId: "gmail-oauth",
      displayName: "Existing",
    });
    const replacementInstance = testCredentialInstanceDto({
      instanceId: "replacement-inst",
      typeId: "gmail-oauth",
      displayName: "Replacement",
    });

    renderSection({ health, credentialInstances: [existingInstance, replacementInstance] });

    fireEvent.click(screen.getByTestId("node-properties-credential-slot-select-node-1-mail"));
    const option = await screen.findByRole("option", { name: "Replacement" });
    fireEvent.click(option);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        ApiPaths.credentialBindings(),
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({
            workflowId,
            nodeId: "node-1",
            slotKey: "mail",
            instanceId: "replacement-inst",
          }),
        }),
      );
    });
  });
});
