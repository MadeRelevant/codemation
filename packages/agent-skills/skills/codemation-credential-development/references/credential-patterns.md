# Credential Patterns

## Node id and binding stability

A credential binding is stored as `(workflowId, nodeId, slotKey)`. The `nodeId` for each workflow node defaults to a slug of its `name` label. Changing the label changes the id, and the previously configured binding appears unbound.

For production workflows with credential-using nodes, prefer an explicit `id:` on the node config:

```ts
.node("Fetch from API", MyApiNodeConfig, {
  id: "fetch-from-api", // stable across label renames
  credentials: { apiKey: myApiCredential },
})
```

Without an explicit `id:`, keep the node's label constant or plan to re-bind after a rename.

## Standard shape

Use `defineCredential(...)` to declare:

- `key`
- `label`
- optional `description`
- `public` fields
- `secret` fields
- `createSession(...)`
- `test(...)`

## Registration

Register the credential type from the app or plugin boundary:

- `defineCodemationApp({ credentials: [...] })`
- `definePlugin({ credentials: [...] })`

## Node slots

Helper-defined nodes can request credentials directly:

```ts
credentials: {
  myService: myServiceCredential,
}
```

Then the runtime can supply a typed session through the named slot.

## Advanced fields in the credential dialog

Optional or power-user fields (for example custom OAuth scopes) can be tucked behind a single collapsible section:

- Set `visibility: "advanced"` on each relevant `CredentialFieldSchema` entry in `publicFields` / `secretFields`.
- Optionally set `advancedSection: { title?, description?, defaultOpen? }` on `CredentialTypeDefinition` to customize the collapsible header (if omitted, the UI still wraps advanced fields in a collapsed section titled **Advanced**).

See **`packages/core/docs/credential-ui-fields.md`** in the repository root layout.

## OAuth2 credentials (URL-template variant)

For credentials that go through the OAuth2 redirect flow (Microsoft Graph, Slack, GitHub, Notion, etc.), declare the authorize and token URLs directly on the credential's `auth` definition. The host's `OAuth2ProviderRegistry` substitutes `{publicFieldKey}` placeholders from the credential's public config at connect time (URL-encoded).

```ts
auth: {
  kind: "oauth2",
  // providerId is a free-form label for telemetry / DB rows / Better Auth provider naming.
  // It is NOT used for any registry lookup — URLs come from the fields below.
  providerId: "microsoft",
  authorizeUrl: "https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/authorize",
  tokenUrl: "https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token",
  scopes: ["openid", "offline_access", "User.Read", "Mail.Read"],
},
```

Three `auth` variants exist:

1. **URL-template (preferred for new plugins).** Carries `authorizeUrl` / `tokenUrl` / optional `userInfoUrl` directly with `{fieldKey}` substitution. Self-contained — adding a new provider needs no core or host edits.
2. **Built-in `providerId` shortcut.** Only `google` is recognized; kept for backwards compatibility. Do not add new providers here.
3. **`providerFromPublicConfig`.** URLs read verbatim from public field values at runtime. Rare; the template variant covers almost every real case more ergonomically.

Notes for plugin authors:

- Host stores post-callback OAuth material with snake_case keys (`access_token`, `refresh_token`, `expiry`, `scope`, `token_type`). Read those keys inside `createSession` / `test`, NOT camelCase.
- The redirect URI returned to providers rewrites loopback IPs (`127.0.0.1`, `[::1]`) to `localhost` so Azure AD (AADSTS50011) and other providers with the same restriction accept it.
- The default `Mail.Read` (and similar single-mailbox) Microsoft scopes only cover the credential owner. To monitor a shared mailbox via `/users/{upn}/...`, request `Mail.Read.Shared` (delegated) or admin-consented application permissions.

## Health and activation

- deploy the workflow and credential type
- configure a concrete credential instance in the UI
- run the credential test until it is healthy
- activate the workflow only when the required slots can resolve correctly

## When to drop lower

Reach for lower-level credential APIs when:

- a class-based node already needs the explicit runtime contract
- you need advanced host registry behavior
- helper-based declarations are no longer expressive enough
