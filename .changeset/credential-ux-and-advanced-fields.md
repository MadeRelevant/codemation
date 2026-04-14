---
"@codemation/core": minor
"@codemation/next-host": patch
"@codemation/core-nodes-gmail": patch
"@codemation/host": patch
"@codemation/agent-skills": patch
---

Improve credential UX and add extensible advanced field presentation.

- Run automatic credential health tests after create/save (including OAuth) and keep the dialog open when the test fails; auto-bind newly created credentials to empty workflow slots.
- Add `CredentialFieldSchema.visibility` (`default` | `advanced`) and `CredentialTypeDefinition.advancedSection` so credential types can group fields in a collapsible section; Next host renders them with stable test ids.
- Gmail OAuth: group Client ID with Client secret, move scope preset and custom scopes under an **OAuth scopes** advanced section (collapsed by default).
- Documentation: `packages/core/docs/credential-ui-fields.md`, AGENTS.md, and credential development skill reference.
