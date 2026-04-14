// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import type { CredentialInstanceDto } from "../../src/features/workflows/hooks/realtime/realtime";
import { CredentialDialog } from "../../src/features/credentials/components/CredentialDialog";
import type { CredentialDialogProps } from "../../src/features/credentials/components/CredentialDialog";
import type { FormSourceKind } from "../../src/features/credentials/lib/credentialFormTypes";
import { installCredentialsJsdomPolyfills } from "./credentialsJsdomPolyfills";
import { testCredentialInstanceDto, testCredentialTypeDefinition } from "./factories/credentialUiTestFactories";

installCredentialsJsdomPolyfills();

function CredentialDialogHarness(
  args: Readonly<{
    mode: "create" | "edit";
    credentialTypes: CredentialDialogProps["credentialTypes"];
    selectedTypeIdInitial?: string;
    editingInstance?: CredentialInstanceDto | null;
  }>,
) {
  const [selectedTypeId, setSelectedTypeId] = useState(args.selectedTypeIdInitial ?? "");
  const [displayName, setDisplayName] = useState("My credential");
  const [sourceKind, setSourceKind] = useState<FormSourceKind>("db");
  const [publicFieldValues, setPublicFieldValues] = useState<Record<string, string>>({ clientId: "x" });
  const [secretFieldValues, setSecretFieldValues] = useState<Record<string, string>>({ token: "secret" });
  const [envRefValues, setEnvRefValues] = useState<Record<string, string>>({});
  const [showSecrets, setShowSecrets] = useState(true);

  return (
    <CredentialDialog
      mode={args.mode}
      credentialTypes={args.credentialTypes}
      typesLoading={false}
      typesError={false}
      typesEmpty={args.credentialTypes.length === 0}
      selectedTypeId={selectedTypeId}
      setSelectedTypeId={setSelectedTypeId}
      displayName={displayName}
      setDisplayName={setDisplayName}
      sourceKind={sourceKind}
      setSourceKind={setSourceKind}
      publicFieldValues={publicFieldValues}
      setPublicFieldValues={setPublicFieldValues}
      secretFieldValues={secretFieldValues}
      setSecretFieldValues={setSecretFieldValues}
      envRefValues={envRefValues}
      setEnvRefValues={setEnvRefValues}
      showSecrets={showSecrets}
      setShowSecrets={setShowSecrets}
      oauth2RedirectUri=""
      isLoadingOauth2RedirectUri={false}
      secretsLoading={false}
      editingInstance={args.mode === "edit" ? (args.editingInstance ?? null) : undefined}
      errorMessage={null}
      dialogTestResult={null}
      isSubmitting={false}
      isDialogTesting={false}
      onCreate={async () => {}}
      onUpdate={async () => {}}
      onTest={async () => {}}
      onConnectOAuth2={async () => {}}
      onDisconnectOAuth2={() => {}}
      onClose={() => {}}
      credentialFieldEnvStatus={{}}
    />
  );
}

describe("CredentialDialog", () => {
  const apiKeyType = testCredentialTypeDefinition({
    typeId: "api-key",
    displayName: "API Key",
  });

  const oauthWithAdvanced = testCredentialTypeDefinition({
    typeId: "oauth-ui",
    displayName: "OAuth UI",
    publicFields: [
      { key: "clientId", label: "Client ID", type: "string", required: true, order: 0 },
      {
        key: "scopes",
        label: "Scopes",
        type: "string",
        visibility: "advanced",
        order: 1,
      },
    ],
    secretFields: [],
    advancedSection: { title: "OAuth scopes", defaultOpen: true },
  });

  it("shows the credential type display name as the dialog title in edit mode and hides the type dropdown", () => {
    const instance = testCredentialInstanceDto({
      instanceId: "i-1",
      typeId: "api-key",
      displayName: "Prod key",
    });

    render(<CredentialDialogHarness mode="edit" credentialTypes={[apiKeyType]} editingInstance={instance} />);

    expect(screen.getByRole("heading", { name: "API Key" })).toBeInTheDocument();
    expect(screen.queryByTestId("credential-type-select")).not.toBeInTheDocument();
  });

  it("shows Add {type} as the title when creating with a selected type", () => {
    render(<CredentialDialogHarness mode="create" credentialTypes={[apiKeyType]} selectedTypeIdInitial="api-key" />);

    expect(screen.getByRole("heading", { name: "Add API Key" })).toBeInTheDocument();
    expect(screen.getByTestId("credential-type-select")).toBeInTheDocument();
  });

  it("shows a generic Add credential title when no type is selected yet", () => {
    render(<CredentialDialogHarness mode="create" credentialTypes={[apiKeyType]} selectedTypeIdInitial="" />);

    expect(screen.getByRole("heading", { name: "Add credential" })).toBeInTheDocument();
  });

  it("renders advanced fields inside the collapsible region for types that declare them", () => {
    render(
      <CredentialDialogHarness mode="create" credentialTypes={[oauthWithAdvanced]} selectedTypeIdInitial="oauth-ui" />,
    );

    expect(screen.getByTestId("credential-advanced-section-trigger")).toHaveTextContent("OAuth scopes");
    expect(screen.getByTestId("credential-public-scopes")).toBeInTheDocument();
  });
});
