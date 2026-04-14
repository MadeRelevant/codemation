# Credential dialog: field order and advanced fields

Credential types describe UI through `CredentialTypeDefinition` (`publicFields` / `secretFields` entries use `CredentialFieldSchema` from `@codemation/core`).

## Field order

Set optional **`order: number`** on each field. The Next host credential dialog merges public and secret fields and sorts by `order` so you can interleave them (for example Client ID and Client secret together) without relying on array order alone.

## Advanced (collapsible) fields

Use this for optional or power-user options (extra OAuth scopes, custom endpoints, etc.) so the default form stays short.

1. On each field that should live under the collapsible, set:

   ```ts
   visibility: "advanced",
   ```

   Omit `visibility` or use `"default"` for normal fields.

2. On the **`CredentialTypeDefinition`**, configure the section (only needed if you have at least one advanced field):

   ```ts
   advancedSection: {
     title: "OAuth scopes", // optional; default label is "Advanced"
     defaultOpen: false, // optional; default is collapsed
   },
   ```

All fields with `visibility: "advanced"` are rendered **in one** collapsible block, still respecting **`order`** relative to each other. Default fields and advanced fields are ordered independently in the merged list (see `CredentialDialog` + `CredentialDialogFieldRows` in `@codemation/next-host`).

## References

- Types: [`credentialTypes.ts`](../src/contracts/credentialTypes.ts) — `CredentialFieldSchema`, `CredentialAdvancedSectionPresentation`, `CredentialTypeDefinition`.
- Example: Gmail OAuth in `packages/core-nodes-gmail` (`GmailNodesRegistry`).
