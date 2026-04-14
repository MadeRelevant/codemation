// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { CredentialDialogFieldRows } from "../../src/features/credentials/components/CredentialDialogFieldRows";
import { installCredentialsJsdomPolyfills } from "./credentialsJsdomPolyfills";
import { testPublicOrderedField } from "./factories/credentialUiTestFactories";

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
});
