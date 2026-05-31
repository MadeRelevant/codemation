/**
 * @description Define a custom API-key credential type via defineCredential — public config,
 * secret material, and a test() that validates the key against the real endpoint before
 * activation. The credential is then used by an HttpRequest node against a protected endpoint.
 * test() runs on connect: it must return { status: "healthy" } before the workflow can activate.
 * Model for any API-key or header-token credential type.
 * @tags defineCredential credential api-key http test auth style:node
 * @uses defineCredential, node:HttpRequest, credential:weather-api-key
 * @dependencies @codemation/core@workspace:*, @codemation/core-nodes@workspace:*
 */

import { workflow } from "@codemation/host";
import { defineCredential } from "@codemation/core";
import { HttpRequest, CredentialSession, HttpCredentialDelta } from "@codemation/core-nodes";

// ----- Step 1: Define the credential type -----
//
// defineCredential declares:
//   - `public`  — operator-visible config (e.g. base URL, key name, preference flags)
//   - `secret`  — encrypted material (e.g. tokens, passwords)
//   - `createSession(args)` — returns the typed object that nodes consume at runtime
//   - `test(args)` — called on credential "Connect" and before workflow activation;
//                    must return { status: "healthy" | "failing", message, testedAt }
//
// Register the credential type via defineCodemationApp({ credentials: [...] }) or
// definePlugin({ credentials: [...] }) — NOT inside workflow files.
export const weatherApiKeyCredentialType = defineCredential({
  key: "example.weather-api-key",
  label: "Weather API Key",
  description: "API key for the Open-Meteo demo endpoint. Injects the key as an Authorization header.",
  public: {
    keyHeader: {
      label: "Header name",
      type: "string" as const,
      helpText: 'HTTP header to inject the key into. Defaults to "X-Api-Key".',
      placeholder: "X-Api-Key",
    },
  },
  secret: {
    apiKey: {
      label: "API Key",
      type: "password" as const,
      required: true,
      helpText: "The secret API key value.",
    },
  },
  // createSession returns the typed object the node's credential slot resolves.
  // For HttpRequest, return { applyToRequest } — the framework calls it to derive
  // the HttpCredentialDelta (extra headers / query params to merge into the request).
  createSession(args): CredentialSession {
    const apiKey = String(args.material.apiKey ?? "");
    const headerName = String(args.publicConfig.keyHeader ?? "X-Api-Key").trim() || "X-Api-Key";
    return {
      applyToRequest: (_spec): HttpCredentialDelta => ({
        headers: { [headerName]: apiKey },
      }),
    };
  },
  // test() is called when the operator clicks "Connect" in the credential dialog and again
  // before a workflow activates. Return "failing" to block activation with a clear message.
  // Use it to make a cheap probe against the real endpoint — e.g. a lightweight /health call.
  async test(args) {
    const apiKey = String(args.material.apiKey ?? "").trim();
    if (!apiKey) {
      return {
        status: "failing",
        message: "API key is empty — enter a key value and try again.",
        testedAt: new Date().toISOString(),
      };
    }
    // Probe the endpoint to confirm the key is accepted.
    // Open-Meteo's /v1/forecast returns 200 for valid keys; 401 for invalid.
    // Replace this with the actual auth-test endpoint for your API.
    try {
      const resp = await fetch(
        "https://api.open-meteo.com/v1/forecast?latitude=52.37&longitude=4.89&current=temperature_2m",
        {
          headers: { "X-Api-Key": apiKey },
        },
      );
      if (resp.status === 401 || resp.status === 403) {
        return {
          status: "failing",
          message: `API returned ${resp.status} — key is invalid.`,
          testedAt: new Date().toISOString(),
        };
      }
      return { status: "healthy", message: "API key accepted.", testedAt: new Date().toISOString() };
    } catch (err) {
      return {
        status: "failing",
        message: `Probe request failed: ${err instanceof Error ? err.message : String(err)}`,
        testedAt: new Date().toISOString(),
      };
    }
  },
});

// ----- Step 2: Use the credential in a workflow -----
//
// Wire the credential slot via credentialSlot on HttpRequest.
// The framework resolves the bound credential instance at execution time and calls
// applyToRequest() to merge the delta into the outgoing request headers.
export default workflow("example.define-credential-api-key")
  .name("defineCredential: API-key type + test() + HttpRequest")
  .manualTrigger<unknown>("Fetch weather", [{}])
  .then(
    new HttpRequest("Fetch current temperature", {
      method: "GET",
      url: "https://api.open-meteo.com/v1/forecast?latitude=52.37&longitude=4.89&current=temperature_2m",
      // credentialSlot wires the custom credential type defined above.
      // The framework only offers instances of weatherApiKeyCredentialType in the UI picker.
      // Bind an instance in the canvas (Credentials tab) before activating.
      credentialSlot: { name: "apiKey", acceptedTypes: [weatherApiKeyCredentialType] },
    }),
  )
  .build();
