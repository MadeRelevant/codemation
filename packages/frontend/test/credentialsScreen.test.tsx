import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CredentialTypeDefinition } from "@codemation/core/browser";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CredentialsScreen } from "../src/ui/screens/CredentialsScreen";
import type { CredentialInstanceDto } from "../src/application/contracts/CredentialContracts";
import { ApiPaths } from "../src/presentation/http/ApiPaths";

describe("CredentialsScreen", () => {
  const credentialType = {
    typeId: "test.apiKey",
    displayName: "Test API key",
    secretFields: [{ key: "apiKey", label: "API key", type: "password" as const, required: true as const }],
  };
  const serviceAccountCredentialType = {
    typeId: "test.serviceAccount",
    displayName: "Test service account",
    secretFields: [
      { key: "clientEmail", label: "Client email", type: "string" as const, required: true as const },
      { key: "privateKey", label: "Private key", type: "textarea" as const, required: true as const },
    ],
  };
  const oauthCredentialType = {
    typeId: "test.oauth",
    displayName: "Test OAuth",
    publicFields: [{ key: "clientId", label: "Client ID", type: "string" as const, required: true as const }],
    secretFields: [{ key: "clientSecret", label: "Client secret", type: "password" as const, required: true as const }],
    auth: {
      kind: "oauth2" as const,
      providerId: "google",
      scopes: ["scope.one"],
    },
  };
  const orderedCredentialType = {
    typeId: "test.ordered",
    displayName: "Test ordered",
    publicFields: [
      { key: "region", label: "Region", type: "string" as const, required: true as const, order: 3 },
      { key: "accountId", label: "Account ID", type: "string" as const, required: true as const, order: 1 },
    ],
    secretFields: [
      { key: "apiKey", label: "API key", type: "password" as const, required: true as const, order: 2 },
    ],
  } as unknown as CredentialTypeDefinition;
  const credentialInstance = {
    instanceId: "inst-1",
    typeId: "test.apiKey",
    displayName: "My test credential",
    sourceKind: "db" as const,
    publicConfig: {},
    tags: [],
    setupStatus: "ready" as const,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
  const oauthCredentialInstance = {
    instanceId: "oauth-inst-1",
    typeId: "test.oauth",
    displayName: "My OAuth credential",
    sourceKind: "db" as const,
    publicConfig: { clientId: "client-id-123" },
    tags: [],
    setupStatus: "draft" as const,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    oauth2Connection: {
      status: "disconnected" as const,
      providerId: "google",
      scopes: ["scope.one"],
    },
  };
  const credentialWithSecrets = {
    ...credentialInstance,
    secretConfig: { apiKey: "actual-secret-value" },
  };
  const serviceAccountInstance = {
    instanceId: "svc-1",
    typeId: "test.serviceAccount",
    displayName: "Service account",
    sourceKind: "db" as const,
    publicConfig: {},
    tags: [],
    setupStatus: "ready" as const,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
  const serviceAccountWithSecrets = {
    ...serviceAccountInstance,
    secretConfig: {
      clientEmail: "svc@example.com",
      privateKey: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----",
    },
  };

  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("open", vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  function renderCredentialsScreen(initialData?: {
    credentialTypes?: ReadonlyArray<CredentialTypeDefinition>;
    credentialInstances?: ReadonlyArray<CredentialInstanceDto>;
  }) {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    if (initialData?.credentialTypes) {
      queryClient.setQueryData(["credential-types"], initialData.credentialTypes);
    }
    if (initialData?.credentialInstances) {
      queryClient.setQueryData(["credential-instances"], initialData.credentialInstances);
    }
    return render(
      <QueryClientProvider client={queryClient}>
        <CredentialsScreen />
      </QueryClientProvider>,
    );
  }

  it("renders credentials screen", () => {
    renderCredentialsScreen({
      credentialTypes: [credentialType],
      credentialInstances: [],
    });

    expect(screen.getByTestId("credentials-screen")).toBeInTheDocument();
    expect(screen.getByTestId("credential-add-button")).toBeInTheDocument();
  });

  it("shows credential instance and opens edit dialog when name is clicked", async () => {
    renderCredentialsScreen({
      credentialTypes: [credentialType],
      credentialInstances: [credentialInstance],
    });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => credentialWithSecrets,
    });

    const nameButton = screen.getByTestId("credential-instance-name-inst-1");
    fireEvent.click(nameButton);

    expect(screen.getByTestId("credential-dialog")).toBeInTheDocument();
    expect(screen.getByTestId("credential-show-secrets-toggle")).toBeInTheDocument();
  });

  it("shows masked value by default and reveals on toggle click", async () => {
    renderCredentialsScreen({
      credentialTypes: [credentialType],
      credentialInstances: [credentialInstance],
    });

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => credentialWithSecrets,
    });

    fireEvent.click(screen.getByTestId("credential-instance-name-inst-1"));

    await screen.findByTestId("credential-dialog");

    const secretInput = await screen.findByTestId("credential-secret-apiKey");
    await waitFor(() => {
      expect(secretInput).toHaveValue("••••••••••••");
    });

    fireEvent.click(screen.getByTestId("credential-show-secrets-toggle"));

    expect(secretInput).toHaveValue("actual-secret-value");
  });

  it("does not mask non-password secret fields in edit mode", async () => {
    renderCredentialsScreen({
      credentialTypes: [serviceAccountCredentialType],
      credentialInstances: [serviceAccountInstance],
    });

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => serviceAccountWithSecrets,
    });

    fireEvent.click(screen.getByTestId("credential-instance-name-svc-1"));

    await waitFor(() => {
      expect(screen.getByTestId("credential-secret-clientEmail")).toHaveValue("svc@example.com");
    });
    await waitFor(() => {
      expect(screen.getByTestId("credential-secret-privateKey")).toHaveValue(
        "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----",
      );
    });
    expect(screen.queryByTestId("credential-show-secrets-toggle")).not.toBeInTheDocument();
  });

  it("shows modern alert with full message when credential test fails", async () => {
    const longErrorMessage =
      "Credential requires environment variables that are not set: GMAIL_SERVICE_ACCOUNT_CLIENT_EMAIL, GMAIL_SERVICE_ACCOUNT_PRIVATE_KEY. Please configure these in your environment.";

    renderCredentialsScreen({
      credentialTypes: [credentialType],
      credentialInstances: [credentialInstance],
    });

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () =>
        JSON.stringify({
          status: "failing",
          message: longErrorMessage,
        }),
    });

    fireEvent.click(screen.getByTestId("credential-instance-test-button-inst-1"));

    const alert = await screen.findByTestId("credential-test-failure-alert");
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveAttribute("role", "alert");
    expect(screen.getByTestId("credential-test-failure-alert")).toHaveTextContent(longErrorMessage);

    fireEvent.click(screen.getByTestId("credential-test-failure-alert-dismiss"));
    expect(screen.queryByTestId("credential-test-failure-alert")).not.toBeInTheDocument();
  });

  it("fetches credential with secrets when opening edit", async () => {
    renderCredentialsScreen({
      credentialTypes: [credentialType],
      credentialInstances: [credentialInstance],
    });

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => credentialWithSecrets,
    });

    fireEvent.click(screen.getByTestId("credential-instance-name-inst-1"));

    await screen.findByTestId("credential-dialog");

    const withSecretsCall = fetchMock.mock.calls.find((call) => call[0]?.includes("withSecrets=1"));
    expect(withSecretsCall).toBeDefined();
    expect(withSecretsCall![0]).toContain("instances/inst-1");
    expect(withSecretsCall![0]).toContain("withSecrets=1");
  });

  it("renders public fields and OAuth2 controls for OAuth credential types", async () => {
    renderCredentialsScreen({
      credentialTypes: [oauthCredentialType],
      credentialInstances: [oauthCredentialInstance],
    });

    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("withSecrets=1")) {
        return {
          ok: true,
          json: async () => ({
            ...oauthCredentialInstance,
            secretConfig: { clientSecret: "client-secret-value" },
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({ redirectUri: "http://localhost:3000/api/oauth2/callback" }),
      };
    });

    fireEvent.click(screen.getByTestId("credential-instance-name-oauth-inst-1"));

    expect(await screen.findByTestId("credential-public-clientId")).toHaveValue("client-id-123");
    expect(await screen.findByTestId("credential-oauth2-redirect-uri")).toHaveValue(
      "http://localhost:3000/api/oauth2/callback",
    );
    expect(screen.getByTestId("credential-oauth2-connect-button")).toBeInTheDocument();
    expect(screen.getByTestId("credential-oauth2-disconnect-button")).toBeDisabled();
  });

  it("renders mixed public and secret fields in the configured order", async () => {
    renderCredentialsScreen({
      credentialTypes: [orderedCredentialType],
      credentialInstances: [],
    });

    fireEvent.click(screen.getByTestId("credential-add-button"));
    fireEvent.change(screen.getByTestId("credential-type-select"), {
      target: { value: "test.ordered" },
    });

    const accountIdInput = await screen.findByTestId("credential-public-accountId");
    const apiKeyInput = await screen.findByTestId("credential-secret-apiKey");
    const regionInput = await screen.findByTestId("credential-public-region");

    expect(accountIdInput.compareDocumentPosition(apiKeyInput) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(apiKeyInput.compareDocumentPosition(regionInput) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
  });

  it("lets secret values be revealed while creating a credential", async () => {
    renderCredentialsScreen({
      credentialTypes: [credentialType],
      credentialInstances: [],
    });

    fireEvent.click(screen.getByTestId("credential-add-button"));
    fireEvent.change(screen.getByTestId("credential-type-select"), {
      target: { value: "test.apiKey" },
    });

    const secretInput = await screen.findByTestId("credential-secret-apiKey");
    expect(secretInput).toHaveAttribute("type", "password");

    fireEvent.click(screen.getByTestId("credential-show-secrets-toggle"));

    expect(secretInput).toHaveAttribute("type", "text");
  });

  it("creates and tests a regular credential from the create dialog", async () => {
    renderCredentialsScreen({
      credentialTypes: [credentialType],
      credentialInstances: [],
    });

    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === ApiPaths.credentialInstances() && init?.method === "POST") {
        return {
          ok: true,
          json: async () => ({
            ...credentialInstance,
            displayName: "Draft credential",
          }),
        };
      }
      if (url === ApiPaths.credentialInstanceTest("inst-1") && init?.method === "POST") {
        return {
          ok: true,
          text: async () => JSON.stringify({ status: "healthy", message: "Connected to provider." }),
        };
      }
      return {
        ok: true,
        json: async () => [],
      };
    });

    fireEvent.click(screen.getByTestId("credential-add-button"));
    fireEvent.change(screen.getByTestId("credential-type-select"), {
      target: { value: "test.apiKey" },
    });
    fireEvent.change(screen.getByTestId("credential-display-name-input"), {
      target: { value: "Draft credential" },
    });
    fireEvent.change(await screen.findByTestId("credential-secret-apiKey"), {
      target: { value: "secret-value" },
    });

    fireEvent.click(screen.getByTestId("credential-test-button"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        ApiPaths.credentialInstances(),
        expect.objectContaining({ method: "POST" }),
      );
    });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        ApiPaths.credentialInstanceTest("inst-1"),
        expect.objectContaining({ method: "POST" }),
      );
    });
    expect(await screen.findByTestId("credential-dialog-test-result")).toHaveTextContent("Healthy");
  });

  it("creates and opens OAuth2 connect from the create dialog", async () => {
    renderCredentialsScreen({
      credentialTypes: [oauthCredentialType],
      credentialInstances: [],
    });

    const windowOpenMock = vi.mocked(window.open);
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === ApiPaths.oauth2RedirectUri()) {
        return {
          ok: true,
          json: async () => ({ redirectUri: "http://localhost:3000/api/oauth2/callback" }),
        };
      }
      if (url === ApiPaths.credentialInstances() && init?.method === "POST") {
        return {
          ok: true,
          json: async () => ({
            ...oauthCredentialInstance,
            oauth2Connection: {
              status: "disconnected" as const,
              providerId: "google",
              scopes: ["scope.one"],
            },
          }),
        };
      }
      return {
        ok: true,
        json: async () => [],
      };
    });

    fireEvent.click(screen.getByTestId("credential-add-button"));
    fireEvent.change(screen.getByTestId("credential-type-select"), {
      target: { value: "test.oauth" },
    });
    fireEvent.change(screen.getByTestId("credential-display-name-input"), {
      target: { value: "OAuth draft" },
    });
    fireEvent.change(await screen.findByTestId("credential-public-clientId"), {
      target: { value: "client-id-123" },
    });
    fireEvent.click(screen.getByTestId("credential-show-secrets-toggle"));
    fireEvent.change(await screen.findByTestId("credential-secret-clientSecret"), {
      target: { value: "client-secret-123" },
    });

    fireEvent.click(screen.getByTestId("credential-oauth2-connect-button"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        ApiPaths.credentialInstances(),
        expect.objectContaining({ method: "POST" }),
      );
    });
    await waitFor(() => {
      expect(windowOpenMock).toHaveBeenCalledWith(
        ApiPaths.oauth2Auth("oauth-inst-1"),
        "codemation-oauth2-oauth-inst-1",
        "popup=yes,width=640,height=760",
      );
    });
  });

  it("creates and tests an OAuth2 credential from the create dialog", async () => {
    renderCredentialsScreen({
      credentialTypes: [oauthCredentialType],
      credentialInstances: [],
    });

    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === ApiPaths.oauth2RedirectUri()) {
        return {
          ok: true,
          json: async () => ({ redirectUri: "http://localhost:3000/api/oauth2/callback" }),
        };
      }
      if (url === ApiPaths.credentialInstances() && init?.method === "POST") {
        return {
          ok: true,
          json: async () => oauthCredentialInstance,
        };
      }
      if (url === ApiPaths.credentialInstanceTest("oauth-inst-1") && init?.method === "POST") {
        return {
          ok: true,
          text: async () => JSON.stringify({ status: "healthy", message: "OAuth credential is healthy." }),
        };
      }
      return {
        ok: true,
        json: async () => [],
      };
    });

    fireEvent.click(screen.getByTestId("credential-add-button"));
    fireEvent.change(screen.getByTestId("credential-type-select"), {
      target: { value: "test.oauth" },
    });
    fireEvent.change(screen.getByTestId("credential-display-name-input"), {
      target: { value: "OAuth draft" },
    });
    fireEvent.change(await screen.findByTestId("credential-public-clientId"), {
      target: { value: "client-id-123" },
    });
    fireEvent.click(screen.getByTestId("credential-show-secrets-toggle"));
    fireEvent.change(await screen.findByTestId("credential-secret-clientSecret"), {
      target: { value: "client-secret-123" },
    });

    fireEvent.click(screen.getByTestId("credential-test-button"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        ApiPaths.credentialInstanceTest("oauth-inst-1"),
        expect.objectContaining({ method: "POST" }),
      );
    });
    expect(await screen.findByTestId("credential-dialog-test-result")).toHaveTextContent("Healthy");
  });

  it("opens an in-app delete confirmation and cancels without calling DELETE", async () => {
    let instancesPayload: CredentialInstanceDto[] = [credentialInstance];
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : String(input);
      const method = init?.method ?? "GET";
      const path = url.split("?")[0] ?? url;
      if (method === "GET" && path === ApiPaths.credentialInstances()) {
        return Promise.resolve({ ok: true, json: async () => instancesPayload });
      }
      if (method === "GET" && path === ApiPaths.credentialTypes()) {
        return Promise.resolve({ ok: true, json: async () => [credentialType] });
      }
      return Promise.reject(new Error(`Unhandled fetch: ${method} ${url}`));
    });

    renderCredentialsScreen();

    await screen.findByTestId("credential-instance-row-inst-1");

    fireEvent.click(screen.getByTestId("credential-instance-delete-button-inst-1"));

    const dialog = await screen.findByTestId("credential-delete-confirm-dialog");
    expect(dialog).toHaveTextContent("My test credential");

    fireEvent.click(screen.getByTestId("credential-delete-confirm-cancel"));

    await waitFor(() => {
      expect(screen.queryByTestId("credential-delete-confirm-dialog")).not.toBeInTheDocument();
    });

    const deleteCalls = fetchMock.mock.calls.filter(([, options]) => (options as RequestInit)?.method === "DELETE");
    expect(deleteCalls).toHaveLength(0);
  });

  it("deletes a credential after confirming the in-app dialog", async () => {
    let instancesPayload: CredentialInstanceDto[] = [credentialInstance];
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : String(input);
      const method = init?.method ?? "GET";
      const path = url.split("?")[0] ?? url;
      if (method === "DELETE" && path === ApiPaths.credentialInstance("inst-1")) {
        instancesPayload = [];
        return Promise.resolve({ ok: true, text: async () => "" });
      }
      if (method === "GET" && path === ApiPaths.credentialInstances()) {
        return Promise.resolve({ ok: true, json: async () => instancesPayload });
      }
      if (method === "GET" && path === ApiPaths.credentialTypes()) {
        return Promise.resolve({ ok: true, json: async () => [credentialType] });
      }
      return Promise.reject(new Error(`Unhandled fetch: ${method} ${url}`));
    });

    renderCredentialsScreen();

    await screen.findByTestId("credential-instance-row-inst-1");

    fireEvent.click(screen.getByTestId("credential-instance-delete-button-inst-1"));
    await screen.findByTestId("credential-delete-confirm-dialog");
    fireEvent.click(screen.getByTestId("credential-delete-confirm-delete"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        ApiPaths.credentialInstance("inst-1"),
        expect.objectContaining({ method: "DELETE" }),
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId("credentials-empty")).toBeInTheDocument();
    });
  });
});
