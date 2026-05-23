# Credential-Aware Nodes

Load this when your node needs a typed credential (OAuth token, API key, or any `defineCredential(...)` type) injected at runtime.

## Core rule

Request credentials through **named slots** on the node config instead of hard-coding secrets. The framework resolves the slot to a live typed session at execution time.

## Adding a credential slot to `defineNode`

```ts
import { defineNode } from "@codemation/core";
import { myApiCredentialType } from "./myApiCredential.js";

export const callApiNode = defineNode({
  key: "example.call-api",
  title: "Call My API",
  credentials: {
    api: myApiCredentialType, // slot name → credential type
  },
  async execute({ input }, { credentials }) {
    const session = await credentials.api.getSession();
    // session is typed by myApiCredentialType.sessionSchema
    const response = await fetch("https://api.example.com/data", {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    return response.json();
  },
});
```

## Typed sessions

`credentials.<slot>.getSession()` returns the shape declared in the credential type's `sessionSchema`. The framework handles refresh, storage, and error propagation — your node only consumes the session.

## Testing credential-aware nodes

Supply a mock credential in `WorkflowTestKit` rather than live credentials. See `codemation-credential-development` for the full `defineCredential(...)` story, typed sessions, and credential testing patterns.
