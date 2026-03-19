import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CredentialsScreen } from "../src/ui/screens/CredentialsScreen";
import { ApiPaths } from "../src/presentation/http/ApiPaths";

describe("CredentialsScreen", () => {
  const credentialType = {
    typeId: "test.apiKey",
    displayName: "Test API key",
    secretFields: [{ key: "apiKey", label: "API key", type: "password" as const, required: true }],
  };
  const credentialInstance = {
    instanceId: "inst-1",
    typeId: "test.apiKey",
    displayName: "My test credential",
    sourceKind: "db" as const,
    publicConfig: {},
    tags: [],
    setupStatus: "complete" as const,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
  const credentialWithSecrets = {
    ...credentialInstance,
    secretConfig: { apiKey: "actual-secret-value" },
  };

  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  function renderCredentialsScreen(initialData?: {
    credentialTypes?: typeof credentialType[];
    credentialInstances?: typeof credentialInstance[];
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
});
