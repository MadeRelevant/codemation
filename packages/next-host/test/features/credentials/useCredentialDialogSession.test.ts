// @vitest-environment jsdom

import { ApiPaths } from "@codemation/host/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, act, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WorkflowCanvasApiClientProvider } from "@codemation/canvas";
import {
  credentialFieldEnvStatusQueryKey,
  credentialInstancesQueryKey,
  credentialTypesQueryKey,
} from "@codemation/canvas";
import { NextHostApiClientAdapter } from "../../../src/features/workflows/canvas-adapter/NextHostApiClientAdapter";
import { useCredentialDialogSession } from "../../../src/features/credentials/hooks/useCredentialDialogSession";
import type { CredentialDialogSessionOptions } from "../../../src/features/credentials/hooks/useCredentialDialogSession";
import {
  testCredentialInstanceDto,
  testCredentialTypeDefinition,
} from "../../credentials/factories/credentialUiTestFactories";

// ------------------------------------------------------------------ helpers

const apiKeyType = testCredentialTypeDefinition({
  typeId: "api-key",
  displayName: "API Key",
  secretFields: [{ key: "apiKey", label: "API Key", type: "password", required: true }],
});

const oauth2Type = testCredentialTypeDefinition({
  typeId: "gmail-oauth",
  displayName: "Gmail OAuth",
  secretFields: [],
  auth: { kind: "oauth2", providerId: "google" },
});

const existingInstance = testCredentialInstanceDto({
  instanceId: "inst-1",
  typeId: "api-key",
  displayName: "My API Key",
  sourceKind: "db",
  publicConfig: {},
});

function makeWrapper(queryClient: QueryClient) {
  const apiClient = new NextHostApiClientAdapter();
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return createElement(
      WorkflowCanvasApiClientProvider,
      { value: apiClient },
      createElement(QueryClientProvider, { client: queryClient }, children),
    );
  };
}

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function seedQueryClient(
  queryClient: QueryClient,
  overrides?: {
    types?: ReadonlyArray<ReturnType<typeof testCredentialTypeDefinition>>;
    instances?: ReadonlyArray<ReturnType<typeof testCredentialInstanceDto>>;
  },
) {
  queryClient.setQueryData(credentialTypesQueryKey, overrides?.types ?? [apiKeyType]);
  queryClient.setQueryData(credentialInstancesQueryKey, overrides?.instances ?? [existingInstance]);
  queryClient.setQueryData(credentialFieldEnvStatusQueryKey, {});
}

const defaultOptions: CredentialDialogSessionOptions = {
  closeAfterCreatePolicy: "always",
  oauthConnectedPolicy: "close_dialog",
  buildDialogProps: false,
};

// ------------------------------------------------------------------ tests

describe("useCredentialDialogSession", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let priorFetch: typeof globalThis.fetch;
  let priorWindowOpen: typeof window.open;

  beforeEach(() => {
    priorFetch = globalThis.fetch;
    priorWindowOpen = window.open;
    fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (url === ApiPaths.credentialTypes() && method === "GET") {
        return { ok: true, json: async () => [apiKeyType] } as Response;
      }
      if (url === ApiPaths.credentialInstances() && method === "GET") {
        return { ok: true, json: async () => [existingInstance] } as Response;
      }
      if (url === ApiPaths.credentialsEnvStatus() && method === "GET") {
        return { ok: true, json: async () => ({}) } as Response;
      }
      if (url === ApiPaths.oauth2RedirectUri() && method === "GET") {
        return { ok: true, json: async () => ({ redirectUri: "https://app/callback" }) } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });
    globalThis.fetch = fetchMock as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = priorFetch;
    window.open = priorWindowOpen;
  });

  // ---------------------------------------------------------------- 1. open/close

  describe("openCreateDialog / closeDialog state transitions", () => {
    it("starts with dialogMode null", () => {
      const queryClient = makeQueryClient();
      seedQueryClient(queryClient);
      const { result } = renderHook(() => useCredentialDialogSession(defaultOptions), {
        wrapper: makeWrapper(queryClient),
      });

      expect(result.current.dialogMode).toBeNull();
    });

    it("sets dialogMode to 'create' after openCreateDialog", async () => {
      const queryClient = makeQueryClient();
      seedQueryClient(queryClient);
      const { result } = renderHook(() => useCredentialDialogSession(defaultOptions), {
        wrapper: makeWrapper(queryClient),
      });

      act(() => {
        result.current.openCreateDialog();
      });

      expect(result.current.dialogMode).toBe("create");
    });

    it("pre-selects first type when openCreateDialog is called", async () => {
      const queryClient = makeQueryClient();
      seedQueryClient(queryClient);
      const { result } = renderHook(() => useCredentialDialogSession(defaultOptions), {
        wrapper: makeWrapper(queryClient),
      });

      act(() => {
        result.current.openCreateDialog();
      });

      expect(result.current.selectedTypeId).toBe("api-key");
    });

    it("filters types when openCreateDialog receives acceptedTypeIds", async () => {
      const queryClient = makeQueryClient();
      seedQueryClient(queryClient, { types: [apiKeyType, oauth2Type] });
      const { result } = renderHook(() => useCredentialDialogSession(defaultOptions), {
        wrapper: makeWrapper(queryClient),
      });

      act(() => {
        result.current.openCreateDialog(["gmail-oauth"]);
      });

      expect(result.current.selectedTypeId).toBe("gmail-oauth");
    });

    it("resets all state on closeDialog", async () => {
      const queryClient = makeQueryClient();
      seedQueryClient(queryClient);
      const { result } = renderHook(() => useCredentialDialogSession(defaultOptions), {
        wrapper: makeWrapper(queryClient),
      });

      act(() => {
        result.current.openCreateDialog();
      });
      expect(result.current.dialogMode).toBe("create");

      act(() => {
        result.current.closeDialog();
      });

      expect(result.current.dialogMode).toBeNull();
      expect(result.current.selectedTypeId).toBe("");
      expect(result.current.displayName).toBe("");
      expect(result.current.errorMessage).toBeNull();
      expect(result.current.dialogTestResult).toBeNull();
    });

    it("sets dialogMode to 'edit' after openEditDialog", async () => {
      const queryClient = makeQueryClient();
      seedQueryClient(queryClient);
      const { result } = renderHook(() => useCredentialDialogSession(defaultOptions), {
        wrapper: makeWrapper(queryClient),
      });

      act(() => {
        result.current.openEditDialog(existingInstance);
      });

      expect(result.current.dialogMode).toBe("edit");
      expect(result.current.editingInstanceId).toBe("inst-1");
      expect(result.current.editDisplayName).toBe("My API Key");
    });
  });

  // ---------------------------------------------------------------- 2. handleSubmit create path

  describe("createCredentialInstance (create submit)", () => {
    it("closes dialog after successful create when closeAfterCreatePolicy is 'always'", async () => {
      const queryClient = makeQueryClient();
      seedQueryClient(queryClient);

      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        if (url === ApiPaths.credentialTypes() && method === "GET") {
          return { ok: true, json: async () => [apiKeyType] } as Response;
        }
        if (url === ApiPaths.credentialInstances() && method === "GET") {
          return { ok: true, json: async () => [existingInstance] } as Response;
        }
        if (url === ApiPaths.credentialsEnvStatus() && method === "GET") {
          return { ok: true, json: async () => ({}) } as Response;
        }
        if (url === ApiPaths.credentialInstances() && method === "POST") {
          return {
            ok: true,
            json: async () => ({
              instanceId: "new-inst",
              typeId: "api-key",
              displayName: "My Key",
              sourceKind: "db",
              publicConfig: {},
              tags: [],
              setupStatus: "ready",
              createdAt: "2026-01-01T00:00:00Z",
              updatedAt: "2026-01-01T00:00:00Z",
            }),
          } as Response;
        }
        if (url === ApiPaths.credentialInstanceTest("new-inst") && method === "POST") {
          return { ok: true, json: async () => ({ status: "healthy", message: "OK" }) } as Response;
        }
        return { ok: true, json: async () => ({}) } as Response;
      });

      const { result } = renderHook(
        () => useCredentialDialogSession({ ...defaultOptions, closeAfterCreatePolicy: "always" }),
        { wrapper: makeWrapper(queryClient) },
      );

      act(() => {
        result.current.openCreateDialog();
      });
      act(() => {
        result.current.setDisplayName("My Key");
      });

      await act(async () => {
        await result.current.createCredentialInstance();
      });

      expect(result.current.dialogMode).toBeNull();
    });

    it("stays open for oauth2 when closeAfterCreatePolicy is 'unless_oauth2'", async () => {
      const queryClient = makeQueryClient();
      seedQueryClient(queryClient, { types: [oauth2Type] });

      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        if (url === ApiPaths.credentialTypes() && method === "GET") {
          return { ok: true, json: async () => [oauth2Type] } as Response;
        }
        if (url === ApiPaths.credentialInstances() && method === "GET") {
          return { ok: true, json: async () => [] } as Response;
        }
        if (url === ApiPaths.credentialsEnvStatus() && method === "GET") {
          return { ok: true, json: async () => ({}) } as Response;
        }
        if (url === ApiPaths.oauth2RedirectUri() && method === "GET") {
          return { ok: true, json: async () => ({ redirectUri: "https://app/callback" }) } as Response;
        }
        if (url === ApiPaths.credentialInstances() && method === "POST") {
          return {
            ok: true,
            json: async () => ({
              instanceId: "oauth-inst",
              typeId: "gmail-oauth",
              displayName: "Gmail",
              sourceKind: "db",
              publicConfig: {},
              tags: [],
              setupStatus: "ready",
              createdAt: "2026-01-01T00:00:00Z",
              updatedAt: "2026-01-01T00:00:00Z",
            }),
          } as Response;
        }
        if (url === ApiPaths.credentialInstanceTest("oauth-inst") && method === "POST") {
          return { ok: true, json: async () => ({ status: "healthy" }) } as Response;
        }
        return { ok: true, json: async () => ({}) } as Response;
      });

      const { result } = renderHook(
        () => useCredentialDialogSession({ ...defaultOptions, closeAfterCreatePolicy: "unless_oauth2" }),
        { wrapper: makeWrapper(queryClient) },
      );

      act(() => {
        result.current.openCreateDialog();
      });
      act(() => {
        result.current.setDisplayName("Gmail");
      });

      await act(async () => {
        await result.current.createCredentialInstance();
      });

      // Should stay in edit mode for oauth2 type
      expect(result.current.dialogMode).toBe("edit");
    });

    it("calls onCredentialCreated callback after create", async () => {
      const queryClient = makeQueryClient();
      seedQueryClient(queryClient);
      const onCredentialCreated = vi.fn();

      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        if (url === ApiPaths.credentialTypes() && method === "GET") {
          return { ok: true, json: async () => [apiKeyType] } as Response;
        }
        if (url === ApiPaths.credentialInstances() && method === "GET") {
          return { ok: true, json: async () => [existingInstance] } as Response;
        }
        if (url === ApiPaths.credentialsEnvStatus() && method === "GET") {
          return { ok: true, json: async () => ({}) } as Response;
        }
        if (url === ApiPaths.credentialInstances() && method === "POST") {
          return {
            ok: true,
            json: async () => ({
              instanceId: "cb-inst",
              typeId: "api-key",
              displayName: "CB Key",
              sourceKind: "db",
              publicConfig: {},
              tags: [],
              setupStatus: "ready",
              createdAt: "2026-01-01T00:00:00Z",
              updatedAt: "2026-01-01T00:00:00Z",
            }),
          } as Response;
        }
        if (url === ApiPaths.credentialInstanceTest("cb-inst") && method === "POST") {
          return { ok: true, json: async () => ({ status: "healthy" }) } as Response;
        }
        return { ok: true, json: async () => ({}) } as Response;
      });

      const { result } = renderHook(() => useCredentialDialogSession({ ...defaultOptions, onCredentialCreated }), {
        wrapper: makeWrapper(queryClient),
      });

      act(() => {
        result.current.openCreateDialog();
      });
      act(() => {
        result.current.setDisplayName("CB Key");
      });

      await act(async () => {
        await result.current.createCredentialInstance();
      });

      expect(onCredentialCreated).toHaveBeenCalledWith(expect.objectContaining({ instanceId: "cb-inst" }));
    });

    it("stays in edit mode when test fails after create (testPassed false branch)", async () => {
      const queryClient = makeQueryClient();
      seedQueryClient(queryClient);

      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        if (url === ApiPaths.credentialTypes() && method === "GET") {
          return { ok: true, json: async () => [apiKeyType] } as Response;
        }
        if (url === ApiPaths.credentialInstances() && method === "GET") {
          return { ok: true, json: async () => [existingInstance] } as Response;
        }
        if (url === ApiPaths.credentialsEnvStatus() && method === "GET") {
          return { ok: true, json: async () => ({}) } as Response;
        }
        if (url === ApiPaths.credentialInstances() && method === "POST") {
          return {
            ok: true,
            json: async () => ({
              instanceId: "fail-create-inst",
              typeId: "api-key",
              displayName: "Bad",
              sourceKind: "db",
              publicConfig: {},
              tags: [],
              setupStatus: "ready",
              createdAt: "2026-01-01T00:00:00Z",
              updatedAt: "2026-01-01T00:00:00Z",
            }),
          } as Response;
        }
        if (url === ApiPaths.credentialInstanceTest("fail-create-inst") && method === "POST") {
          return {
            ok: false,
            text: async () => JSON.stringify({ status: "failing", message: "Bad creds" }),
          } as Response;
        }
        return { ok: true, json: async () => ({}) } as Response;
      });

      const { result } = renderHook(
        () => useCredentialDialogSession({ ...defaultOptions, closeAfterCreatePolicy: "always" }),
        { wrapper: makeWrapper(queryClient) },
      );

      act(() => {
        result.current.openCreateDialog();
      });
      act(() => {
        result.current.setDisplayName("Bad");
      });

      await act(async () => {
        await result.current.createCredentialInstance();
      });

      // test failed → dialog stays open in edit mode (not closed)
      expect(result.current.dialogMode).toBe("edit");
    });

    it("closes dialog for non-oauth2 type with unless_oauth2 policy when test passes", async () => {
      const queryClient = makeQueryClient();
      seedQueryClient(queryClient);

      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        if (url === ApiPaths.credentialTypes() && method === "GET") {
          return { ok: true, json: async () => [apiKeyType] } as Response;
        }
        if (url === ApiPaths.credentialInstances() && method === "GET") {
          return { ok: true, json: async () => [existingInstance] } as Response;
        }
        if (url === ApiPaths.credentialsEnvStatus() && method === "GET") {
          return { ok: true, json: async () => ({}) } as Response;
        }
        if (url === ApiPaths.credentialInstances() && method === "POST") {
          return {
            ok: true,
            json: async () => ({
              instanceId: "non-oauth-inst",
              typeId: "api-key",
              displayName: "API",
              sourceKind: "db",
              publicConfig: {},
              tags: [],
              setupStatus: "ready",
              createdAt: "2026-01-01T00:00:00Z",
              updatedAt: "2026-01-01T00:00:00Z",
            }),
          } as Response;
        }
        if (url === ApiPaths.credentialInstanceTest("non-oauth-inst") && method === "POST") {
          return { ok: true, json: async () => ({ status: "healthy" }) } as Response;
        }
        return { ok: true, json: async () => ({}) } as Response;
      });

      const { result } = renderHook(
        () => useCredentialDialogSession({ ...defaultOptions, closeAfterCreatePolicy: "unless_oauth2" }),
        { wrapper: makeWrapper(queryClient) },
      );

      act(() => {
        result.current.openCreateDialog();
      });
      act(() => {
        result.current.setDisplayName("API");
      });

      await act(async () => {
        await result.current.createCredentialInstance();
      });

      // non-oauth2 type with unless_oauth2 policy → dialog closes
      expect(result.current.dialogMode).toBeNull();
    });
  });

  // ---------------------------------------------------------------- 3. handleSubmit edit path

  describe("updateCredentialInstance (edit submit)", () => {
    it("calls PUT and closes dialog on successful update", async () => {
      const queryClient = makeQueryClient();
      seedQueryClient(queryClient);

      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        if (url === ApiPaths.credentialTypes() && method === "GET") {
          return { ok: true, json: async () => [apiKeyType] } as Response;
        }
        if (url === ApiPaths.credentialInstances() && method === "GET") {
          return { ok: true, json: async () => [existingInstance] } as Response;
        }
        if (url === ApiPaths.credentialsEnvStatus() && method === "GET") {
          return { ok: true, json: async () => ({}) } as Response;
        }
        if (url === ApiPaths.credentialInstance("inst-1") && method === "PUT") {
          return { ok: true, json: async () => ({}) } as Response;
        }
        return { ok: true, json: async () => ({}) } as Response;
      });

      const { result } = renderHook(() => useCredentialDialogSession(defaultOptions), {
        wrapper: makeWrapper(queryClient),
      });

      act(() => {
        result.current.openEditDialog(existingInstance);
      });

      await act(async () => {
        await result.current.updateCredentialInstance();
      });

      expect(fetchMock).toHaveBeenCalledWith(
        ApiPaths.credentialInstance("inst-1"),
        expect.objectContaining({ method: "PUT" }),
      );
      expect(result.current.dialogMode).toBeNull();
    });

    it("does not close and does not PUT when no editingInstanceId", async () => {
      const queryClient = makeQueryClient();
      seedQueryClient(queryClient);
      const { result } = renderHook(() => useCredentialDialogSession(defaultOptions), {
        wrapper: makeWrapper(queryClient),
      });

      // Do NOT call openEditDialog — editingInstanceId stays null
      await act(async () => {
        await result.current.updateCredentialInstance();
      });

      const putCalls = fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "PUT");
      expect(putCalls).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------- 4. API error surfaces; dialog stays open

  describe("API error handling", () => {
    it("sets errorMessage on create POST failure and keeps dialog open", async () => {
      const queryClient = makeQueryClient();
      seedQueryClient(queryClient);

      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        if (url === ApiPaths.credentialTypes() && method === "GET") {
          return { ok: true, json: async () => [apiKeyType] } as Response;
        }
        if (url === ApiPaths.credentialInstances() && method === "GET") {
          return { ok: true, json: async () => [existingInstance] } as Response;
        }
        if (url === ApiPaths.credentialsEnvStatus() && method === "GET") {
          return { ok: true, json: async () => ({}) } as Response;
        }
        if (url === ApiPaths.credentialInstances() && method === "POST") {
          return { ok: false, text: async () => "Validation failed" } as Response;
        }
        return { ok: true, json: async () => ({}) } as Response;
      });

      const { result } = renderHook(() => useCredentialDialogSession(defaultOptions), {
        wrapper: makeWrapper(queryClient),
      });

      act(() => {
        result.current.openCreateDialog();
      });
      act(() => {
        result.current.setDisplayName("Bad Key");
      });

      await act(async () => {
        await result.current.createCredentialInstance();
      });

      expect(result.current.errorMessage).toContain("Validation failed");
      expect(result.current.dialogMode).toBe("create");
    });

    it("sets errorMessage on edit PUT failure and keeps dialog open", async () => {
      const queryClient = makeQueryClient();
      seedQueryClient(queryClient);

      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        if (url === ApiPaths.credentialTypes() && method === "GET") {
          return { ok: true, json: async () => [apiKeyType] } as Response;
        }
        if (url === ApiPaths.credentialInstances() && method === "GET") {
          return { ok: true, json: async () => [existingInstance] } as Response;
        }
        if (url === ApiPaths.credentialsEnvStatus() && method === "GET") {
          return { ok: true, json: async () => ({}) } as Response;
        }
        if (url === ApiPaths.credentialInstance("inst-1") && method === "PUT") {
          return { ok: false, text: async () => "Server error" } as Response;
        }
        return { ok: true, json: async () => ({}) } as Response;
      });

      const { result } = renderHook(() => useCredentialDialogSession(defaultOptions), {
        wrapper: makeWrapper(queryClient),
      });

      act(() => {
        result.current.openEditDialog(existingInstance);
      });

      await act(async () => {
        await result.current.updateCredentialInstance();
      });

      expect(result.current.errorMessage).toContain("Server error");
      expect(result.current.dialogMode).toBe("edit");
    });
  });

  // ---------------------------------------------------------------- 5. handleTest success

  describe("testCredentialFromDialog — success", () => {
    it("sets dialogTestResult to healthy on success", async () => {
      const queryClient = makeQueryClient();
      seedQueryClient(queryClient);

      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        if (url === ApiPaths.credentialTypes() && method === "GET") {
          return { ok: true, json: async () => [apiKeyType] } as Response;
        }
        if (url === ApiPaths.credentialInstances() && method === "GET") {
          return { ok: true, json: async () => [existingInstance] } as Response;
        }
        if (url === ApiPaths.credentialsEnvStatus() && method === "GET") {
          return { ok: true, json: async () => ({}) } as Response;
        }
        if (url === ApiPaths.credentialInstances() && method === "POST") {
          return {
            ok: true,
            json: async () => ({
              instanceId: "test-inst",
              typeId: "api-key",
              displayName: "T",
              sourceKind: "db",
              publicConfig: {},
              tags: [],
              setupStatus: "ready",
              createdAt: "2026-01-01T00:00:00Z",
              updatedAt: "2026-01-01T00:00:00Z",
            }),
          } as Response;
        }
        if (url === ApiPaths.credentialInstanceTest("test-inst") && method === "POST") {
          return { ok: true, json: async () => ({ status: "healthy", message: "All good" }) } as Response;
        }
        return { ok: true, json: async () => ({}) } as Response;
      });

      const { result } = renderHook(() => useCredentialDialogSession(defaultOptions), {
        wrapper: makeWrapper(queryClient),
      });

      act(() => {
        result.current.openCreateDialog();
      });
      act(() => {
        result.current.setDisplayName("T");
      });

      await act(async () => {
        await result.current.testCredentialFromDialog();
      });

      expect(result.current.dialogTestResult).toMatchObject({ status: "healthy", message: "All good" });
    });
  });

  // ---------------------------------------------------------------- 6. handleTest failure

  describe("testCredentialFromDialog — failure", () => {
    it("sets dialogTestResult to failing on HTTP error", async () => {
      const queryClient = makeQueryClient();
      seedQueryClient(queryClient);

      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        if (url === ApiPaths.credentialTypes() && method === "GET") {
          return { ok: true, json: async () => [apiKeyType] } as Response;
        }
        if (url === ApiPaths.credentialInstances() && method === "GET") {
          return { ok: true, json: async () => [existingInstance] } as Response;
        }
        if (url === ApiPaths.credentialsEnvStatus() && method === "GET") {
          return { ok: true, json: async () => ({}) } as Response;
        }
        if (url === ApiPaths.credentialInstances() && method === "POST") {
          return {
            ok: true,
            json: async () => ({
              instanceId: "fail-inst",
              typeId: "api-key",
              displayName: "F",
              sourceKind: "db",
              publicConfig: {},
              tags: [],
              setupStatus: "ready",
              createdAt: "2026-01-01T00:00:00Z",
              updatedAt: "2026-01-01T00:00:00Z",
            }),
          } as Response;
        }
        if (url === ApiPaths.credentialInstanceTest("fail-inst") && method === "POST") {
          return {
            ok: false,
            text: async () => JSON.stringify({ status: "failing", message: "Bad token" }),
          } as Response;
        }
        return { ok: true, json: async () => ({}) } as Response;
      });

      const { result } = renderHook(() => useCredentialDialogSession(defaultOptions), {
        wrapper: makeWrapper(queryClient),
      });

      act(() => {
        result.current.openCreateDialog();
      });
      act(() => {
        result.current.setDisplayName("F");
      });

      await act(async () => {
        await result.current.testCredentialFromDialog();
      });

      expect(result.current.dialogTestResult).toMatchObject({ status: "failing", message: "Bad token" });
    });

    it("sets dialogTestResult to failing on non-HTTP error", async () => {
      const queryClient = makeQueryClient();
      seedQueryClient(queryClient);

      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        if (url === ApiPaths.credentialTypes() && method === "GET") {
          return { ok: true, json: async () => [apiKeyType] } as Response;
        }
        if (url === ApiPaths.credentialInstances() && method === "GET") {
          return { ok: true, json: async () => [existingInstance] } as Response;
        }
        if (url === ApiPaths.credentialsEnvStatus() && method === "GET") {
          return { ok: true, json: async () => ({}) } as Response;
        }
        if (url === ApiPaths.credentialInstances() && method === "POST") {
          return {
            ok: true,
            json: async () => ({
              instanceId: "err-inst",
              typeId: "api-key",
              displayName: "E",
              sourceKind: "db",
              publicConfig: {},
              tags: [],
              setupStatus: "ready",
              createdAt: "2026-01-01T00:00:00Z",
              updatedAt: "2026-01-01T00:00:00Z",
            }),
          } as Response;
        }
        if (url === ApiPaths.credentialInstanceTest("err-inst") && method === "POST") {
          throw new Error("Network error");
        }
        return { ok: true, json: async () => ({}) } as Response;
      });

      const { result } = renderHook(() => useCredentialDialogSession(defaultOptions), {
        wrapper: makeWrapper(queryClient),
      });

      act(() => {
        result.current.openCreateDialog();
      });
      act(() => {
        result.current.setDisplayName("E");
      });

      await act(async () => {
        await result.current.testCredentialFromDialog();
      });

      expect(result.current.dialogTestResult).toMatchObject({ status: "failing", message: "Network error" });
    });
  });

  // ---------------------------------------------------------------- 7. handleConnectOAuth2

  describe("connectOAuth2Credential", () => {
    it("opens a popup window with the OAuth2 auth URL after creating a credential", async () => {
      const queryClient = makeQueryClient();
      seedQueryClient(queryClient, { types: [oauth2Type] });

      const fakePopup = { closed: false };
      window.open = vi.fn(() => fakePopup as unknown as Window);

      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        if (url === ApiPaths.credentialTypes() && method === "GET") {
          return { ok: true, json: async () => [oauth2Type] } as Response;
        }
        if (url === ApiPaths.credentialInstances() && method === "GET") {
          return { ok: true, json: async () => [] } as Response;
        }
        if (url === ApiPaths.credentialsEnvStatus() && method === "GET") {
          return { ok: true, json: async () => ({}) } as Response;
        }
        if (url === ApiPaths.oauth2RedirectUri() && method === "GET") {
          return { ok: true, json: async () => ({ redirectUri: "https://app/callback" }) } as Response;
        }
        if (url === ApiPaths.credentialInstances() && method === "POST") {
          return {
            ok: true,
            json: async () => ({
              instanceId: "oauth-popup-inst",
              typeId: "gmail-oauth",
              displayName: "Gmail",
              sourceKind: "db",
              publicConfig: {},
              tags: [],
              setupStatus: "ready",
              createdAt: "2026-01-01T00:00:00Z",
              updatedAt: "2026-01-01T00:00:00Z",
            }),
          } as Response;
        }
        return { ok: true, json: async () => ({}) } as Response;
      });

      const { result } = renderHook(() => useCredentialDialogSession(defaultOptions), {
        wrapper: makeWrapper(queryClient),
      });

      act(() => {
        result.current.openCreateDialog();
      });
      act(() => {
        result.current.setDisplayName("Gmail");
      });

      await act(async () => {
        await result.current.connectOAuth2Credential();
      });

      expect(window.open).toHaveBeenCalledWith(
        ApiPaths.oauth2Auth("oauth-popup-inst"),
        expect.stringContaining("oauth-popup-inst"),
        expect.stringContaining("popup"),
      );
    });

    it("sets errorMessage when popup is blocked (window.open returns null)", async () => {
      const queryClient = makeQueryClient();
      seedQueryClient(queryClient, { types: [oauth2Type] });

      window.open = vi.fn(() => null);

      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        if (url === ApiPaths.credentialTypes() && method === "GET") {
          return { ok: true, json: async () => [oauth2Type] } as Response;
        }
        if (url === ApiPaths.credentialInstances() && method === "GET") {
          return { ok: true, json: async () => [] } as Response;
        }
        if (url === ApiPaths.credentialsEnvStatus() && method === "GET") {
          return { ok: true, json: async () => ({}) } as Response;
        }
        if (url === ApiPaths.oauth2RedirectUri() && method === "GET") {
          return { ok: true, json: async () => ({ redirectUri: "https://app/callback" }) } as Response;
        }
        if (url === ApiPaths.credentialInstances() && method === "POST") {
          return {
            ok: true,
            json: async () => ({
              instanceId: "popup-blocked-inst",
              typeId: "gmail-oauth",
              displayName: "Gmail",
              sourceKind: "db",
              publicConfig: {},
              tags: [],
              setupStatus: "ready",
              createdAt: "2026-01-01T00:00:00Z",
              updatedAt: "2026-01-01T00:00:00Z",
            }),
          } as Response;
        }
        return { ok: true, json: async () => ({}) } as Response;
      });

      const { result } = renderHook(() => useCredentialDialogSession(defaultOptions), {
        wrapper: makeWrapper(queryClient),
      });

      act(() => {
        result.current.openCreateDialog();
      });
      act(() => {
        result.current.setDisplayName("Gmail");
      });

      await act(async () => {
        await result.current.connectOAuth2Credential();
      });

      expect(result.current.errorMessage).toContain("blocked");
    });
  });

  // ---------------------------------------------------------------- 8. handleDisconnectOAuth2

  describe("executeOAuthDisconnect", () => {
    it("POSTs to disconnect endpoint and refreshes queries", async () => {
      const queryClient = makeQueryClient();
      seedQueryClient(queryClient);

      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        if (url === ApiPaths.credentialTypes() && method === "GET") {
          return { ok: true, json: async () => [apiKeyType] } as Response;
        }
        if (url === ApiPaths.credentialInstances() && method === "GET") {
          return { ok: true, json: async () => [existingInstance] } as Response;
        }
        if (url === ApiPaths.credentialsEnvStatus() && method === "GET") {
          return { ok: true, json: async () => ({}) } as Response;
        }
        if (url === ApiPaths.oauth2Disconnect("inst-1") && method === "POST") {
          return { ok: true, json: async () => ({}) } as Response;
        }
        return { ok: true, json: async () => ({}) } as Response;
      });

      const { result } = renderHook(() => useCredentialDialogSession(defaultOptions), {
        wrapper: makeWrapper(queryClient),
      });

      act(() => {
        result.current.openEditDialog(existingInstance);
      });

      await act(async () => {
        await result.current.executeOAuthDisconnect();
      });

      expect(fetchMock).toHaveBeenCalledWith(
        ApiPaths.oauth2Disconnect("inst-1"),
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("does nothing if editingInstanceId is null", async () => {
      const queryClient = makeQueryClient();
      seedQueryClient(queryClient);
      const { result } = renderHook(() => useCredentialDialogSession(defaultOptions), {
        wrapper: makeWrapper(queryClient),
      });

      await act(async () => {
        await result.current.executeOAuthDisconnect();
      });

      const disconnectCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes("/oauth2/disconnect"));
      expect(disconnectCalls).toHaveLength(0);
    });

    it("sets errorMessage on disconnect failure", async () => {
      const queryClient = makeQueryClient();
      seedQueryClient(queryClient);

      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        if (url === ApiPaths.credentialTypes() && method === "GET") {
          return { ok: true, json: async () => [apiKeyType] } as Response;
        }
        if (url === ApiPaths.credentialInstances() && method === "GET") {
          return { ok: true, json: async () => [existingInstance] } as Response;
        }
        if (url === ApiPaths.credentialsEnvStatus() && method === "GET") {
          return { ok: true, json: async () => ({}) } as Response;
        }
        if (url === ApiPaths.oauth2Disconnect("inst-1") && method === "POST") {
          return { ok: false, text: async () => "Disconnect failed" } as Response;
        }
        return { ok: true, json: async () => ({}) } as Response;
      });

      const { result } = renderHook(() => useCredentialDialogSession(defaultOptions), {
        wrapper: makeWrapper(queryClient),
      });

      act(() => {
        result.current.openEditDialog(existingInstance);
      });

      await act(async () => {
        await result.current.executeOAuthDisconnect();
      });

      expect(result.current.errorMessage).toContain("Disconnect failed");
    });
  });

  // ---------------------------------------------------------------- 9. oauthConnectedPolicy variants

  describe("oauthConnectedPolicy", () => {
    it("closes dialog on oauth2.connected message when policy is 'close_dialog'", async () => {
      const queryClient = makeQueryClient();
      seedQueryClient(queryClient);
      const { result } = renderHook(
        () => useCredentialDialogSession({ ...defaultOptions, oauthConnectedPolicy: "close_dialog" }),
        { wrapper: makeWrapper(queryClient) },
      );

      act(() => {
        result.current.openCreateDialog();
      });
      expect(result.current.dialogMode).toBe("create");

      await act(async () => {
        window.dispatchEvent(
          new MessageEvent("message", {
            data: { kind: "oauth2.connected", instanceId: "inst-1" },
            origin: window.location.origin,
          }),
        );
      });

      await waitFor(() => {
        expect(result.current.dialogMode).toBeNull();
      });
    });

    it("keeps dialog open on oauth2.connected message when policy is 'refresh_only'", async () => {
      const queryClient = makeQueryClient();
      seedQueryClient(queryClient);
      const { result } = renderHook(
        () => useCredentialDialogSession({ ...defaultOptions, oauthConnectedPolicy: "refresh_only" }),
        { wrapper: makeWrapper(queryClient) },
      );

      act(() => {
        result.current.openCreateDialog();
      });
      expect(result.current.dialogMode).toBe("create");

      await act(async () => {
        window.dispatchEvent(
          new MessageEvent("message", {
            data: { kind: "oauth2.connected", instanceId: "inst-1" },
            origin: window.location.origin,
          }),
        );
      });

      // Dialog should remain open
      expect(result.current.dialogMode).toBe("create");
    });

    it("sets errorMessage on oauth2.error message", async () => {
      const queryClient = makeQueryClient();
      seedQueryClient(queryClient);
      const { result } = renderHook(() => useCredentialDialogSession(defaultOptions), {
        wrapper: makeWrapper(queryClient),
      });

      act(() => {
        result.current.openCreateDialog();
      });

      await act(async () => {
        window.dispatchEvent(
          new MessageEvent("message", {
            data: { kind: "oauth2.error", message: "OAuth provider rejected" },
            origin: window.location.origin,
          }),
        );
      });

      expect(result.current.errorMessage).toBe("OAuth provider rejected");
    });

    it("ignores messages from different origins", async () => {
      const queryClient = makeQueryClient();
      seedQueryClient(queryClient);
      const { result } = renderHook(
        () => useCredentialDialogSession({ ...defaultOptions, oauthConnectedPolicy: "close_dialog" }),
        { wrapper: makeWrapper(queryClient) },
      );

      act(() => {
        result.current.openCreateDialog();
      });

      await act(async () => {
        window.dispatchEvent(
          new MessageEvent("message", {
            data: { kind: "oauth2.connected" },
            origin: "https://evil.example.com",
          }),
        );
      });

      // Should still be open (message ignored)
      expect(result.current.dialogMode).toBe("create");
    });
  });

  // ---------------------------------------------------------------- additional: cancelOAuthDisconnect

  describe("cancelOAuthDisconnect", () => {
    it("closes the disconnect confirmation without calling API", async () => {
      const queryClient = makeQueryClient();
      seedQueryClient(queryClient);
      const { result } = renderHook(() => useCredentialDialogSession(defaultOptions), {
        wrapper: makeWrapper(queryClient),
      });

      act(() => {
        result.current.openEditDialog(existingInstance);
        result.current.setOauthDisconnectConfirmOpen(true);
      });
      expect(result.current.oauthDisconnectConfirmOpen).toBe(true);

      act(() => {
        result.current.cancelOAuthDisconnect();
      });

      expect(result.current.oauthDisconnectConfirmOpen).toBe(false);
      const disconnectCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes("/oauth2/disconnect"));
      expect(disconnectCalls).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------- dialogProps when buildDialogProps = true

  describe("dialogProps", () => {
    it("returns null when buildDialogProps is false", () => {
      const queryClient = makeQueryClient();
      seedQueryClient(queryClient);
      const { result } = renderHook(() => useCredentialDialogSession({ ...defaultOptions, buildDialogProps: false }), {
        wrapper: makeWrapper(queryClient),
      });

      act(() => {
        result.current.openCreateDialog();
      });

      expect(result.current.dialogProps).toBeNull();
    });

    it("returns dialogProps when buildDialogProps is true and dialog is open", () => {
      const queryClient = makeQueryClient();
      seedQueryClient(queryClient);
      const { result } = renderHook(() => useCredentialDialogSession({ ...defaultOptions, buildDialogProps: true }), {
        wrapper: makeWrapper(queryClient),
      });

      act(() => {
        result.current.openCreateDialog();
      });

      expect(result.current.dialogProps).not.toBeNull();
      expect(result.current.dialogProps?.mode).toBe("create");
    });

    it("returns null dialogProps when dialog is closed even if buildDialogProps is true", () => {
      const queryClient = makeQueryClient();
      seedQueryClient(queryClient);
      const { result } = renderHook(() => useCredentialDialogSession({ ...defaultOptions, buildDialogProps: true }), {
        wrapper: makeWrapper(queryClient),
      });

      expect(result.current.dialogProps).toBeNull();
    });

    it("exposes onDisconnectOAuth2 that opens the confirm dialog", () => {
      const queryClient = makeQueryClient();
      seedQueryClient(queryClient);
      const { result } = renderHook(() => useCredentialDialogSession({ ...defaultOptions, buildDialogProps: true }), {
        wrapper: makeWrapper(queryClient),
      });

      act(() => {
        result.current.openEditDialog(existingInstance);
      });

      expect(result.current.dialogProps).not.toBeNull();
      act(() => {
        result.current.dialogProps!.onDisconnectOAuth2();
      });
      expect(result.current.oauthDisconnectConfirmOpen).toBe(true);
    });
  });

  // ---------------------------------------------------------------- credential with secrets effect (db + env)

  describe("credentialWithSecretsQuery effect", () => {
    it("populates edit secret values from db secretConfig when query data arrives", async () => {
      const queryClient = makeQueryClient();
      seedQueryClient(queryClient);

      const instanceWithSecrets = {
        instanceId: "inst-1",
        typeId: "api-key",
        displayName: "My API Key",
        sourceKind: "db",
        publicConfig: {},
        secretConfig: { apiKey: "secret-val" },
        tags: [],
        setupStatus: "ready" as const,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      };

      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        if (url === ApiPaths.credentialTypes() && method === "GET") {
          return { ok: true, json: async () => [apiKeyType] } as Response;
        }
        if (url === ApiPaths.credentialInstances() && method === "GET") {
          return { ok: true, json: async () => [existingInstance] } as Response;
        }
        if (url === ApiPaths.credentialsEnvStatus() && method === "GET") {
          return { ok: true, json: async () => ({}) } as Response;
        }
        if (url === ApiPaths.credentialInstance("inst-1", true) && method === "GET") {
          return { ok: true, json: async () => instanceWithSecrets } as Response;
        }
        return { ok: true, json: async () => ({}) } as Response;
      });

      const { result } = renderHook(() => useCredentialDialogSession(defaultOptions), {
        wrapper: makeWrapper(queryClient),
      });

      act(() => {
        result.current.openEditDialog(existingInstance);
      });

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(ApiPaths.credentialInstance("inst-1", true), expect.anything());
      });

      await waitFor(() => {
        expect(result.current.editSecretFieldValues["apiKey"]).toBe("secret-val");
      });
    });

    it("populates edit env ref values from env envSecretRefs when query data arrives", async () => {
      const envInstance = testCredentialInstanceDto({
        instanceId: "env-inst",
        typeId: "api-key",
        displayName: "Env API Key",
        sourceKind: "env",
        publicConfig: {},
      });

      const queryClient = makeQueryClient();
      seedQueryClient(queryClient, { instances: [envInstance] });

      const instanceWithSecrets = {
        instanceId: "env-inst",
        typeId: "api-key",
        displayName: "Env API Key",
        sourceKind: "env",
        publicConfig: {},
        envSecretRefs: { apiKey: "MY_API_KEY" },
        tags: [],
        setupStatus: "ready" as const,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      };

      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        if (url === ApiPaths.credentialTypes() && method === "GET") {
          return { ok: true, json: async () => [apiKeyType] } as Response;
        }
        if (url === ApiPaths.credentialInstances() && method === "GET") {
          return { ok: true, json: async () => [envInstance] } as Response;
        }
        if (url === ApiPaths.credentialsEnvStatus() && method === "GET") {
          return { ok: true, json: async () => ({}) } as Response;
        }
        if (url === ApiPaths.credentialInstance("env-inst", true) && method === "GET") {
          return { ok: true, json: async () => instanceWithSecrets } as Response;
        }
        return { ok: true, json: async () => ({}) } as Response;
      });

      const { result } = renderHook(() => useCredentialDialogSession(defaultOptions), {
        wrapper: makeWrapper(queryClient),
      });

      act(() => {
        result.current.openEditDialog(envInstance);
      });

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(ApiPaths.credentialInstance("env-inst", true), expect.anything());
      });

      await waitFor(() => {
        expect(result.current.editEnvRefValues["apiKey"]).toBe("MY_API_KEY");
      });
    });
  });

  // ---------------------------------------------------------------- testCredentialFromDialog with no type selected

  describe("testCredentialFromDialog early return when no type", () => {
    it("returns early without error when dialogMode is null and no type selected", async () => {
      const queryClient = makeQueryClient();
      seedQueryClient(queryClient);
      const { result } = renderHook(() => useCredentialDialogSession(defaultOptions), {
        wrapper: makeWrapper(queryClient),
      });

      // Do not open dialog — ensureDialogCredentialInstance will return null for create mode
      // because selectedType is undefined
      await act(async () => {
        await result.current.testCredentialFromDialog();
      });

      // No error, no test result — returns cleanly
      expect(result.current.dialogTestResult).toBeNull();
      expect(result.current.errorMessage).toBeNull();
    });
  });

  // ---------------------------------------------------------------- updateCredentialInstance with env sourceKind

  describe("updateCredentialInstance env source kind", () => {
    it("includes envSecretRefs in PUT body for env-sourced credential", async () => {
      const envInstance = testCredentialInstanceDto({
        instanceId: "env-inst-2",
        typeId: "api-key",
        displayName: "Env Key",
        sourceKind: "env",
        publicConfig: {},
      });

      const queryClient = makeQueryClient();
      seedQueryClient(queryClient, { instances: [envInstance] });

      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        if (url === ApiPaths.credentialTypes() && method === "GET") {
          return { ok: true, json: async () => [apiKeyType] } as Response;
        }
        if (url === ApiPaths.credentialInstances() && method === "GET") {
          return { ok: true, json: async () => [envInstance] } as Response;
        }
        if (url === ApiPaths.credentialsEnvStatus() && method === "GET") {
          return { ok: true, json: async () => ({}) } as Response;
        }
        if (url === ApiPaths.credentialInstance("env-inst-2", true) && method === "GET") {
          return {
            ok: true,
            json: async () => ({
              ...envInstance,
              envSecretRefs: { apiKey: "EXISTING_VAR" },
            }),
          } as Response;
        }
        if (url === ApiPaths.credentialInstance("env-inst-2") && method === "PUT") {
          return { ok: true, json: async () => ({}) } as Response;
        }
        return { ok: true, json: async () => ({}) } as Response;
      });

      const { result } = renderHook(() => useCredentialDialogSession(defaultOptions), {
        wrapper: makeWrapper(queryClient),
      });

      act(() => {
        result.current.openEditDialog(envInstance);
      });

      act(() => {
        result.current.setEditEnvRefValues({ apiKey: "NEW_VAR" });
      });

      await act(async () => {
        await result.current.updateCredentialInstance();
      });

      const putCalls = fetchMock.mock.calls.filter(
        ([url, init]) =>
          url === ApiPaths.credentialInstance("env-inst-2") && (init as RequestInit | undefined)?.method === "PUT",
      );
      expect(putCalls).toHaveLength(1);
      const body = JSON.parse(putCalls[0][1].body as string) as Record<string, unknown>;
      expect(body.envSecretRefs).toMatchObject({ apiKey: "NEW_VAR" });
    });
  });

  // ---------------------------------------------------------------- updateCredentialInstance oauth2 path (test run after PUT)

  describe("updateCredentialInstance oauth2 test-after-PUT path", () => {
    it("runs test after PUT for oauth2 credential and closes on success", async () => {
      const oauth2Instance = testCredentialInstanceDto({
        instanceId: "oauth2-edit",
        typeId: "gmail-oauth",
        displayName: "Gmail",
        sourceKind: "db",
        publicConfig: {},
      });

      const queryClient = makeQueryClient();
      seedQueryClient(queryClient, { types: [oauth2Type], instances: [oauth2Instance] });

      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        if (url === ApiPaths.credentialTypes() && method === "GET") {
          return { ok: true, json: async () => [oauth2Type] } as Response;
        }
        if (url === ApiPaths.credentialInstances() && method === "GET") {
          return { ok: true, json: async () => [oauth2Instance] } as Response;
        }
        if (url === ApiPaths.credentialsEnvStatus() && method === "GET") {
          return { ok: true, json: async () => ({}) } as Response;
        }
        if (url === ApiPaths.credentialInstance("oauth2-edit", true) && method === "GET") {
          return { ok: true, json: async () => ({ ...oauth2Instance, secretConfig: {} }) } as Response;
        }
        if (url === ApiPaths.oauth2RedirectUri() && method === "GET") {
          return { ok: true, json: async () => ({ redirectUri: "https://app/callback" }) } as Response;
        }
        if (url === ApiPaths.credentialInstance("oauth2-edit") && method === "PUT") {
          return { ok: true, json: async () => ({}) } as Response;
        }
        if (url === ApiPaths.credentialInstanceTest("oauth2-edit") && method === "POST") {
          return { ok: true, json: async () => ({ status: "healthy" }) } as Response;
        }
        return { ok: true, json: async () => ({}) } as Response;
      });

      const { result } = renderHook(() => useCredentialDialogSession(defaultOptions), {
        wrapper: makeWrapper(queryClient),
      });

      act(() => {
        result.current.openEditDialog(oauth2Instance);
      });

      await act(async () => {
        await result.current.updateCredentialInstance();
      });

      expect(fetchMock).toHaveBeenCalledWith(
        ApiPaths.credentialInstanceTest("oauth2-edit"),
        expect.objectContaining({ method: "POST" }),
      );
      expect(result.current.dialogMode).toBeNull();
    });

    it("keeps dialog open when test fails after PUT for oauth2 credential", async () => {
      const oauth2Instance = testCredentialInstanceDto({
        instanceId: "oauth2-edit-fail",
        typeId: "gmail-oauth",
        displayName: "Gmail",
        sourceKind: "db",
        publicConfig: {},
      });

      const queryClient = makeQueryClient();
      seedQueryClient(queryClient, { types: [oauth2Type], instances: [oauth2Instance] });

      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        if (url === ApiPaths.credentialTypes() && method === "GET") {
          return { ok: true, json: async () => [oauth2Type] } as Response;
        }
        if (url === ApiPaths.credentialInstances() && method === "GET") {
          return { ok: true, json: async () => [oauth2Instance] } as Response;
        }
        if (url === ApiPaths.credentialsEnvStatus() && method === "GET") {
          return { ok: true, json: async () => ({}) } as Response;
        }
        if (url === ApiPaths.credentialInstance("oauth2-edit-fail", true) && method === "GET") {
          return { ok: true, json: async () => ({ ...oauth2Instance, secretConfig: {} }) } as Response;
        }
        if (url === ApiPaths.oauth2RedirectUri() && method === "GET") {
          return { ok: true, json: async () => ({ redirectUri: "https://app/callback" }) } as Response;
        }
        if (url === ApiPaths.credentialInstance("oauth2-edit-fail") && method === "PUT") {
          return { ok: true, json: async () => ({}) } as Response;
        }
        if (url === ApiPaths.credentialInstanceTest("oauth2-edit-fail") && method === "POST") {
          return {
            ok: false,
            text: async () => JSON.stringify({ status: "failing", message: "Auth expired" }),
          } as Response;
        }
        return { ok: true, json: async () => ({}) } as Response;
      });

      const { result } = renderHook(() => useCredentialDialogSession(defaultOptions), {
        wrapper: makeWrapper(queryClient),
      });

      act(() => {
        result.current.openEditDialog(oauth2Instance);
      });

      await act(async () => {
        await result.current.updateCredentialInstance();
      });

      expect(result.current.dialogMode).toBe("edit");
      expect(result.current.dialogTestResult).toMatchObject({ status: "failing" });
    });
  });

  // ---------------------------------------------------------------- connectOAuth2Credential early return (no instance)

  describe("connectOAuth2Credential early return", () => {
    it("returns without calling window.open when no type is selected (ensureDialogCredentialInstance returns null)", async () => {
      const queryClient = makeQueryClient();
      seedQueryClient(queryClient);

      window.open = vi.fn(() => null);

      const { result } = renderHook(() => useCredentialDialogSession(defaultOptions), {
        wrapper: makeWrapper(queryClient),
      });

      // Do NOT open a dialog — selectedType is undefined so ensureDialogCredentialInstance returns null
      await act(async () => {
        await result.current.connectOAuth2Credential();
      });

      expect(window.open).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------- oauth2RedirectUri fetch error

  describe("oauth2RedirectUri fetch error", () => {
    it("sets errorMessage when redirect URI fetch fails during edit of oauth2 credential", async () => {
      const oauth2Instance = testCredentialInstanceDto({
        instanceId: "oauth2-inst",
        typeId: "gmail-oauth",
        displayName: "Gmail",
        sourceKind: "db",
        publicConfig: {},
      });

      const queryClient = makeQueryClient();
      seedQueryClient(queryClient, { types: [oauth2Type], instances: [oauth2Instance] });

      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        if (url === ApiPaths.credentialTypes() && method === "GET") {
          return { ok: true, json: async () => [oauth2Type] } as Response;
        }
        if (url === ApiPaths.credentialInstances() && method === "GET") {
          return { ok: true, json: async () => [oauth2Instance] } as Response;
        }
        if (url === ApiPaths.credentialsEnvStatus() && method === "GET") {
          return { ok: true, json: async () => ({}) } as Response;
        }
        if (url === ApiPaths.credentialInstance("oauth2-inst", true) && method === "GET") {
          return { ok: true, json: async () => ({ ...oauth2Instance, secretConfig: {} }) } as Response;
        }
        if (url === ApiPaths.oauth2RedirectUri() && method === "GET") {
          return { ok: false, text: async () => "Redirect URI fetch failed" } as Response;
        }
        return { ok: true, json: async () => ({}) } as Response;
      });

      const { result } = renderHook(() => useCredentialDialogSession(defaultOptions), {
        wrapper: makeWrapper(queryClient),
      });

      await act(async () => {
        result.current.openEditDialog(oauth2Instance);
      });

      await waitFor(() => {
        expect(result.current.errorMessage).toContain("Redirect URI fetch failed");
      });
    });
  });

  // ---------------------------------------------------------------- ensureDialogCredentialInstance env source

  describe("ensureDialogCredentialInstance with env sourceKind", () => {
    it("creates credential with envSecretRefs when sourceKind is env", async () => {
      const queryClient = makeQueryClient();
      seedQueryClient(queryClient);

      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        if (url === ApiPaths.credentialTypes() && method === "GET") {
          return { ok: true, json: async () => [apiKeyType] } as Response;
        }
        if (url === ApiPaths.credentialInstances() && method === "GET") {
          return { ok: true, json: async () => [existingInstance] } as Response;
        }
        if (url === ApiPaths.credentialsEnvStatus() && method === "GET") {
          return { ok: true, json: async () => ({}) } as Response;
        }
        if (url === ApiPaths.credentialInstances() && method === "POST") {
          return {
            ok: true,
            json: async () => ({
              instanceId: "env-created",
              typeId: "api-key",
              displayName: "Env Created",
              sourceKind: "env",
              publicConfig: {},
              tags: [],
              setupStatus: "ready",
              createdAt: "2026-01-01T00:00:00Z",
              updatedAt: "2026-01-01T00:00:00Z",
            }),
          } as Response;
        }
        if (url === ApiPaths.credentialInstanceTest("env-created") && method === "POST") {
          return { ok: true, json: async () => ({ status: "healthy" }) } as Response;
        }
        return { ok: true, json: async () => ({}) } as Response;
      });

      const { result } = renderHook(
        () => useCredentialDialogSession({ ...defaultOptions, closeAfterCreatePolicy: "always" }),
        { wrapper: makeWrapper(queryClient) },
      );

      act(() => {
        result.current.openCreateDialog();
      });
      act(() => {
        result.current.setSourceKind("env");
        result.current.setDisplayName("Env Created");
      });
      // Set env refs after sourceKind change effect has run (resetCreateForm clears them)
      act(() => {
        result.current.setEnvRefValues({ apiKey: "MY_KEY_VAR" });
      });

      await act(async () => {
        await result.current.createCredentialInstance();
      });

      const postCalls = fetchMock.mock.calls.filter(
        ([url, init]) => url === ApiPaths.credentialInstances() && (init as RequestInit | undefined)?.method === "POST",
      );
      expect(postCalls).toHaveLength(1);
      const body = JSON.parse(postCalls[0][1].body as string) as Record<string, unknown>;
      expect(body.sourceKind).toBe("env");
      expect(body.envSecretRefs).toMatchObject({ apiKey: "MY_KEY_VAR" });
    });
  });
});
