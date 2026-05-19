// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CredentialDialogFormSections } from "../../src/features/credentials/components/CredentialDialogFormSections";
import { installCredentialsJsdomPolyfills } from "./credentialsJsdomPolyfills";
import { testCredentialInstanceDto, testCredentialTypeDefinition } from "./factories/credentialUiTestFactories";

installCredentialsJsdomPolyfills();

/** Minimal set of props that satisfy CredentialDialogFormSections for an OAuth2 create flow. */
function makeOAuth2CreateProps(overrides: Partial<Parameters<typeof CredentialDialogFormSections>[0]> = {}) {
  return {
    credentialTypes: [],
    typesLoading: false,
    typesError: false,
    typesEmpty: false,
    selectedTypeId: "gmail-oauth",
    setSelectedTypeId: vi.fn(),
    displayName: "My Gmail",
    setDisplayName: vi.fn(),
    sourceKind: "db" as const,
    setSourceKind: vi.fn(),
    isEdit: false,
    isTypeLocked: false,
    canToggleSecrets: false,
    showSecrets: false,
    setShowSecrets: vi.fn(),
    secretsLoading: false,
    isOAuth2Type: true,
    oauth2RedirectUri: "https://app.example.com/callback",
    isLoadingOauth2RedirectUri: false,
    editingInstance: undefined,
    canSubmit: true,
    onConnectOAuth2: vi.fn().mockResolvedValue(undefined),
    onDisconnectOAuth2: vi.fn(),
    ...overrides,
  };
}

describe("CredentialDialogFormSections — type selector states", () => {
  it("shows Loading… text when typesLoading is true", () => {
    render(
      <CredentialDialogFormSections
        {...makeOAuth2CreateProps({ isOAuth2Type: false, typesLoading: true, isTypeLocked: false })}
      />,
    );

    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("shows error text when typesError is true", () => {
    render(
      <CredentialDialogFormSections
        {...makeOAuth2CreateProps({ isOAuth2Type: false, typesError: true, isTypeLocked: false })}
      />,
    );

    expect(screen.getByText("Failed to load credential types.")).toBeInTheDocument();
  });

  it("shows 'No credential types available' when !loading, !error and typesEmpty", () => {
    render(
      <CredentialDialogFormSections
        {...makeOAuth2CreateProps({ isOAuth2Type: false, typesEmpty: true, isTypeLocked: false })}
      />,
    );

    expect(screen.getByText("No credential types available.")).toBeInTheDocument();
  });

  it("hides the type dropdown when isTypeLocked is true", () => {
    render(<CredentialDialogFormSections {...makeOAuth2CreateProps({ isOAuth2Type: false, isTypeLocked: true })} />);

    expect(screen.queryByTestId("credential-type-select")).not.toBeInTheDocument();
  });

  it("shows the source-kind selector in create mode and hides it in edit mode", () => {
    const { rerender } = render(
      <CredentialDialogFormSections {...makeOAuth2CreateProps({ isOAuth2Type: false, isEdit: false })} />,
    );

    expect(screen.getByTestId("credential-source-kind-select")).toBeInTheDocument();

    rerender(<CredentialDialogFormSections {...makeOAuth2CreateProps({ isOAuth2Type: false, isEdit: true })} />);

    expect(screen.queryByTestId("credential-source-kind-select")).not.toBeInTheDocument();
  });
});

describe("CredentialDialogFormSections — OAuth2 block", () => {
  it("renders the redirect URI input and copy button in the create flow", () => {
    render(<CredentialDialogFormSections {...makeOAuth2CreateProps()} />);

    const uriInput = screen.getByTestId("credential-oauth2-redirect-uri");
    expect(uriInput).toBeInTheDocument();
    expect(uriInput).toHaveValue("https://app.example.com/callback");

    expect(screen.getByTestId("credential-oauth2-redirect-uri-copy")).toBeInTheDocument();
  });

  it("shows 'Loading redirect URI…' while isLoadingOauth2RedirectUri is true", () => {
    render(<CredentialDialogFormSections {...makeOAuth2CreateProps({ isLoadingOauth2RedirectUri: true })} />);

    expect(screen.getByText("Loading redirect URI…")).toBeInTheDocument();
    expect(screen.queryByTestId("credential-oauth2-redirect-uri")).not.toBeInTheDocument();
  });

  it("shows 'Create and connect' button in create mode and it is enabled when canSubmit is true", () => {
    render(<CredentialDialogFormSections {...makeOAuth2CreateProps({ canSubmit: true })} />);

    const connectBtn = screen.getByTestId("credential-oauth2-connect-button");
    expect(connectBtn).toHaveTextContent("Create and connect");
    expect(connectBtn).not.toBeDisabled();
  });

  it("disables 'Create and connect' when canSubmit is false in create mode", () => {
    render(<CredentialDialogFormSections {...makeOAuth2CreateProps({ canSubmit: false })} />);

    expect(screen.getByTestId("credential-oauth2-connect-button")).toBeDisabled();
  });

  it("does not render the disconnect button in create mode", () => {
    render(<CredentialDialogFormSections {...makeOAuth2CreateProps()} />);

    expect(screen.queryByTestId("credential-oauth2-disconnect-button")).not.toBeInTheDocument();
  });

  it("calls onConnectOAuth2 when the connect button is clicked", () => {
    const onConnectOAuth2 = vi.fn().mockResolvedValue(undefined);
    render(<CredentialDialogFormSections {...makeOAuth2CreateProps({ onConnectOAuth2 })} />);

    fireEvent.click(screen.getByTestId("credential-oauth2-connect-button"));

    expect(onConnectOAuth2).toHaveBeenCalledTimes(1);
  });

  it("shows 'Connect' button in edit mode when instance is not connected", () => {
    const instance = testCredentialInstanceDto({ instanceId: "i-1", typeId: "gmail-oauth" });
    render(<CredentialDialogFormSections {...makeOAuth2CreateProps({ isEdit: true, editingInstance: instance })} />);

    const connectBtn = screen.getByTestId("credential-oauth2-connect-button");
    expect(connectBtn).toHaveTextContent("Connect");
    expect(connectBtn).not.toBeDisabled();
  });

  it("shows 'Reconnect' button and enabled 'Disconnect' when instance is connected", () => {
    const connected = testCredentialInstanceDto({
      instanceId: "i-2",
      typeId: "gmail-oauth",
      oauth2Connection: { status: "connected", providerId: "google", scopes: [], connectedEmail: "user@example.com" },
    });
    render(<CredentialDialogFormSections {...makeOAuth2CreateProps({ isEdit: true, editingInstance: connected })} />);

    expect(screen.getByTestId("credential-oauth2-connect-button")).toHaveTextContent("Reconnect");

    const disconnectBtn = screen.getByTestId("credential-oauth2-disconnect-button");
    expect(disconnectBtn).toHaveTextContent("Disconnect");
    expect(disconnectBtn).not.toBeDisabled();
  });

  it("shows connected status text when oauth2 connection is connected", () => {
    const connected = testCredentialInstanceDto({
      instanceId: "i-3",
      typeId: "gmail-oauth",
      oauth2Connection: { status: "connected", providerId: "google", scopes: [], connectedEmail: "admin@example.com" },
    });
    render(<CredentialDialogFormSections {...makeOAuth2CreateProps({ isEdit: true, editingInstance: connected })} />);

    const status = screen.getByTestId("credential-oauth2-connected-status");
    expect(status).toHaveTextContent("Connected as admin@example.com");
  });

  it("disables 'Disconnect' when instance is not connected in edit mode", () => {
    const notConnected = testCredentialInstanceDto({
      instanceId: "i-4",
      typeId: "gmail-oauth",
      oauth2Connection: { status: "disconnected", providerId: "google", scopes: [] },
    });
    render(
      <CredentialDialogFormSections {...makeOAuth2CreateProps({ isEdit: true, editingInstance: notConnected })} />,
    );

    expect(screen.getByTestId("credential-oauth2-disconnect-button")).toBeDisabled();
  });

  it("calls onDisconnectOAuth2 when Disconnect is clicked", () => {
    const onDisconnectOAuth2 = vi.fn();
    const connected = testCredentialInstanceDto({
      instanceId: "i-5",
      typeId: "gmail-oauth",
      oauth2Connection: { status: "connected", providerId: "google", scopes: [] },
    });
    render(
      <CredentialDialogFormSections
        {...makeOAuth2CreateProps({ isEdit: true, editingInstance: connected, onDisconnectOAuth2 })}
      />,
    );

    fireEvent.click(screen.getByTestId("credential-oauth2-disconnect-button"));

    expect(onDisconnectOAuth2).toHaveBeenCalledTimes(1);
  });

  it("does not render OAuth2 block when isOAuth2Type is false", () => {
    render(<CredentialDialogFormSections {...makeOAuth2CreateProps({ isOAuth2Type: false })} />);

    expect(screen.queryByTestId("credential-oauth2-redirect-uri")).not.toBeInTheDocument();
    expect(screen.queryByTestId("credential-oauth2-connect-button")).not.toBeInTheDocument();
  });
});

describe("CredentialDialogFormSections — event handler coverage", () => {
  it("calls setDisplayName when the display name input changes", () => {
    const setDisplayName = vi.fn();
    render(<CredentialDialogFormSections {...makeOAuth2CreateProps({ setDisplayName, isOAuth2Type: false })} />);

    const input = screen.getByTestId("credential-display-name-input");
    fireEvent.change(input, { target: { value: "New name" } });

    expect(setDisplayName).toHaveBeenCalledWith("New name");
  });

  it("calls setSelectedTypeId when a credential type is selected from the dropdown", async () => {
    const setSelectedTypeId = vi.fn();
    const types = [testCredentialTypeDefinition({ typeId: "api-key", displayName: "API Key" })];

    render(
      <CredentialDialogFormSections
        {...makeOAuth2CreateProps({
          credentialTypes: types,
          isOAuth2Type: false,
          selectedTypeId: "",
          setSelectedTypeId,
        })}
      />,
    );

    // Open the select dropdown.
    fireEvent.click(screen.getByTestId("credential-type-select"));

    // After the click the SelectContent portal should render its items.
    const option = await screen.findByText("API Key");
    fireEvent.click(option);

    await waitFor(() => {
      expect(setSelectedTypeId).toHaveBeenCalledWith("api-key");
    });
  });

  it("calls setSourceKind when the source-kind select changes", async () => {
    const setSourceKind = vi.fn();
    render(
      <CredentialDialogFormSections
        {...makeOAuth2CreateProps({ isOAuth2Type: false, isEdit: false, setSourceKind, sourceKind: "db" })}
      />,
    );

    // Open the source kind select.
    fireEvent.click(screen.getByTestId("credential-source-kind-select"));

    // Click the "env" option.
    const envOption = await screen.findByText("Load from environment variables");
    fireEvent.click(envOption);

    await waitFor(() => {
      expect(setSourceKind).toHaveBeenCalledWith("env");
    });
  });

  it("toggles show/hide secrets when canToggleSecrets is true and the toggle button is clicked", () => {
    const setShowSecrets = vi.fn();
    render(
      <CredentialDialogFormSections
        {...makeOAuth2CreateProps({
          isOAuth2Type: false,
          canToggleSecrets: true,
          showSecrets: false,
          setShowSecrets,
        })}
      />,
    );

    const toggle = screen.getByTestId("credential-show-secrets-toggle");
    expect(toggle).toHaveTextContent("Show values");

    act(() => {
      fireEvent.click(toggle);
    });

    // setShowSecrets should be called with a function that inverts the boolean.
    expect(setShowSecrets).toHaveBeenCalledTimes(1);
    const updater = setShowSecrets.mock.calls[0][0] as (prev: boolean) => boolean;
    expect(updater(false)).toBe(true);
    expect(updater(true)).toBe(false);
  });

  it("disables the secrets toggle in edit mode while secretsLoading is true", () => {
    render(
      <CredentialDialogFormSections
        {...makeOAuth2CreateProps({
          isOAuth2Type: false,
          canToggleSecrets: true,
          isEdit: true,
          secretsLoading: true,
        })}
      />,
    );

    expect(screen.getByTestId("credential-show-secrets-toggle")).toBeDisabled();
    expect(screen.getByText("Loading credential…")).toBeInTheDocument();
  });

  it("shows 'Hide values' label when showSecrets is true", () => {
    render(
      <CredentialDialogFormSections
        {...makeOAuth2CreateProps({
          isOAuth2Type: false,
          canToggleSecrets: true,
          showSecrets: true,
        })}
      />,
    );

    expect(screen.getByTestId("credential-show-secrets-toggle")).toHaveTextContent("Hide values");
  });
});
