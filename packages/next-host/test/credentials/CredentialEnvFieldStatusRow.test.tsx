// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CredentialEnvFieldStatusRow } from "../../src/features/credentials/components/CredentialEnvFieldStatusRow";
import { installCredentialsJsdomPolyfills } from "./credentialsJsdomPolyfills";

installCredentialsJsdomPolyfills();

describe("CredentialEnvFieldStatusRow", () => {
  it("managed variant shows the env var name and correct testid", () => {
    render(<CredentialEnvFieldStatusRow kind="managed" envVarName="GMAIL_TOKEN" fieldKey="token" />);

    const row = screen.getByTestId("credential-field-env-managed-token");
    expect(row).toBeInTheDocument();
    expect(row).toHaveTextContent("GMAIL_TOKEN");
    expect(row).toHaveTextContent("Managed by env");
  });

  it("managed variant renders the icon with the correct aria-label", () => {
    render(<CredentialEnvFieldStatusRow kind="managed" envVarName="GMAIL_TOKEN" fieldKey="token" />);

    // The tooltip anchor carries the aria-label on the wrapper element.
    expect(screen.getByLabelText("Host environment configured")).toBeInTheDocument();
  });

  it("missing variant shows the env var name and correct testid", () => {
    render(<CredentialEnvFieldStatusRow kind="missing" envVarName="GMAIL_API_KEY" fieldKey="apiKey" />);

    const row = screen.getByTestId("credential-field-env-missing-apiKey");
    expect(row).toBeInTheDocument();
    expect(row).toHaveTextContent("GMAIL_API_KEY");
    expect(row).toHaveTextContent("Tip:");
  });

  it("missing variant renders the icon with the correct aria-label", () => {
    render(<CredentialEnvFieldStatusRow kind="missing" envVarName="GMAIL_API_KEY" fieldKey="apiKey" />);

    expect(screen.getByLabelText("Host environment override available")).toBeInTheDocument();
  });
});
