// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { CredentialDialogFieldRows } from "../../src/features/credentials/components/CredentialDialogFieldRows";
import { installCredentialsJsdomPolyfills } from "./credentialsJsdomPolyfills";
import { testPublicOrderedField, testSecretOrderedField } from "./factories/credentialUiTestFactories";

installCredentialsJsdomPolyfills();

function FieldRowsHarness(args: Readonly<{ advancedSection: Readonly<{ title?: string; defaultOpen?: boolean }> }>) {
  const [publicFieldValues, setPublicFieldValues] = useState<Record<string, string>>({
    clientId: "cid",
    customScopes: "",
  });
  const [secretFieldValues, setSecretFieldValues] = useState<Record<string, string>>({});
  const [envRefValues, setEnvRefValues] = useState<Record<string, string>>({});

  const orderedFields = [
    testPublicOrderedField({ key: "clientId", label: "Client ID", type: "string", required: true, order: 0 }, 0),
    testPublicOrderedField(
      {
        key: "customScopes",
        label: "Custom scopes",
        type: "textarea",
        visibility: "advanced",
        order: 1,
      },
      1,
    ),
  ];

  return (
    <CredentialDialogFieldRows
      orderedFields={orderedFields}
      advancedSection={args.advancedSection}
      publicFieldValues={publicFieldValues}
      setPublicFieldValues={setPublicFieldValues}
      secretFieldValues={secretFieldValues}
      setSecretFieldValues={setSecretFieldValues}
      envRefValues={envRefValues}
      setEnvRefValues={setEnvRefValues}
      isEdit={false}
      isDbSecretSource
      showSecrets
      credentialFieldEnvStatus={{}}
    />
  );
}

describe("CredentialDialogFieldRows", () => {
  it("places advanced visibility fields in a collapsible with default title when advancedSection is omitted", () => {
    render(
      <CredentialDialogFieldRows
        orderedFields={[
          testPublicOrderedField({ key: "clientId", label: "Client ID", type: "string", required: true, order: 0 }, 0),
          testPublicOrderedField(
            { key: "customScopes", label: "Custom scopes", type: "textarea", visibility: "advanced", order: 1 },
            1,
          ),
        ]}
        publicFieldValues={{ clientId: "x", customScopes: "" }}
        setPublicFieldValues={() => {}}
        secretFieldValues={{}}
        setSecretFieldValues={() => {}}
        envRefValues={{}}
        setEnvRefValues={() => {}}
        isEdit={false}
        isDbSecretSource
        showSecrets
        credentialFieldEnvStatus={{}}
      />,
    );

    const trigger = screen.getByTestId("credential-advanced-section-trigger");
    expect(trigger).toHaveTextContent("Advanced");
    expect(screen.getByTestId("credential-public-clientId")).toBeInTheDocument();
  });

  it("uses advancedSection title and keeps the chevron wired for open/closed styling", () => {
    render(<FieldRowsHarness advancedSection={{ title: "OAuth scopes", defaultOpen: true }} />);

    const trigger = screen.getByTestId("credential-advanced-section-trigger");
    expect(trigger).toHaveTextContent("OAuth scopes");
    expect(trigger).toHaveClass("group");
    const svg = trigger.querySelector("svg");
    expect(svg?.getAttribute("class") ?? "").toMatch(/group-data-\[state=open\]:rotate-180/);

    expect(screen.getByTestId("credential-advanced-section")).toBeInTheDocument();
    expect(screen.getByTestId("credential-public-customScopes")).toBeInTheDocument();
  });

  it("expands the advanced section on trigger click when collapsed by default", () => {
    render(<FieldRowsHarness advancedSection={{ title: "More", defaultOpen: false }} />);

    expect(screen.queryByTestId("credential-public-customScopes")).toBeNull();

    fireEvent.click(screen.getByTestId("credential-advanced-section-trigger"));

    expect(screen.getByTestId("credential-public-customScopes")).toBeInTheDocument();
  });

  it("renders env-ref input for a secret field when isDbSecretSource is false (sourceKind=env)", () => {
    render(
      <CredentialDialogFieldRows
        orderedFields={[
          testSecretOrderedField({ key: "apiKey", label: "API key", type: "password", required: true, order: 0 }, 0),
        ]}
        publicFieldValues={{}}
        setPublicFieldValues={() => {}}
        secretFieldValues={{}}
        setSecretFieldValues={() => {}}
        envRefValues={{ apiKey: "MY_API_KEY" }}
        setEnvRefValues={() => {}}
        isEdit={false}
        isDbSecretSource={false}
        showSecrets
        credentialFieldEnvStatus={{}}
      />,
    );

    // Env-ref mode uses `credential-env-<key>` test id and renders a plain text input.
    const envInput = screen.getByTestId("credential-env-apiKey");
    expect(envInput).toBeInTheDocument();
    expect(envInput).toHaveValue("MY_API_KEY");

    // The label prefix should mention "Env var for".
    expect(screen.getByText(/Env var for API key/)).toBeInTheDocument();
  });

  it("shows leave-blank hint for secret env-ref field in edit mode", () => {
    render(
      <CredentialDialogFieldRows
        orderedFields={[
          testSecretOrderedField({ key: "token", label: "Token", type: "password", required: true, order: 0 }, 0),
        ]}
        publicFieldValues={{}}
        setPublicFieldValues={() => {}}
        secretFieldValues={{}}
        setSecretFieldValues={() => {}}
        envRefValues={{}}
        setEnvRefValues={() => {}}
        isEdit
        isDbSecretSource={false}
        showSecrets
        credentialFieldEnvStatus={{}}
      />,
    );

    expect(screen.getByText("Leave blank to keep existing value")).toBeInTheDocument();
  });

  it("falls back to alphabetical order when two fields have the same order value", () => {
    // Both fields share order=0; they should appear sorted alphabetically by key.
    render(
      <CredentialDialogFieldRows
        orderedFields={[
          testPublicOrderedField({ key: "zField", label: "Z Field", type: "string", order: 0 }, 0),
          testPublicOrderedField({ key: "aField", label: "A Field", type: "string", order: 0 }, 0),
        ]}
        publicFieldValues={{ zField: "", aField: "" }}
        setPublicFieldValues={() => {}}
        secretFieldValues={{}}
        setSecretFieldValues={() => {}}
        envRefValues={{}}
        setEnvRefValues={() => {}}
        isEdit={false}
        isDbSecretSource
        showSecrets
        credentialFieldEnvStatus={{}}
      />,
    );

    const inputs = screen.getAllByRole("textbox");
    // aField should come before zField (alphabetical tie-break).
    expect(inputs[0]).toHaveAttribute("data-testid", "credential-public-aField");
    expect(inputs[1]).toHaveAttribute("data-testid", "credential-public-zField");
  });

  it("treats a field with no order as order=0 (non-number fallback)", () => {
    // Passing `undefined` for order exercises the `fieldOrder` fallback branch.
    render(
      <CredentialDialogFieldRows
        orderedFields={[
          // Omit order from field entirely — testPublicOrderedField uses fallbackIndex=99.
          testPublicOrderedField({ key: "noOrderField", label: "No Order", type: "string" }, 99),
          testPublicOrderedField({ key: "orderedField", label: "Ordered", type: "string", order: 1 }, 0),
        ]}
        publicFieldValues={{ noOrderField: "", orderedField: "" }}
        setPublicFieldValues={() => {}}
        secretFieldValues={{}}
        setSecretFieldValues={() => {}}
        envRefValues={{}}
        setEnvRefValues={() => {}}
        isEdit={false}
        isDbSecretSource
        showSecrets
        credentialFieldEnvStatus={{}}
      />,
    );

    // noOrderField has no field.order so fieldOrder returns 0; orderedField has order=1.
    // noOrderField should appear first.
    const inputs = screen.getAllByRole("textbox");
    expect(inputs[0]).toHaveAttribute("data-testid", "credential-public-noOrderField");
    expect(inputs[1]).toHaveAttribute("data-testid", "credential-public-orderedField");
  });
});
