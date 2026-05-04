---
"@codemation/core-nodes": minor
"@codemation/host": patch
"@codemation/create-codemation": patch
---

Upgrade `HttpRequest` node + ship `defineRestNode` for plugin API-wrapper nodes.

**`@codemation/core-nodes`**

- `HttpRequest` args extended with `url` (literal/templated), `headers`, `query`, `body`, and `credentialSlot`. Existing workflows using only `method` + `urlField` keep working unchanged.
- New shared HTTP engine: `HttpRequestExecutor` (single request, injected `fetch`), `HttpBodyBuilder` (JSON / form-urlencoded / multipart with binary), `HttpUrlBuilder` (query merge with arrays).
- Four generic HTTP credential types auto-registered in every Codemation app:
  - `bearerTokenCredentialType` — `Authorization: Bearer <token>`
  - `apiKeyCredentialType` — header or query-param key injection
  - `basicAuthCredentialType` — `Authorization: Basic <base64>`
  - `oauth2ClientCredentialsType` — machine-to-machine token exchange (client_credentials grant; per-session token caching)
- `defineRestNode(...)` — declarative helper wrapping `defineNode` for thin API-wrapper nodes: declare endpoint, credentials, input schema, request shape, and response mapper in one call. Path `{placeholder}` substitution from input. Configurable `errorPolicy` (`"throw"` | `"passthrough"`).

**`@codemation/host`** — auto-registers the four new credential types alongside OpenAI so they appear in the credentials UI without consumer config changes.

**`@codemation/create-codemation`** — plugin template gains an `ExampleRestNode.ts` demonstrating the `defineRestNode` pattern.
