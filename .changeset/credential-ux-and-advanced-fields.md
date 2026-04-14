---
"@codemation/core": minor
"@codemation/next-host": patch
"@codemation/core-nodes-gmail": patch
"@codemation/host": patch
"@codemation/agent-skills": patch
---

Improve credential UX and add extensible advanced field presentation.

- Run automatic credential health tests after create/save (including OAuth) and keep the dialog open when the test fails; auto-bind newly created credentials to empty workflow slots; auto-bind when picking an existing credential from the workflow slot dropdown while the slot is unbound.
- Add `CredentialFieldSchema.visibility` (`default` | `advanced`) and optional `CredentialTypeDefinition.advancedSection` (advanced fields always render in a collapsible block; section labels default when omitted). Next host uses stable test ids and fixes collapsible chevron styling.
- Credential dialog: title uses the credential type name (e.g. **Add …** / type display name on edit); hide the redundant type dropdown in edit mode.
- Gmail OAuth: group Client ID with Client secret, move scope preset and custom scopes under an **OAuth scopes** advanced section (collapsed by default).
- Documentation: `packages/core/docs/credential-ui-fields.md`, AGENTS.md, and credential development skill reference.
