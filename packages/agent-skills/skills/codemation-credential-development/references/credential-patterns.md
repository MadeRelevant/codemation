# Credential Patterns

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
